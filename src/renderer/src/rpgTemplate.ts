// RPG subprocedure/identifier names: letters, digits, underscore, must start
// with a letter — no 10-char cap here, unlike IBM i *PGM/member object names
// (see shared/ibmiNames.ts), because these never become an object name.
const PROC_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/

export function isValidProcName(name: string): boolean {
  return PROC_NAME_RE.test(name)
}

/**
 * Builds an RPG Full Free skeleton: **free, a main block showing (commented
 * out) how to call the first procedure and print its result via
 * runrpg_out(), then one dcl-proc/dcl-pi/end-pi/end-proc per name. Mainline
 * comes before the procedures — see rpgRunner.ts's buildFullSource for why.
 */
export function buildProgramSkeleton(procNames: string[]): string {
  const [first] = procNames
  const lines: string[] = [
    '**free',
    '',
    '// dcl-s result char(100);',
    `// result = ${first}();`,
    '// runrpg_out(result);',
    '*inlr = *on;'
  ]

  for (const name of procNames) {
    lines.push(
      '',
      `dcl-proc ${name};`,
      `  dcl-pi ${name} char(100);`,
      '  end-pi;',
      '',
      '  // TODO: implement',
      "  return '';",
      'end-proc;'
    )
  }

  return lines.join('\n') + '\n'
}
