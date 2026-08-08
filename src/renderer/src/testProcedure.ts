import type { ParsedProc } from './procParser'

function toRpgLiteral(rawValue: string, kind: 'char' | 'numeric'): string {
  if (kind === 'numeric') return rawValue.trim()
  return `'${rawValue.replace(/'/g, "''")}'`
}

/**
 * Replaces the real mainline (everything before the first dcl-proc) with a
 * synthetic one that calls `proc` with `values`, and keeps every proc in the
 * file — including ones proc depends on — byte-for-byte. See procParser.ts
 * for why this splice point is always safe: free-form RPG requires all
 * dcl-proc blocks to come after mainline.
 */
export function buildTestSource(
  fullSource: string,
  proc: ParsedProc,
  firstProcLine: number,
  values: Record<string, string>
): string {
  const args = proc.params.map((p) => toRpgLiteral(values[p.name] ?? '', p.kind)).join(': ')
  const callExpr = `${proc.name}(${args})`

  const mainLines: string[] = []
  if (proc.returnTypeSpec) {
    const outArg = proc.returnKind === 'char' ? 'result' : '%char(result)'
    mainLines.push(`dcl-s result ${proc.returnTypeSpec};`, `result = ${callExpr};`, `runrpg_out(${outArg});`)
  } else {
    mainLines.push(`${callExpr};`, "runrpg_out('Procedure executed (no return value).');")
  }
  mainLines.push('*inlr = *on;')

  const procsSection = fullSource.split('\n').slice(firstProcLine - 1)

  return ['**free', '', ...mainLines, '', ...procsSection].join('\n') + '\n'
}
