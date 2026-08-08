import { sshSession } from './sshSession'

/** Returns an error message if `library` doesn't exist (or isn't visible), undefined otherwise. */
export async function checkLibraryExists(library: string): Promise<string | undefined> {
  const check = await sshSession.runCommand(`system "CHKOBJ OBJ(${library}) OBJTYPE(*LIB)"`)
  if (check.exitCode === 0) return undefined
  return `Library ${library} was not found (or you don't have authority to see it).`
}
