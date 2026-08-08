import { sshSession } from './sshSession'
import { parseTableRows } from './rpgRunner'
import { isValidObjectName } from '../../shared/ibmiNames'
import type { ListFilesResult, SourceFileInfo } from '../../shared/open-types'

/**
 * Lists source physical files (FILE_TYPE = 'S') in an arbitrary library —
 * the "Open…" browser, unlike "Saved…", isn't scoped to the library/file
 * configured in Preferences. QSYS2.OBJECT_STATISTICS + OBJATTRIBUTE looked
 * like the obvious catalog for this but doesn't actually distinguish source
 * files from data files (both show 'PF') — QSYS2.SYSTABLES.FILE_TYPE does,
 * confirmed against a real library before writing this.
 */
export async function listLibrarySourceFiles(library: string): Promise<ListFilesResult> {
  if (!isValidObjectName(library)) {
    return { ok: false, message: 'Library name must start with a letter and be at most 10 letters/digits.' }
  }
  const lib = library.toUpperCase()

  // SYSTABLES silently returns zero rows for a library that doesn't exist —
  // it can't tell "empty" apart from "not found" on its own, so check first.
  const exists = await sshSession.runCommand(`system "CHKOBJ OBJ(${lib}) OBJTYPE(*LIB)"`)
  if (exists.exitCode !== 0) {
    return { ok: false, message: `Library ${lib} was not found (or you don't have authority to see it).` }
  }

  try {
    const rows = await sshSession.withDb2Session(async (db2) => {
      const out = await db2.run(
        "select TABLE_NAME || '|' || coalesce(TABLE_TEXT, '') " +
          `from qsys2.systables where TABLE_SCHEMA = '${lib}' and FILE_TYPE = 'S' ` +
          'order by TABLE_NAME;'
      )
      return parseTableRows(out)
    })

    const items: SourceFileInfo[] = rows
      .map((row): SourceFileInfo | null => {
        const [name, description] = row.split('|')
        return name ? { name: name.trim(), description: (description ?? '').trim() } : null
      })
      .filter((item): item is SourceFileInfo => item !== null)

    return { ok: true, items }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
