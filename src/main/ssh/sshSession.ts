import { Client } from 'ssh2'
import { EventEmitter } from 'events'
import { loadSshConfig } from './config'
import { Db2Session } from './db2Session'
import type { CommandResult, SshStatus, SshStatusPayload } from '../../shared/ssh-types'

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 15000]
const DEFAULT_COMMAND_TIMEOUT_MS = 20000

/**
 * Persistent SSH session to a single host (pub400 during development).
 *
 * `client.connect()` happens once and the connection stays alive. Each
 * command runs on its own `exec` channel over that same connection (same
 * pattern used by Code for IBM i / vscode-ibmi): no pty and no text-marker
 * parsing needed, ssh2 delivers native exit code, stdout and stderr when the
 * exec channel closes.
 *
 * `runCommand()` is fine for independent one-off commands, but QTEMP does
 * NOT persist between separate calls to it — confirmed by testing, contrary
 * to what you'd expect from "one connection = one job." See ARCHITECTURE.md
 * §2 for the evidence. Anything that needs state to survive across steps
 * (like compile-then-call) must go through `withDb2Session()` instead.
 */
export class SshSession extends EventEmitter {
  private client: Client | null = null
  private status: SshStatus = 'idle'
  private explicitDisconnect = false
  private reconnectAttempt = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private connectPromise: Promise<void> | null = null

  // Serializes runCommand calls so the output in the renderer panel doesn't
  // interleave if two are fired almost at the same time.
  private queue: Promise<unknown> = Promise.resolve()

  getStatus(): SshStatus {
    return this.status
  }

  async connect(): Promise<void> {
    if (this.status === 'ready') return
    if (this.connectPromise) return this.connectPromise

    this.explicitDisconnect = false
    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async doConnect(): Promise<void> {
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

    const config = loadSshConfig()

    await new Promise<void>((resolve, reject) => {
      const client = new Client()

      client
        .on('ready', () => {
          this.client = client
          this.reconnectAttempt = 0
          this.setStatus('ready')
          resolve()
        })
        .on('error', (err) => {
          reject(err)
        })
        .on('close', () => {
          this.handleUnexpectedClose()
        })
        // IBM i's sshd often only advertises "keyboard-interactive" instead
        // of plain "password". If the server asks for that method, we answer
        // with the same password so the login doesn't break.
        .on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finish) => {
          finish([config.password])
        })
        .connect({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          tryKeyboard: true,
          readyTimeout: 20000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 3
        })
    })
  }

  private handleUnexpectedClose(): void {
    this.client = null

    if (this.explicitDisconnect) {
      this.setStatus('idle')
      return
    }

    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    if (this.reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
      this.setStatus(
        'error',
        `Could not reconnect after ${RECONNECT_DELAYS_MS.length} attempts. Reconnect manually.`
      )
      this.reconnectAttempt = 0
      return
    }

    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt]
    this.reconnectAttempt += 1
    this.setStatus('reconnecting', `Retrying in ${delay / 1000}s (attempt ${this.reconnectAttempt})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(() => {
        // doConnect already fires 'close'/'error' -> handleUnexpectedClose
        // takes care of chaining the next attempt.
      })
    }, delay)
  }

  /** Sets explicitDisconnect first so handleUnexpectedClose skips the reconnect. */
  async disconnect(): Promise<void> {
    this.explicitDisconnect = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectAttempt = 0

    this.client?.end()
    this.client = null
    this.setStatus('idle')
  }

  async runCommand(command: string, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS): Promise<CommandResult> {
    const task = this.queue.then(() => this.executeOne(command, timeoutMs))
    // If this command fails, it shouldn't break the queue for the next ones.
    this.queue = task.catch(() => undefined)
    return task
  }

  private executeOne(command: string, timeoutMs: number): Promise<CommandResult> {
    if (this.status !== 'ready' || !this.client) {
      return Promise.resolve({
        ok: false,
        stdout: '',
        exitCode: null,
        message: `No active SSH session (current status: ${this.status}). Connect before running commands.`
      })
    }

    const client = this.client

    return new Promise<CommandResult>((resolve) => {
      let settled = false
      let stdout = ''
      let stderr = ''
      let exitCode: number | null = null

      const timer = setTimeout(() => {
        finish({
          ok: false,
          stdout,
          exitCode: null,
          message: `Timed out waiting for the command result (${timeoutMs}ms).`
        })
      }, timeoutMs)

      function finish(result: CommandResult): void {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }

      client.exec(command, (err, stream) => {
        if (err) {
          finish({ ok: false, stdout: '', exitCode: null, message: err.message })
          return
        }

        stream
          .on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf-8')
          })
          .on('exit', (code: number) => {
            exitCode = code
          })
          .on('close', () => {
            finish({
              ok: true,
              stdout: stdout.trim(),
              exitCode,
              stderr: stderr.trim() || undefined
            })
          })

        stream.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf-8')
        })
      })
    })
  }

  /** Uploads text as a UTF-8 stream file over SFTP (reuses this connection, no new login). */
  async uploadText(remotePath: string, text: string): Promise<void> {
    const client = this.requireClient()
    await new Promise<void>((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }
        const stream = sftp.createWriteStream(remotePath)
        stream.on('close', resolve)
        stream.on('error', reject)
        stream.end(Buffer.from(text, 'utf-8'))
      })
    })
  }

  /** Downloads a remote file over SFTP and decodes it as UTF-8. */
  async downloadText(remotePath: string): Promise<string> {
    const client = this.requireClient()
    return new Promise<string>((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }
        const chunks: Buffer[] = []
        const stream = sftp.createReadStream(remotePath)
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        stream.on('error', reject)
      })
    })
  }

  /**
   * Opens a throwaway Db2 for i SQL session (see db2Session.ts), hands it to
   * `fn`, and always closes it afterward — this is the only way multi-step
   * work (compile then call) can share one QTEMP on this system.
   */
  async withDb2Session<T>(fn: (db2: Db2Session) => Promise<T>): Promise<T> {
    const client = this.requireClient()
    const db2 = await Db2Session.start(client)
    try {
      return await fn(db2)
    } finally {
      await db2.close()
    }
  }

  private requireClient(): Client {
    if (this.status !== 'ready' || !this.client) {
      throw new Error(`No active SSH session (current status: ${this.status}). Connect before running commands.`)
    }
    return this.client
  }

  private setStatus(status: SshStatus, message?: string): void {
    this.status = status
    const payload: SshStatusPayload = { status, message }
    this.emit('status', payload)
  }
}

export const sshSession = new SshSession()
