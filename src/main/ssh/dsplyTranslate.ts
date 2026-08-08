// Translates classic DSPLY statements to runrpg_out() calls before compiling
// (see ARCHITECTURE.md for why DSPLY's own output is unreachable here) — so
// code written the way RPG is normally taught works as-is, without the user
// having to learn runrpg_out(). Same philosophy as procParser.ts: this is a
// line-based scanner, not a real RPG parser, and anything it can't classify
// with confidence is rejected with a specific reason instead of guessed at.
//
// Confirmed empirically against a real IBM i (not assumed from memory —a
// first guess at DSPLY's grammar, using ':'-separated operands like a
// procedure call, was wrong and failed to compile):
//   - `dsply expr;`      → 1 operand, non-interactive. Compiles.
//   - `dsply expr resp;` → 2 space-separated operands, the interactive form
//     (waits for a reply) — matches how the user themselves defined it.
//   - `%char(expr)` compiles cleanly whether expr is already char, numeric,
//     or a concatenation — confirmed too — so every translated call is
//     wrapped in it uniformly instead of trying to infer the expression's
//     type.

export type DsplyTranslateResult = { ok: true; source: string } | { ok: false; error: string }

const DSPLY_LINE_RE = /^(\s*)dsply\b\s+(.+?)\s*;(.*)$/i
// Deliberately anchored to the start of the (trimmed) line, not a bare
// \bdsply\b scan of the whole line — a scan-anywhere version would wrongly
// flag lines like `runrpg_out('no dsply here');`, where "dsply" only shows
// up inside a string literal's content, not as the statement keyword.
const DSPLY_STARTS_LINE_RE = /^\s*dsply\b/i

type Tok = 'value' | 'op'

/**
 * Tokenizes a DSPLY operand blob into value/operator tokens, respecting
 * quoted strings (so spaces inside a literal don't look like an operand
 * boundary) and parenthesized groups (so `%trim(a + b)` collapses to one
 * value, not several). Returns null for anything it can't cleanly balance —
 * that's treated as "unrecognized form", not guessed at.
 */
function tokenizeOperands(blob: string): Tok[] | null {
  const tokens: Tok[] = []
  let i = 0
  const n = blob.length

  function skipString(): boolean {
    i++ // past opening quote
    while (i < n) {
      if (blob[i] === "'") {
        if (blob[i + 1] === "'") {
          i += 2
          continue
        }
        i++
        return true
      }
      i++
    }
    return false
  }

  function skipParenGroup(): boolean {
    let depth = 1
    i++ // past opening paren
    while (i < n && depth > 0) {
      const c = blob[i]
      if (c === "'") {
        if (!skipString()) return false
        continue
      }
      if (c === '(') depth++
      else if (c === ')') depth--
      i++
    }
    return depth === 0
  }

  while (i < n) {
    const c = blob[i]

    if (/\s/.test(c)) {
      i++
      continue
    }

    if (c === "'") {
      if (!skipString()) return null
      tokens.push('value')
      continue
    }

    if (c === '(') {
      if (!skipParenGroup()) return null
      tokens.push('value')
      continue
    }

    if (c === '+' || c === '-' || c === '/') {
      tokens.push('op')
      i++
      continue
    }

    if (c === '*') {
      // `*DTA`/`*ON`/... (special value) vs multiplication — a special
      // value always has a letter glued right after the '*', no space.
      const next = blob[i + 1]
      if (next && /[A-Za-z]/.test(next)) {
        i++
        while (i < n && /[A-Za-z0-9_]/.test(blob[i])) i++
        tokens.push('value')
      } else {
        tokens.push('op')
        i++
      }
      continue
    }

    if (/[A-Za-z0-9_%]/.test(c)) {
      while (i < n && /[A-Za-z0-9_%.]/.test(blob[i])) i++
      if (blob[i] === '(') {
        // Function call / BIF, e.g. %trim(x) — the (...) is part of this
        // same value, not a separate one.
        if (!skipParenGroup()) return null
      }
      tokens.push('value')
      continue
    }

    return null // unrecognized character (e.g. a stray ':')
  }

  return tokens
}

type OperandShape = 'single' | 'multiple' | 'unrecognized'

function classifyOperands(blob: string): OperandShape {
  const tokens = tokenizeOperands(blob)
  if (tokens === null || tokens.length === 0) return 'unrecognized'

  let sawValue = false
  for (const t of tokens) {
    if (t === 'value') {
      if (sawValue) return 'multiple' // two values with only whitespace between them
      sawValue = true
    } else {
      sawValue = false
    }
  }
  return sawValue ? 'single' : 'unrecognized' // ends on a dangling operator
}

export function translateDsply(userSnippet: string): DsplyTranslateResult {
  const lines = userSnippet.split(/\r\n|\n/)
  const outLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(DSPLY_LINE_RE)

    if (!match) {
      if (DSPLY_STARTS_LINE_RE.test(line)) {
        return {
          ok: false,
          error: `DSPLY form not recognized on line ${i + 1} — expected a single "dsply <expr>;" statement.`
        }
      }
      outLines.push(line)
      continue
    }

    const [, indent, operandBlob, trailing] = match
    const shape = classifyOperands(operandBlob)

    if (shape === 'multiple') {
      return {
        ok: false,
        error:
          "Interactive DSPLY (with response field) isn't supported — RunRPG has no screen to receive input " +
          `(line ${i + 1}).`
      }
    }

    if (shape === 'unrecognized') {
      return {
        ok: false,
        error: `DSPLY form not recognized on line ${i + 1} — expected a single "dsply <expr>;" statement.`
      }
    }

    outLines.push(`${indent}runrpg_out(%char(${operandBlob}));${trailing}`)
  }

  return { ok: true, source: outLines.join('\n') }
}
