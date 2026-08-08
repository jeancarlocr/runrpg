import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import type { SshStatus } from '../../shared/ssh-types'
import type { AppPrefs } from '../../shared/prefs-types'
import { RPGLE_LANGUAGE_ID, RPGLE_THEME_ID, registerRpgleLanguage } from './monaco/rpgle'
import Preferences from './Preferences'
import SaveDialog from './SaveDialog'
import SavedPrograms from './SavedPrograms'
import NewProgramDialog from './NewProgramDialog'
import TestProcedureDialog from './TestProcedureDialog'
import { buildProgramSkeleton } from './rpgTemplate'
import { findProcAtLine, type ParsedProc } from './procParser'
import { buildTestSource } from './testProcedure'

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
  | { kind: 'error'; errors: string[]; message?: string; durationMs?: number }

function dedupConsecutive(lines: string[]): string[] {
  return lines.filter((line, i) => i === 0 || line !== lines[i - 1])
}

export default function App() {
  const [status, setStatus] = useState<SshStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [prefs, setPrefs] = useState<AppPrefs | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [source, setSource] = useState(DEFAULT_SNIPPET)
  const [result, setResult] = useState<RunOutcome | null>(null)

  const [prefsOpen, setPrefsOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [newProgramOpen, setNewProgramOpen] = useState(false)
  const [testProcTarget, setTestProcTarget] = useState<{ proc: ParsedProc; firstProcLine: number } | null>(null)

  const sourceRef = useRef(source)
  sourceRef.current = source
  const busyRef = useRef(busy)
  busyRef.current = busy
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  // Tracks the last source that was actually persisted (saved or loaded),
  // so "New Program" knows whether generating would discard real work.
  const savedBaselineRef = useRef(DEFAULT_SNIPPET)
  const dirty = source !== savedBaselineRef.current

  useEffect(() => {
    return window.runrpg.ssh.onStatus((payload) => {
      setStatus(payload.status)
      setStatusMessage(payload.message)
    })
  }, [])

  useEffect(() => {
    return window.runrpg.prefs.onOpen(() => setPrefsOpen(true))
  }, [])

  useEffect(() => {
    let cancelled = false
    window.runrpg.prefs.get().then((loaded) => {
      if (!cancelled) setPrefs(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleConnectClick(): Promise<void> {
    if (status === 'ready' || status === 'connecting' || status === 'reconnecting') return
    await window.runrpg.ssh.connect()
  }

  async function runSourceAndShowResult(sourceCode: string): Promise<void> {
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
      const rpgResult = await window.runrpg.rpg.run(sourceCode)
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

      // The source member was written regardless of compile outcome.
      savedBaselineRef.current = sourceRef.current

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

      const loadedSource = loadResult.source ?? ''
      setSource(loadedSource)
      savedBaselineRef.current = loadedSource
    } finally {
      setBusy(false)
      setLoadingLabel(null)
    }
  }

  function handleGenerateConfirm(procNames: string[]): void {
    setNewProgramOpen(false)
    setSource(buildProgramSkeleton(procNames))
    setResult(null)
  }

  function handleTestProcedureClick(): void {
    if (busyRef.current) return
    const position = editorRef.current?.getPosition()
    if (!position) {
      setResult({ kind: 'error', errors: [], message: 'Place your cursor inside a procedure first.' })
      return
    }

    const lines = sourceRef.current.split('\n')
    const detected = findProcAtLine(lines, position.lineNumber)

    if (!detected.ok) {
      const message =
        detected.error.kind === 'no-proc' ? 'Place your cursor inside a procedure first.' : detected.error.reason
      setResult({ kind: 'error', errors: [], message })
      return
    }

    setResult(null)
    setTestProcTarget({ proc: detected.proc, firstProcLine: detected.firstProcLine })
  }

  function handleTestProcConfirm(values: Record<string, string>): void {
    if (!testProcTarget) return
    const { proc, firstProcLine } = testProcTarget
    setTestProcTarget(null)
    const syntheticSource = buildTestSource(sourceRef.current, proc, firstProcLine, values)
    void runSourceAndShowResult(syntheticSource)
  }

  const runRef = useRef(() => runSourceAndShowResult(sourceRef.current))
  runRef.current = () => runSourceAndShowResult(sourceRef.current)

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runRef.current()
    })
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <span>RunRPG</span>
        <div className="titlebar-right">
          <span className="conn-pill">
            <span className={`dot dot-${status}`} />
            {status === 'ready'
              ? `${prefs?.username || '—'}@${prefs?.host || '—'} · ${prefs?.library || 'not set'}`
              : STATUS_LABEL[status] + (statusMessage ? ` — ${statusMessage}` : '')}
          </span>
          <button
            className="connect-button"
            onClick={handleConnectClick}
            disabled={status === 'ready' || status === 'connecting' || status === 'reconnecting'}
          >
            {status === 'ready' ? 'Connected' : status === 'connecting' || status === 'reconnecting' ? 'Connecting…' : 'Connect'}
          </button>
        </div>
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
          <button onClick={() => runSourceAndShowResult(sourceRef.current)} disabled={busy}>
            {busy ? 'Running…' : 'Run'}
          </button>
          <button onClick={() => setSaveDialogOpen(true)} disabled={busy}>
            Save
          </button>
          <button className="ghost-button" onClick={() => setSavedOpen(true)} disabled={busy}>
            Saved…
          </button>
          <button className="ghost-button" onClick={() => setNewProgramOpen(true)} disabled={busy}>
            New Program
          </button>
          <button className="ghost-button" onClick={handleTestProcedureClick} disabled={busy}>
            Test Procedure
          </button>
          <span className="run-hint">Ctrl+Enter</span>
          {busy && loadingLabel && <span className="loading-label">{loadingLabel}</span>}
          {!busy && result && result.durationMs !== undefined && (
            <span className="duration">{(result.durationMs / 1000).toFixed(1)}s</span>
          )}
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

      {prefsOpen && <Preferences onClose={() => setPrefsOpen(false)} onSaved={setPrefs} />}
      {saveDialogOpen && <SaveDialog onClose={() => setSaveDialogOpen(false)} onConfirm={handleSaveConfirm} />}
      {savedOpen && <SavedPrograms onClose={() => setSavedOpen(false)} onSelect={handleSelectSaved} />}
      {newProgramOpen && (
        <NewProgramDialog dirty={dirty} onClose={() => setNewProgramOpen(false)} onConfirm={handleGenerateConfirm} />
      )}
      {testProcTarget && (
        <TestProcedureDialog
          proc={testProcTarget.proc}
          onClose={() => setTestProcTarget(null)}
          onConfirm={handleTestProcConfirm}
        />
      )}
    </div>
  )
}
