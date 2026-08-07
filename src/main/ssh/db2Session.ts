import type { Client, ClientChannel } from 'ssh2'

const PROMPT = 'DB2>'
const STARTUP_TIMEOUT_MS = 15000
const DEFAULT_STATEMENT_TIMEOUT_MS = 20000

/**
 * One throwaway interactive Db2 for i SQL session, hosted by a single
 * long-lived `system "call QSYS/QZDFMDB2 ..."` exec channel.
 *
 * Why this exists at all (see ARCHITECTURE.md for the full story): every
 * separate `client.exec()` call on this system gets its own throwaway
 * QTEMP, even multiple `system` invocations chained in one script. QZDFMDB2
 * is one exec call that stays alive for as long as we keep writing
 * statements to its stdin, so everything run through it via
 * `QSYS2.QCMDEXC()` shares one QTEMP. The literal "DB2>" prompt it prints
 * after each statement doubles as a free completion marker.
 *
 * Scoped to a single `runRpgSnippet()` call: opened, used for compile+call,
 * then closed. No need to keep it alive across separate "Run" clicks.
 */
export class Db2Session {
  private stream: ClientChannel | null = null
  private buffer = ''
  private waiter: { resolve: (text: string) => void; reject: (err: Error) => void; timer: NodeJS.Timeout } | null =
    null

  private constructor(private readonly client: Client) {}

  static async start(client: Client): Promise<Db2Session> {
    const session = new Db2Session(client)
    await session.open()
    return session
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.exec(`system "call QSYS/QZDFMDB2 PARM('-d' '-i' '-t')"`, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        this.stream = stream
        const waitForBanner = this.waitForPrompt(STARTUP_TIMEOUT_MS)

        stream.on('data', (chunk: Buffer) => this.onData(chunk))
        stream.stderr.on('data', (chunk: Buffer) => this.onData(chunk))
        stream.on('close', () => {
          if (this.waiter) {
            const reject = this.waiter.reject
            this.clearWaiter()
            reject(new Error('The QZDFMDB2 session closed unexpectedly.'))
          }
          this.stream = null
        })

        waitForBanner.then(() => resolve()).catch(reject)
      })
    })
  }

  /**
   * Sends one SQL statement and resolves with the raw text printed before
   * the next "DB2>" prompt (compiler listings, CLI errors, SELECT result
   * tables — whatever that statement produced). Statements must be
   * terminated with `;` since the session was started with `-t`.
   */
  async run(sql: string, timeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS): Promise<string> {
    if (!this.stream) {
      throw new Error('Db2Session is not open.')
    }
    this.buffer = ''
    const result = this.waitForPrompt(timeoutMs)
    this.stream.write(`${sql}\n`)
    return result
  }

  async close(): Promise<void> {
    const stream = this.stream
    if (!stream) return
    this.stream = null
    stream.write('quit;\n')
    stream.end()
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf-8')
    if (this.waiter && this.buffer.trimEnd().endsWith(PROMPT)) {
      const text = this.buffer
      this.buffer = ''
      const resolve = this.waiter.resolve
      this.clearWaiter()
      resolve(text)
    }
  }

  private waitForPrompt(timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.clearWaiter()
        reject(new Error(`Timed out waiting for the DB2 prompt (${timeoutMs}ms).`))
      }, timeoutMs)
      this.waiter = { resolve, reject, timer }
    })
  }

  private clearWaiter(): void {
    if (this.waiter) clearTimeout(this.waiter.timer)
    this.waiter = null
  }
}
