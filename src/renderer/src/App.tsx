import { useEffect, useState } from 'react'
import type { SshStatus } from '../../shared/ssh-types'

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

export default function App() {
  const [status, setStatus] = useState<SshStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState(DEFAULT_SNIPPET)
  const [output, setOutput] = useState('')

  useEffect(() => {
    return window.runrpg.ssh.onStatus((payload) => {
      setStatus(payload.status)
      setStatusMessage(payload.message)
    })
  }, [])

  async function handleRunClick(): Promise<void> {
    setBusy(true)
    setOutput('Connecting...\n')
    try {
      const connectResult = await window.runrpg.ssh.connect()
      if (!connectResult.ok) {
        setOutput((prev) => prev + `Error connecting: ${connectResult.message}\n`)
        return
      }
      setOutput((prev) => prev + 'Connected. Compiling and running...\n')

      const result = await window.runrpg.rpg.run(source)
      console.log('[runrpg] run result', result)

      if (!result.compiled) {
        setOutput(
          (prev) =>
            prev +
            '\nCompile failed.\n' +
            (result.compileErrors?.length ? result.compileErrors.join('\n') + '\n' : '') +
            (result.error ? `${result.error}\n` : '')
        )
        return
      }

      setOutput(
        (prev) =>
          prev +
          '\nCompiled OK.\n' +
          (result.output ? `--- output ---\n${result.output}` : '(no output)\n') +
          (result.error ? `\n${result.error}\n` : '')
      )
    } finally {
      setBusy(false)
    }
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

        <textarea
          className="source-editor"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
        />

        <button onClick={handleRunClick} disabled={busy}>
          {busy ? 'Running...' : 'Run'}
        </button>

        {output && <pre className="output">{output}</pre>}
      </main>
    </div>
  )
}
