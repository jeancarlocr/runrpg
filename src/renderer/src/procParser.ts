// Text-based detection/parsing for "Test Procedure" — NOT a real RPG parser.
// Assumes one statement per line (what New Program generates). Anything it
// doesn't confidently recognize is rejected with a specific reason instead
// of being guessed at.

export type ParamKind = 'char' | 'numeric'

export interface ProcParam {
  name: string
  typeSpec: string
  kind: ParamKind
}

export interface ParsedProc {
  name: string
  startLine: number
  endLine: number
  returnTypeSpec: string | null
  returnKind: ParamKind | null
  params: ProcParam[]
}

export type ProcDetectError = { kind: 'no-proc' } | { kind: 'unsupported'; reason: string }

export type ProcDetectResult =
  | { ok: true; proc: ParsedProc; firstProcLine: number }
  | { ok: false; error: ProcDetectError }

const CHAR_TYPES = new Set(['char', 'varchar'])
const NUMERIC_TYPES = new Set(['int', 'uns', 'packed', 'zoned'])
const SUPPORTED_TYPES = new Set([...CHAR_TYPES, ...NUMERIC_TYPES])

const PROC_START_RE = /^\s*dcl-proc\s+([A-Za-z_]\w*)\s*;/i
const PROC_END_RE = /^\s*end-proc\s*;/i
const PI_START_RE = /^\s*dcl-pi\s+(?:([A-Za-z_]\w*)|\*n)\s*(.*?);/i
const PI_END_RE = /^\s*end-pi\s*;/i
const TYPE_RE = /^(char|varchar|int|uns|packed|zoned)\s*(\([^)]*\))?/i
const PARAM_LINE_RE = /^([A-Za-z_]\w*)\s+(.+?)\s*;\s*(\/\/.*)?$/

interface ProcRange {
  name: string
  startLine: number
  endLine: number
}

function findAllProcRanges(lines: string[]): ProcRange[] {
  const ranges: ProcRange[] = []
  let openStart = -1
  let openName = ''

  for (let i = 0; i < lines.length; i++) {
    if (openStart === -1) {
      const m = lines[i].match(PROC_START_RE)
      if (m) {
        openStart = i + 1
        openName = m[1]
      }
    } else if (PROC_END_RE.test(lines[i])) {
      ranges.push({ name: openName, startLine: openStart, endLine: i + 1 })
      openStart = -1
    }
  }

  return ranges
}

function kindOf(typeKeyword: string): ParamKind {
  return CHAR_TYPES.has(typeKeyword.toLowerCase()) ? 'char' : 'numeric'
}

function parseParamLine(rawLine: string): ProcParam | { error: string } {
  const trimmed = rawLine.trim()

  if (/likeds\s*\(/i.test(trimmed) || /^dcl-ds\b/i.test(trimmed)) {
    return { error: 'uses a Data Structure — not supported yet' }
  }
  if (/dim\s*\(/i.test(trimmed)) {
    return { error: 'is an array (dim()) — not supported yet' }
  }
  if (/options\s*\(/i.test(trimmed)) {
    return { error: 'uses options() — not supported yet' }
  }

  const paramMatch = trimmed.match(PARAM_LINE_RE)
  if (!paramMatch) {
    return { error: `line "${trimmed}" could not be parsed` }
  }

  const name = paramMatch[1]
  const rest = paramMatch[2]
  const typeMatch = rest.match(TYPE_RE)
  if (!typeMatch) {
    return { error: 'has an unsupported type' }
  }

  const keyword = typeMatch[1].toLowerCase()
  if (!SUPPORTED_TYPES.has(keyword)) {
    return { error: `type "${keyword}" is not supported yet` }
  }
  const typeSpec = typeMatch[0].replace(/\s+/g, '')

  const passingMode = rest.slice(typeMatch[0].length).trim().toLowerCase()
  if (!/^(const|value)\b/.test(passingMode)) {
    return { error: 'is passed by reference — not supported yet' }
  }

  return { name, typeSpec, kind: kindOf(keyword) }
}

export function findProcAtLine(lines: string[], cursorLine: number): ProcDetectResult {
  const ranges = findAllProcRanges(lines)
  const match = ranges.find((r) => cursorLine >= r.startLine && cursorLine <= r.endLine)

  if (!match) {
    return { ok: false, error: { kind: 'no-proc' } }
  }

  const firstProcLine = Math.min(...ranges.map((r) => r.startLine))
  const procLines = lines.slice(match.startLine - 1, match.endLine)

  let piStartIdx = -1
  let piHeaderRest = ''
  for (let i = 0; i < procLines.length; i++) {
    const m = procLines[i].match(PI_START_RE)
    if (m) {
      piStartIdx = i
      piHeaderRest = m[2].trim()
      break
    }
  }
  if (piStartIdx === -1) {
    return { ok: false, error: { kind: 'unsupported', reason: `Could not find a recognizable dcl-pi for "${match.name}".` } }
  }

  let piEndIdx = -1
  for (let i = piStartIdx; i < procLines.length; i++) {
    if (PI_END_RE.test(procLines[i])) {
      piEndIdx = i
      break
    }
  }
  if (piEndIdx === -1) {
    return { ok: false, error: { kind: 'unsupported', reason: `Could not find end-pi for "${match.name}".` } }
  }

  let returnTypeSpec: string | null = null
  let returnKind: ParamKind | null = null
  if (piHeaderRest) {
    const rt = piHeaderRest.match(TYPE_RE)
    const keyword = rt?.[1]?.toLowerCase()
    if (!rt || !keyword || !SUPPORTED_TYPES.has(keyword)) {
      return {
        ok: false,
        error: { kind: 'unsupported', reason: `Return type "${piHeaderRest}" is not supported yet.` }
      }
    }
    returnTypeSpec = rt[0].replace(/\s+/g, '')
    returnKind = kindOf(keyword)
  }

  const params: ProcParam[] = []
  for (let i = piStartIdx + 1; i < piEndIdx; i++) {
    const trimmed = procLines[i].trim()
    if (trimmed === '' || trimmed.startsWith('//')) continue

    const parsed = parseParamLine(procLines[i])
    if ('error' in parsed) {
      return { ok: false, error: { kind: 'unsupported', reason: `Parameter in "${match.name}" ${parsed.error}.` } }
    }
    params.push(parsed)
  }

  return {
    ok: true,
    firstProcLine,
    proc: {
      name: match.name,
      startLine: match.startLine,
      endLine: match.endLine,
      returnTypeSpec,
      returnKind,
      params
    }
  }
}
