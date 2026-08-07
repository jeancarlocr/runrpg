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

export default function App() {
  const [status, setStatus] = useState<SshStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')

  useEffect(() => {
    return window.runrpg.ssh.onStatus((payload) => {
      setStatus(payload.status)
      setStatusMessage(payload.message)
    })
  }, [])

  async function runAndLog(command: string): Promise<boolean> {
    setOutput((prev) => prev + `\n$ ${command}\n`)
    const result = await window.runrpg.ssh.run(command)
    console.log(`[runrpg] result ${command}`, result)

    if (!result.ok) {
      setOutput((prev) => prev + `(no response) ${result.message}\n`)
      return false
    }

    const stderrLine = result.stderr ? ` [stderr: ${result.stderr}]` : ''
    setOutput((prev) => prev + `(exit ${result.exitCode}) ${result.stdout}${stderrLine}\n`)
    return true
  }

  async function handleTestClick(): Promise<void> {
    setBusy(true)
    setOutput('Connecting...\n')
    try {
      const connectResult = await window.runrpg.ssh.connect()
      if (!connectResult.ok) {
        setOutput((prev) => prev + `Error connecting: ${connectResult.message}\n`)
        return
      }
      setOutput((prev) => prev + 'Connected.\n')

      // Isolates whether the problem is specific to OUTPUT(*PRINT)/spool:
      // neither of these two commands touches the screen or spool, both
      // should complete almost instantly, one succeeding and the other
      // failing on purpose.
      const ok1 = await runAndLog("system 'ADDLIBLE LIB(QGPL)'")
      if (!ok1) return
      await runAndLog("system 'CHKOBJ OBJ(QSYS/NOEXISTE123) OBJTYPE(*LIB)'")
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

      <main className="placeholder">
        <h1>Day 1 ✅ / Phase 1 in progress</h1>
        <p>
          Persistent SSH session against pub400 (PASE/bash,{' '}
          <code>/QOpenSys/usr/bin/system</code>). Manual smoke test: connects and runs two
          trivial CL commands without OUTPUT(*PRINT) to isolate whether spool was the cause
          of the timeouts.
        </p>

        <button onClick={handleTestClick} disabled={busy}>
          {busy ? 'Running...' : 'Test SSH'}
        </button>

        {output && <pre className="output">{output}</pre>}
      </main>
    </div>
  )
}
