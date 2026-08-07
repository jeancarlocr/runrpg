import { loader } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'

// Load Monaco from the local package instead of the @monaco-editor/react
// default CDN, so the editor doesn't depend on network access to render.
loader.config({ monaco: monacoEditor })

export const RPGLE_LANGUAGE_ID = 'rpgle'
export const RPGLE_THEME_ID = 'runrpg-dark'

const KEYWORDS = [
  'dcl-s', 'dcl-proc', 'dcl-pi', 'dcl-pr', 'dcl-ds', 'dcl-c', 'dcl-parm', 'dcl-subf',
  'end-proc', 'end-pi', 'end-pr', 'end-ds',
  'if', 'else', 'elseif', 'endif',
  'for', 'endfor',
  'dow', 'dou', 'enddo',
  'select', 'when', 'other', 'endsl',
  'monitor', 'on-error', 'end-mon',
  'begsr', 'endsr', 'exsr',
  'return', 'eval', 'evalr', 'callp', 'call',
  'exec', 'sql',
  'const', 'value', 'options', 'extproc', 'extpgm',
  'like', 'likeds', 'inz', 'based', 'static', 'export', 'import', 'template',
  'packed', 'zoned', 'char', 'varchar', 'int', 'uns', 'ind', 'pointer', 'date', 'time', 'timestamp'
]

let registeredOnce = false

export function registerRpgleLanguage(monaco: typeof monacoEditor): void {
  if (registeredOnce) return
  registeredOnce = true

  monaco.languages.register({ id: RPGLE_LANGUAGE_ID })

  monaco.languages.setLanguageConfiguration(RPGLE_LANGUAGE_ID, {
    comments: { lineComment: '//' },
    brackets: [['(', ')']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: "'", close: "'" }
    ]
  })

  monaco.languages.setMonarchTokensProvider(RPGLE_LANGUAGE_ID, {
    ignoreCase: true,
    keywords: KEYWORDS,
    tokenizer: {
      root: [
        [/\*\*[a-z]+/, 'keyword'],
        [/\*[a-z][\w]*/, 'constant.rpgle'],
        [/[a-z_][\w-]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/\/\/.*$/, 'comment'],
        [/'/, { token: 'string.quote', next: '@string' }],
        [/\d+(\.\d+)?/, 'number'],
        [/[()]/, '@brackets']
      ],
      string: [
        [/''/, 'string'],
        [/[^']+/, 'string'],
        [/'/, { token: 'string.quote', next: '@pop' }]
      ]
    }
  })

  monaco.editor.defineTheme(RPGLE_THEME_ID, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '5fe07d', fontStyle: 'bold' },
      { token: 'comment', foreground: '6b7885', fontStyle: 'italic' },
      { token: 'string', foreground: 'e3c078' },
      { token: 'string.quote', foreground: 'e3c078' },
      { token: 'constant.rpgle', foreground: 'ff9d5c' },
      { token: 'number', foreground: '7fb3e0' }
    ],
    colors: {
      'editor.background': '#161b21',
      'editor.foreground': '#e7ebef',
      'editorLineNumber.foreground': '#4a5560',
      'editorLineNumber.activeForeground': '#9aa7b2',
      'editor.lineHighlightBackground': '#1c232b',
      'editorCursor.foreground': '#5fe07d',
      'editor.selectionBackground': '#2a3540',
      'editorGutter.background': '#161b21'
    }
  })
}
