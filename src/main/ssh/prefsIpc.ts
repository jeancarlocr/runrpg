import { ipcMain } from 'electron'
import { loadSshConfigOrNull, saveSshConfig } from './config'
import { PREFS_CHANNELS } from '../../shared/prefs-types'
import type { AppPrefs, SavePrefsResult } from '../../shared/prefs-types'
import { isValidObjectName } from '../../shared/ibmiNames'

let registered = false

export function registerPrefsIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(PREFS_CHANNELS.GET, (): AppPrefs | null => {
    return loadSshConfigOrNull()
  })

  ipcMain.handle(PREFS_CHANNELS.SAVE, (_event, prefs: AppPrefs): SavePrefsResult => {
    const host = prefs.host?.trim() ?? ''
    const username = prefs.username?.trim() ?? ''
    const password = prefs.password ?? ''
    const library = prefs.library?.trim().toUpperCase() ?? ''
    const port = Number(prefs.port)

    if (!host) return { ok: false, message: 'Host is required.' }
    if (!username) return { ok: false, message: 'Username is required.' }
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return { ok: false, message: 'Port must be a valid number.' }
    }
    if (library && !isValidObjectName(library)) {
      return { ok: false, message: 'Library must start with a letter and be at most 10 letters/digits.' }
    }

    saveSshConfig({ host, port, username, password, library })
    return { ok: true }
  })
}
