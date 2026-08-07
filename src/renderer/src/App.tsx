import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { SshStatus } from '../../shared/ssh-types'
import { RPGLE_LANGUAGE_ID, RPGLE_THEME_ID, registerRpgleLanguage } from './monaco/rpgle'
import Preferences from './Preferences'
import SaveDialog from './SaveDialog'
import SavedPrograms from './SavedPrograms'

const STATUS_LABEL: Record<SshStatus, string> = {
  idle: 'not connected',
  connecting: 'connecting…',
  ready: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
  error: 'error'
}

const DEFAULT_SNIPPET = `**free
runrpg_out('Hello from RunRPG');
*inlr = *on;
`

type RunOutcome =
  | { kind: 'success'; output: string; warning?: string; durationMs: number }
  | { kind: 'error'; errors: string[]; message?: string; durationMs: number }

function dedupConsecutive(lines: string[]): string[] {
  return lines.filter((line, i) => i === 0 || line !== lines[i - 1])
}

export default function App() {
  const [status, setStatus] = useState<SshStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [source, setSource] = useState(DEFAULT_SNIPPET)
  const [result, setResult] = useState<RunOutcome | null>(null)

  const [prefsOpen, setPrefsOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)

  const sourceRef = useRef(source)
  sourceRef.current = source
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    return window.runrpg.ssh.onStatus((payload) => {
      setStatus(payload.status)
      setStatusMessage(payload.message)
    })
  }, [])

  useEffect(() => {
    return window.runrpg.prefs.onOpen(() => setPrefsOpen(true))
  }, [])

  async function handleRunClick(): Promise<void> {
    if (busyRef.current) return
    setBusy(true)
    setResult(null)
    setLoadingLabel('Connecting…')
    const start = performance.now()

    try {
      const connectResult = await window.runrpg.ssh.connect()
      if (!connectResult.ok) {
        setResult({
          kind: 'error',
          errors: [],
          message: `Error connecting: ${connectResult.message}`,
          durationMs: performance.now() - start
        })
        return
      }

      setLoadingLabel('Compiling & running…')
      const rpgResult = await window.runrpg.rpg.run(sourceRef.current)
      const durationMs = performance.now() - start

      if (!rpgResult.compiled) {
        setResult({
          kind: 'error',
          errors: dedupConsecutive(rpgResult.compileErrors ?? []),
          message: rpgResult.error,
          durationMs
        })
        return
      }

      setResult({
        kind: 'success',
        output: rpgResult.output || '(no output)',
        warning: rpgResult.error,
        durationMs
      })
    } finally {
      setBusy(false)
      setLoadingLabel(null)
    }
  }

  async function handleSaveConfirm(name: string): Promise<void> {
    setSaveDialogOpen(false)
    if (busyRef.current) return
    setBusy(true)
    setResult(null)
    setLoadingLabel('Connecting…')
    const start = performance.now()

    try {
      const connectResult = await window.runrpg.ssh.connect()
      if (!connectResult.ok) {
        setResult({
          kind: 'error',
          errors: [],
          message: `Error connecting: ${connectResult.message}`,
          durationMs: performance.now() - start
        })
        return
      }

      setLoadingLabel('Saving…')
      const saveResult = await window.runrpg.saved.save(name, sourceRef.current)
      const durationMs = performance.now() - start

      if (!saveResult.ok) {
        setResult({
          kind: 'error',
          errors: [],
          message: saveResult.error ?? 'Could not save the snippet.',
          durationMs
        })
        return
      }

      if (!saveResult.compiled) {
        setResult({
          kind: 'error',
          errors: dedupConsecutive(saveResult.compileErrors ?? []),
          message: `Source saved as "${name}", but it did not compile.`,
          durationMs
        })
        return
      }

      setResult({ kind: 'success', output: `Saved and compiled "${name}".`, durationMs })
    } finally {
      setBusy(false)
      setLoadingLabel(null)
    }
  }

  async function handleSelectSaved(name: string): Promise<void> {
    setSavedOpen(false)
    if (busyRef.current) return
    setBusy(true)
    setResult(null)
    setLoadingLabel('Connecting…')
    const start = performance.now()

    try {
      const connectResult = await window.runrpg.ssh.connect()
      if (!connectResult.ok) {
        setResult({
          kind: 'error',
          errors: [],
          message: `Error connecting: ${connectResult.message}`,
          durationMs: performance.now() - start
        })
        return
      }

      setLoadingLabel('Loading…')
      const loadResult = await window.runrpg.saved.load(name)
      if (!loadResult.ok) {
        setResult({
          kind: 'error',
          errors: [],
          message: loadResult.message ?? 'Could not load the snippet.',
          durationMs: performance.now() - start
        })
        return
      }

      setSource(loadResult.source ?? '')
    } finally {
      setBusy(false)
      setLoadingLabel(null)
    }
  }

  const runRef = useRef(handleRunClick)
  runRef.current = handleRunClick

  const handleEditorMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runRef.current()
    })
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <span>RunRPG</span>
        <span className="conn-pill">
          <span className="dot" /> {STATUS_LABEL[status]}
          {statusMessage ? ` — ${statusMessage}` : ''}
        </span>
      </header>

      <main className="workspace">
        <p className="hint">
          Phase 2: compiles this snippet against pub400 and runs it. Use{' '}
          <code>runrpg_out(&apos;text&apos;)</code> instead of <code>dsply</code> to print — see{' '}
          <code>ARCHITECTURE.md</code> for why.
        </p>

        <div className="editor-wrap">
          <Editor
            language={RPGLE_LANGUAGE_ID}
            theme={RPGLE_THEME_ID}
            value={source}
            onChange={(value) => setSource(value ?? '')}
            beforeMount={registerRpgleLanguage}
            onMount={handleEditorMount}
            options={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
              lineHeight: 1.5,
              minimap: { enabled: false },
              automaticLayout: true,
              tabSize: 2,
              scrollBeyondLastLine: false
            }}
          />
        </div>

        <div className="run-row">
          <button onClick={handleRunClick} disabled={busy}>
            {busy ? 'Running…' : 'Run'}
          </button>
          <button onClick={() => setSaveDialogOpen(true)} disabled={busy}>
            Save
          </button>
          <button className="ghost-button" onClick={() => setSavedOpen(true)} disabled={busy}>
            Saved…
          </button>
          <span className="run-hint">Ctrl+Enter</span>
          {busy && loadingLabel && <span className="loading-label">{loadingLabel}</span>}
          {!busy && result && <span className="duration">{(result.durationMs / 1000).toFixed(1)}s</span>}
        </div>

        {result?.kind === 'success' && (
          <div className="panel output-panel">
            <div className="panel-title">Output</div>
            <pre>{result.output}</pre>
            {result.warning && <div className="panel-note">{result.warning}</div>}
          </div>
        )}

        {result?.kind === 'error' && (
          <div className="panel errors-panel">
            <div className="panel-title">Errors</div>
            {result.errors.length > 0 && <pre>{result.errors.join('\n')}</pre>}
            {result.message && <div className="panel-note">{result.message}</div>}
          </div>
        )}
      </main>

      {prefsOpen && <Preferences onClose={() => setPrefsOpen(false)} />}
      {saveDialogOpen && <SaveDialog onClose={() => setSaveDialogOpen(false)} onConfirm={handleSaveConfirm} />}
      {savedOpen && <SavedPrograms onClose={() => setSavedOpen(false)} onSelect={handleSelectSaved} />}
    </div>
  )
}
