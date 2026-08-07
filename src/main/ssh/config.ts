import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface SshConnectConfig {
  host: string
  port: number
  username: string
  password: string
  library: string
}

const CONFIG_FILENAME = 'runrpg.local.json'

function configPath(): string {
  return join(process.cwd(), CONFIG_FILENAME)
}

// Phase 1 (dev-only): credentials live in a gitignored JSON file at the
// project root, read only by the main process. Phase 4 added a Preferences
// UI (Ctrl+,) that reads/writes this same file, so it no longer needs to be
// hand-edited — but it's still a repo-root file, not app.getPath('userData'),
// which is the packaging-time change still pending for later phases.
export function loadSshConfig(): SshConnectConfig {
  const path = configPath()

  if (!existsSync(path)) {
    throw new Error(
      `Could not find ${CONFIG_FILENAME} in the project root. Open Preferences (Ctrl+,) to create it.`
    )
  }

  const raw = JSON.parse(readFileSync(path, 'utf-8'))

  for (const field of ['host', 'port', 'username', 'password']) {
    if (raw[field] === undefined || raw[field] === '') {
      throw new Error(`Missing field "${field}" in ${CONFIG_FILENAME}. Open Preferences (Ctrl+,) to fix it.`)
    }
  }

  return {
    host: String(raw.host),
    port: Number(raw.port),
    username: String(raw.username),
    password: String(raw.password),
    library: raw.library ? String(raw.library) : ''
  }
}

/** Same as loadSshConfig(), but returns null instead of throwing — used by the Preferences form. */
export function loadSshConfigOrNull(): SshConnectConfig | null {
  try {
    return loadSshConfig()
  } catch {
    return null
  }
}

export function saveSshConfig(config: SshConnectConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
