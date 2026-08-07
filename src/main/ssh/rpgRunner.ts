import { randomUUID } from 'crypto'
import { sshSession } from './sshSession'
import type { RunRpgResult } from '../../shared/rpg-types'

export const REMOTE_DIR = '/tmp/runrpg'

/**
 * Builds the source actually sent to CRTBNDRPG: the user's snippet plus a
 * `runrpg_out()` subprocedure the snippet calls instead of DSPLY (see
 * ARCHITECTURE.md for why DSPLY output is unreachable on this connection
 * type). Free-format RPG requires subprocedures to come after the mainline,
 * so the prototype goes up top and the implementation at the bottom.
 */
export function buildFullSource(outPath: string, userSnippet: string): string {
  const body = userSnippet.replace(/^\s*\*\*free\s*\r?\n/i, '').trimEnd()

  return [
    '**free',
    'dcl-pr runrpg_out;',
    '  texto char(200) const;',
    'end-pr;',
    '',
    body,
    '',
    'dcl-proc runrpg_out;',
    '  dcl-pi *n;',
    '    texto char(200) const;',
    '  end-pi;',
    '',
    "  dcl-pr c_open int(10) extproc('open');",
    '    path pointer value options(*string);',
    '    oflag int(10) value;',
    '    mode int(10) value options(*nopass);',
    '  end-pr;',
    "  dcl-pr c_write int(10) extproc('write');",
    '    fd int(10) value;',
    '    buf pointer value;',
    '    count uns(10) value;',
    '  end-pr;',
    "  dcl-pr c_close int(10) extproc('close');",
    '    fd int(10) value;',
    '  end-pr;',
    '',
    '  dcl-s fd int(10);',
    '  dcl-s buf char(256);',
    '  dcl-s len uns(10);',
    '  dcl-c O_WRONLY 2;',
    '  dcl-c O_CREAT 8;',
    '  dcl-c O_APPEND 256;',
    "  dcl-c NL x'25';",
    '',
    '  buf = %trimr(texto) + NL;',
    '  len = %len(%trimr(texto)) + 1;',
    `  fd = c_open('${outPath}': O_WRONLY + O_CREAT + O_APPEND: 420);`,
    '  if fd >= 0;',
    '    callp c_write(fd: %addr(buf): len);',
    '    callp c_close(fd);',
    '  endif;',
    'end-proc;',
    ''
  ].join('\n')
}

/**
 * The QZDFMDB2 CLI renders SELECT results as a fixed-width text table:
 * a header, a "---- ----" separator line, one row per line, then a
 * "N RECORD(S) SELECTED." footer. This keeps just the row lines.
 */
export function parseTableRows(tableText: string): string[] {
  const lines = tableText.split('\n').map((line) => line.trimEnd())
  const separatorIndex = lines.findIndex((line) => /^-+(\s+-+)*$/.test(line.trim()))
  if (separatorIndex === -1) return []

  const rows: string[] = []
  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '' || /RECORD\(S\) SELECTED/i.test(line) || line === 'DB2>') continue
    rows.push(line.replace(/\s{2,}/g, ' '))
  }
  return rows
}

async function downloadOutput(outPath: string): Promise<string> {
  // The file was written by the RPG program's own write() call using this
  // job's ambient CCSID (not necessarily 37 — it was 273 in testing), so we
  // read the real attribute instead of assuming one, then transcode before
  // downloading over SFTP (which just moves bytes, no conversion).
  const ccsidResult = await sshSession.runCommand(`attr ${outPath} CCSID 2>/dev/null`)
  if (!ccsidResult.ok || !/^\d+$/.test(ccsidResult.stdout)) {
    return ''
  }

  const utf8Path = `${outPath}.utf8`
  const converted = await sshSession.runCommand(`iconv -f IBM-${ccsidResult.stdout} -t UTF-8 ${outPath} > ${utf8Path}`)
  if (!converted.ok || converted.exitCode !== 0) {
    return ''
  }

  return sshSession.downloadText(utf8Path)
}

/**
 * Compiles and runs one RPG snippet against the connected IBM i, following
 * the pipeline documented in ARCHITECTURE.md:
 *   1. upload the source over SFTP
 *   2. transcode it to real EBCDIC bytes (CRTBNDRPG can't open CCSID 1208)
 *   3. compile + call inside ONE QZDFMDB2 session (shares QTEMP)
 *   4. read back runrpg_out()'s stream file over SFTP
 *   5. delete every temp file this run created, success or failure
 */
export async function runRpgSnippet(sourceCode: string): Promise<RunRpgResult> {
  const sessionId = randomUUID().replace(/-/g, '').slice(0, 10)
  const pgmName = `R${sessionId.toUpperCase().slice(0, 9)}`
  const srcPath = `${REMOTE_DIR}/${sessionId}.rpgle`
  const srcPathEbcdic = `${REMOTE_DIR}/${sessionId}_e.rpgle`
  const outPath = `${REMOTE_DIR}/${sessionId}.out`

  try {
    await sshSession.runCommand(`mkdir -p ${REMOTE_DIR}`)

    const fullSource = buildFullSource(outPath, sourceCode)
    await sshSession.uploadText(srcPath, fullSource)

    const transcode = await sshSession.runCommand(
      `iconv -f UTF-8 -t IBM-037 ${srcPath} > ${srcPathEbcdic} && setccsid 37 ${srcPathEbcdic}`
    )
    if (!transcode.ok || transcode.exitCode !== 0) {
      return { compiled: false, error: `Could not prepare the source file: ${transcode.stderr || transcode.message}` }
    }

    const dbResult = await sshSession.withDb2Session(async (db2) => {
      const compileOut = await db2.run(
        `call qsys2.qcmdexc('CRTBNDRPG PGM(QTEMP/${pgmName}) SRCSTMF(''${srcPathEbcdic}'') DFTACTGRP(*NO)');`
      )

      if (compileOut.includes('CLI ERROR')) {
        const joblogOut = await db2.run(
          "select MESSAGE_ID, MESSAGE_TEXT from table(qsys2.joblog_info('*')) where SEVERITY > 0 " +
            'order by ORDINAL_POSITION desc fetch first 5 rows only;'
        )
        return { compiled: false as const, compileErrors: parseTableRows(joblogOut) }
      }

      const callOut = await db2.run(`call qsys2.qcmdexc('CALL QTEMP/${pgmName}');`)
      return { compiled: true as const, callFailed: callOut.includes('CLI ERROR') }
    })

    if (!dbResult.compiled) {
      return { compiled: false, compileErrors: dbResult.compileErrors }
    }

    const output = await downloadOutput(outPath)
    return {
      compiled: true,
      output,
      error: dbResult.callFailed ? 'The program ended with an error (CALL failed).' : undefined
    }
  } catch (err) {
    return { compiled: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await sshSession.runCommand(`rm -f ${srcPath} ${srcPathEbcdic} ${outPath} ${outPath}.utf8`)
  }
}
