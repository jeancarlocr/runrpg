import { randomUUID } from 'crypto'
import { sshSession } from './sshSession'
import { loadSshConfig } from './config'
import { buildFullSource, parseTableRows, REMOTE_DIR } from './rpgRunner'
import { isValidObjectName } from '../../shared/ibmiNames'
import type {
  ListSavedResult,
  LoadSavedResult,
  SavedSnippetInfo,
  SaveSnippetResult
} from '../../shared/saved-types'

const SOURCE_FILE = 'RUNRPGSRC'

function memberPath(library: string, name: string): string {
  return `/QSYS.LIB/${library}.LIB/${SOURCE_FILE}.FILE/${name}.MBR`
}

function requireLibrary(): string | { error: string } {
  const config = loadSshConfig()
  if (!config.library) {
    return { error: 'Configure a library in Preferences (Ctrl+,) first.' }
  }
  return config.library.toUpperCase()
}

async function ensureSourceFile(library: string): Promise<string | undefined> {
  const check = await sshSession.runCommand(`system "CHKOBJ OBJ(${library}/${SOURCE_FILE}) OBJTYPE(*FILE)"`)
  if (check.exitCode === 0) return undefined

  const create = await sshSession.runCommand(
    `system "CRTSRCPF FILE(${library}/${SOURCE_FILE}) RCDLEN(112) TEXT('RunRPG saved snippets')"`
  )
  if (create.exitCode !== 0) {
    return `Could not create source file ${library}/${SOURCE_FILE}: ${create.stdout || create.stderr || create.message}`
  }
  return undefined
}

/**
 * Compiles a *PGM into the configured library and stores the RAW (unwrapped)
 * snippet as a member of RUNRPGSRC. The member holds exactly what's in the
 * editor — not the runrpg_out() wrapper injected at compile time — so
 * loading it back round-trips cleanly instead of re-wrapping an
 * already-wrapped snippet. The member is written even if the compile fails,
 * so work in progress isn't lost.
 */
export async function saveRpgSnippet(name: string, sourceCode: string): Promise<SaveSnippetResult> {
  if (!isValidObjectName(name)) {
    return { ok: false, compiled: false, error: 'Name must start with a letter and be at most 10 letters/digits.' }
  }
  const pgmName = name.toUpperCase()

  const library = requireLibrary()
  if (typeof library !== 'string') {
    return { ok: false, compiled: false, error: library.error }
  }

  const sessionId = randomUUID().replace(/-/g, '').slice(0, 10)
  const rawSrcPath = `${REMOTE_DIR}/${sessionId}_raw.rpgle`
  const rawSrcPathEbcdic = `${REMOTE_DIR}/${sessionId}_raw_e.rpgle`
  const wrappedSrcPath = `${REMOTE_DIR}/${sessionId}.rpgle`
  const wrappedSrcPathEbcdic = `${REMOTE_DIR}/${sessionId}_e.rpgle`
  // Never actually written to — CALL never happens during Save — but the
  // wrapper references it, so buildFullSource still needs a path.
  const outPath = `${REMOTE_DIR}/${sessionId}.out`

  try {
    await sshSession.runCommand(`mkdir -p ${REMOTE_DIR}`)

    await sshSession.uploadText(rawSrcPath, sourceCode)
    const rawTranscode = await sshSession.runCommand(
      `iconv -f UTF-8 -t IBM-037 ${rawSrcPath} > ${rawSrcPathEbcdic} && setccsid 37 ${rawSrcPathEbcdic}`
    )
    if (!rawTranscode.ok || rawTranscode.exitCode !== 0) {
      return {
        ok: false,
        compiled: false,
        error: `Could not prepare the source file: ${rawTranscode.stderr || rawTranscode.message}`
      }
    }

    const fileError = await ensureSourceFile(library)
    if (fileError) {
      return { ok: false, compiled: false, error: fileError }
    }

    const copyMember = await sshSession.runCommand(
      `system "CPYFRMSTMF FROMSTMF('${rawSrcPathEbcdic}') TOMBR('${memberPath(library, pgmName)}') MBROPT(*REPLACE) STMFCCSID(37)"`
    )
    if (copyMember.exitCode !== 0) {
      return {
        ok: false,
        compiled: false,
        error: `Could not save the source member: ${copyMember.stdout || copyMember.stderr || copyMember.message}`
      }
    }

    const fullSource = buildFullSource(outPath, sourceCode)
    await sshSession.uploadText(wrappedSrcPath, fullSource)
    const wrappedTranscode = await sshSession.runCommand(
      `iconv -f UTF-8 -t IBM-037 ${wrappedSrcPath} > ${wrappedSrcPathEbcdic} && setccsid 37 ${wrappedSrcPathEbcdic}`
    )
    if (!wrappedTranscode.ok || wrappedTranscode.exitCode !== 0) {
      return {
        ok: true,
        compiled: false,
        error: `Source saved, but could not prepare it for compiling: ${wrappedTranscode.stderr || wrappedTranscode.message}`
      }
    }

    const dbResult = await sshSession.withDb2Session(async (db2) => {
      const compileOut = await db2.run(
        `call qsys2.qcmdexc('CRTBNDRPG PGM(${library}/${pgmName}) SRCSTMF(''${wrappedSrcPathEbcdic}'') DFTACTGRP(*NO) REPLACE(*YES)');`
      )

      if (compileOut.includes('CLI ERROR')) {
        const joblogOut = await db2.run(
          "select MESSAGE_ID, MESSAGE_TEXT from table(qsys2.joblog_info('*')) where SEVERITY > 0 " +
            'order by ORDINAL_POSITION desc fetch first 5 rows only;'
        )
        return { compiled: false as const, compileErrors: parseTableRows(joblogOut) }
      }

      return { compiled: true as const }
    })

    if (!dbResult.compiled) {
      return { ok: true, compiled: false, compileErrors: dbResult.compileErrors }
    }

    return { ok: true, compiled: true }
  } catch (err) {
    return { ok: false, compiled: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await sshSession.runCommand(`rm -f ${rawSrcPath} ${rawSrcPathEbcdic} ${wrappedSrcPath} ${wrappedSrcPathEbcdic}`)
  }
}

export async function listSavedSnippets(): Promise<ListSavedResult> {
  try {
    const library = requireLibrary()
    if (typeof library !== 'string') {
      return { ok: false, message: library.error }
    }

    const rows = await sshSession.withDb2Session(async (db2) => {
      const out = await db2.run(
        "select SYSTEM_TABLE_MEMBER || '|' || varchar_format(PARTITION_CREATE_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS') " +
          `from qsys2.syspartitionstat where SYSTEM_TABLE_SCHEMA = '${library}' and SYSTEM_TABLE_NAME = '${SOURCE_FILE}' ` +
          'order by PARTITION_CREATE_TIMESTAMP desc;'
      )
      return parseTableRows(out)
    })

    const items: SavedSnippetInfo[] = rows
      .map((row): SavedSnippetInfo | null => {
        const [rowName, savedAt] = row.split('|')
        return rowName ? { name: rowName.trim(), savedAt: (savedAt ?? '').trim() } : null
      })
      .filter((item): item is SavedSnippetInfo => item !== null)

    return { ok: true, items }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function loadSavedSnippet(name: string): Promise<LoadSavedResult> {
  if (!isValidObjectName(name)) {
    return { ok: false, message: 'Invalid snippet name.' }
  }
  const pgmName = name.toUpperCase()

  const sessionId = randomUUID().replace(/-/g, '').slice(0, 10)
  const outStmf = `${REMOTE_DIR}/${sessionId}_load.rpgle`

  try {
    const library = requireLibrary()
    if (typeof library !== 'string') {
      return { ok: false, message: library.error }
    }

    await sshSession.runCommand(`mkdir -p ${REMOTE_DIR}`)
    const copy = await sshSession.runCommand(
      `system "CPYTOSTMF FROMMBR('${memberPath(library, pgmName)}') TOSTMF('${outStmf}') STMFOPT(*REPLACE) STMFCCSID(1208) ENDLINFMT(*LF)"`
    )
    if (copy.exitCode !== 0) {
      return {
        ok: false,
        message: `Could not read ${library}/${SOURCE_FILE}(${pgmName}): ${copy.stdout || copy.stderr || copy.message}`
      }
    }

    const source = await sshSession.downloadText(outStmf)
    return { ok: true, source }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    await sshSession.runCommand(`rm -f ${outStmf}`)
  }
}
