import { randomUUID } from 'crypto'
import { sshSession } from './sshSession'
import { loadSshConfig } from './config'
import { buildFullSource, parseTableRows, REMOTE_DIR } from './rpgRunner'
import { isValidObjectName } from '../../shared/ibmiNames'
import {
  RUNRPG_SOURCE_FILE,
  type ListSavedResult,
  type LoadSavedResult,
  type SavedSnippetInfo,
  type SaveSnippetResult
} from '../../shared/saved-types'

function memberPath(library: string, file: string, name: string): string {
  return `/QSYS.LIB/${library}.LIB/${file}.FILE/${name}.MBR`
}

function requireLibrary(): string | { error: string } {
  const config = loadSshConfig()
  if (!config.library) {
    return { error: 'Configure a library in Preferences (Ctrl+,) first.' }
  }
  return config.library.toUpperCase()
}

async function ensureSourceFile(library: string): Promise<string | undefined> {
  const check = await sshSession.runCommand(`system "CHKOBJ OBJ(${library}/${RUNRPG_SOURCE_FILE}) OBJTYPE(*FILE)"`)
  if (check.exitCode === 0) return undefined

  const create = await sshSession.runCommand(
    `system "CRTSRCPF FILE(${library}/${RUNRPG_SOURCE_FILE}) RCDLEN(112) TEXT('RunRPG saved snippets')"`
  )
  if (create.exitCode !== 0) {
    return `Could not create source file ${library}/${RUNRPG_SOURCE_FILE}: ${create.stdout || create.stderr || create.message}`
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
      `system "CPYFRMSTMF FROMSTMF('${rawSrcPathEbcdic}') TOMBR('${memberPath(library, RUNRPG_SOURCE_FILE, pgmName)}') MBROPT(*REPLACE) STMFCCSID(37)"`
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

/**
 * Lists members of any library/source-file pair — used both by "Saved…"
 * (library from Preferences, file fixed to RUNRPGSRC) and by "Open…"
 * (both picked by the user, so validated here rather than trusting callers).
 */
export async function listMembers(library: string, file: string): Promise<ListSavedResult> {
  if (!isValidObjectName(library) || !isValidObjectName(file)) {
    return { ok: false, message: 'Invalid library or file name.' }
  }

  try {
    const rows = await sshSession.withDb2Session(async (db2) => {
      const out = await db2.run(
        "select SYSTEM_TABLE_MEMBER || '|' || varchar_format(CREATE_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS') || '|' || coalesce(SOURCE_TYPE, '') " +
          `from qsys2.syspartitionstat where SYSTEM_TABLE_SCHEMA = '${library}' and SYSTEM_TABLE_NAME = '${file}' ` +
          'order by CREATE_TIMESTAMP desc;'
      )
      return parseTableRows(out)
    })

    const items: SavedSnippetInfo[] = rows
      .map((row): SavedSnippetInfo | null => {
        const [rowName, savedAt, sourceType] = row.split('|')
        if (!rowName) return null
        return {
          name: rowName.trim(),
          savedAt: (savedAt ?? '').trim(),
          sourceType: sourceType?.trim() || null
        }
      })
      .filter((item): item is SavedSnippetInfo => item !== null)

    return { ok: true, items }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/** Downloads a member's source as UTF-8 text. See listMembers() for validation rationale. */
export async function loadMember(library: string, file: string, name: string): Promise<LoadSavedResult> {
  if (!isValidObjectName(library) || !isValidObjectName(file) || !isValidObjectName(name)) {
    return { ok: false, message: 'Invalid library, file, or member name.' }
  }
  const memberName = name.toUpperCase()

  const sessionId = randomUUID().replace(/-/g, '').slice(0, 10)
  const outStmf = `${REMOTE_DIR}/${sessionId}_load.rpgle`

  try {
    await sshSession.runCommand(`mkdir -p ${REMOTE_DIR}`)
    const copy = await sshSession.runCommand(
      `system "CPYTOSTMF FROMMBR('${memberPath(library, file, memberName)}') TOSTMF('${outStmf}') STMFOPT(*REPLACE) STMFCCSID(1208) ENDLINFMT(*LF)"`
    )
    if (copy.exitCode !== 0) {
      return {
        ok: false,
        message: `Could not read ${library}/${file}(${memberName}): ${copy.stdout || copy.stderr || copy.message}`
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

export async function listSavedSnippets(): Promise<ListSavedResult> {
  const library = requireLibrary()
  if (typeof library !== 'string') {
    return { ok: false, message: library.error }
  }
  return listMembers(library, RUNRPG_SOURCE_FILE)
}

export async function loadSavedSnippet(name: string): Promise<LoadSavedResult> {
  const library = requireLibrary()
  if (typeof library !== 'string') {
    return { ok: false, message: library.error }
  }
  return loadMember(library, RUNRPG_SOURCE_FILE, name)
}

/**
 * Compiles+replaces a *PGM and its source member IN PLACE, in an arbitrary
 * library/file — used by "Update original" when code loaded via "Open…"
 * came from a real project, not RunRPG's own scratchpad. Deliberately
 * all-or-nothing, unlike saveRpgSnippet(): compiles FIRST, from a stream
 * file, and only copies into the real member if that succeeds — so a bad
 * compile never touches the original. REPLACE(*YES) already makes the *PGM
 * side atomic on IBM i (compiles to a temp object, swaps in only on
 * success); the member copy doesn't have that guarantee on its own, hence
 * doing it last, after the one step that can fail (compiling) is done.
 */
export async function updateOriginalMember(
  library: string,
  file: string,
  name: string,
  sourceCode: string
): Promise<SaveSnippetResult> {
  if (!isValidObjectName(library) || !isValidObjectName(file) || !isValidObjectName(name)) {
    return { ok: false, compiled: false, error: 'Invalid library, file, or member name.' }
  }
  const lib = library.toUpperCase()
  const fileName = file.toUpperCase()
  const pgmName = name.toUpperCase()

  const sessionId = randomUUID().replace(/-/g, '').slice(0, 10)
  const rawSrcPath = `${REMOTE_DIR}/${sessionId}_raw.rpgle`
  const rawSrcPathEbcdic = `${REMOTE_DIR}/${sessionId}_raw_e.rpgle`
  const wrappedSrcPath = `${REMOTE_DIR}/${sessionId}.rpgle`
  const wrappedSrcPathEbcdic = `${REMOTE_DIR}/${sessionId}_e.rpgle`
  const outPath = `${REMOTE_DIR}/${sessionId}.out`

  try {
    const exists = await sshSession.runCommand(`system "CHKOBJ OBJ(${lib}/${fileName}) OBJTYPE(*FILE) MBR(${pgmName})"`)
    if (exists.exitCode !== 0) {
      return {
        ok: false,
        compiled: false,
        error: `${lib}/${fileName}(${pgmName}) no longer exists — nothing was changed.`
      }
    }

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

    const fullSource = buildFullSource(outPath, sourceCode)
    await sshSession.uploadText(wrappedSrcPath, fullSource)
    const wrappedTranscode = await sshSession.runCommand(
      `iconv -f UTF-8 -t IBM-037 ${wrappedSrcPath} > ${wrappedSrcPathEbcdic} && setccsid 37 ${wrappedSrcPathEbcdic}`
    )
    if (!wrappedTranscode.ok || wrappedTranscode.exitCode !== 0) {
      return {
        ok: false,
        compiled: false,
        error: `Could not prepare the source for compiling: ${wrappedTranscode.stderr || wrappedTranscode.message}`
      }
    }

    const dbResult = await sshSession.withDb2Session(async (db2) => {
      const compileOut = await db2.run(
        `call qsys2.qcmdexc('CRTBNDRPG PGM(${lib}/${pgmName}) SRCSTMF(''${wrappedSrcPathEbcdic}'') DFTACTGRP(*NO) REPLACE(*YES)');`
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
      // All-or-nothing: compile failed, so the member is untouched.
      return { ok: false, compiled: false, compileErrors: dbResult.compileErrors }
    }

    const copyMember = await sshSession.runCommand(
      `system "CPYFRMSTMF FROMSTMF('${rawSrcPathEbcdic}') TOMBR('${memberPath(lib, fileName, pgmName)}') MBROPT(*REPLACE) STMFCCSID(37)"`
    )
    if (copyMember.exitCode !== 0) {
      return {
        ok: false,
        compiled: true,
        error: `Compiled and replaced the program, but could not update the source member — they're now out of sync: ${copyMember.stdout || copyMember.stderr || copyMember.message}`
      }
    }

    return { ok: true, compiled: true }
  } catch (err) {
    return { ok: false, compiled: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await sshSession.runCommand(`rm -f ${rawSrcPath} ${rawSrcPathEbcdic} ${wrappedSrcPath} ${wrappedSrcPathEbcdic}`)
  }
}
