// IBM i object names: must start with a letter, then letters/digits only,
// max 10 chars. (Real IBM i also allows # @ $ _, but the app only needs to
// generate names for *PGM/member, so this stricter subset keeps things simple.)
const OBJECT_NAME_RE = /^[A-Za-z][A-Za-z0-9]{0,9}$/

export function isValidObjectName(name: string): boolean {
  return OBJECT_NAME_RE.test(name)
}
