import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface SshConnectConfig {
  host: string
  port: number
  username: string
  password: string
}

const CONFIG_FILENAME = 'runrpg.local.json'

// Phase 1 (dev-only): credentials live in a gitignored JSON file at the
// project root, read only by the main process. Once we package the app
// (later phases) this will move to app.getPath('userData') plus a UI flow
// for capturing credentials, instead of a local repo file.
export function loadSshConfig(): SshConnectConfig {
  const configPath = join(process.cwd(), CONFIG_FILENAME)

  if (!existsSync(configPath)) {
    throw new Error(
      `Could not find ${CONFIG_FILENAME} in the project root. ` +
        `Copy ${CONFIG_FILENAME}.example to ${CONFIG_FILENAME} and fill in your pub400 credentials.`
    )
  }

  const raw = JSON.parse(readFileSync(configPath, 'utf-8'))

  for (const field of ['host', 'port', 'username', 'password']) {
    if (raw[field] === undefined || raw[field] === '') {
      throw new Error(`Missing field "${field}" in ${CONFIG_FILENAME}.`)
    }
  }

  return {
    host: String(raw.host),
    port: Number(raw.port),
    username: String(raw.username),
    password: String(raw.password)
  }
}
