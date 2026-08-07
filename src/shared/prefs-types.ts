// Shared types for the Preferences flow (Phase 4).
// Must not import anything from ssh2/fs here — the renderer loads this file too.

export const PREFS_CHANNELS = {
  GET: 'prefs:get',
  SAVE: 'prefs:save',
  OPEN: 'prefs:open'
} as const

export interface AppPrefs {
  host: string
  port: number
  username: string
  password: string
  library: string
}

export interface SavePrefsResult {
  ok: boolean
  message?: string
}
