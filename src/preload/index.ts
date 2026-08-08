import { contextBridge, ipcRenderer } from 'electron'
import { SSH_CHANNELS } from '../shared/ssh-types'
import type { CommandResult, ConnectResult, SshStatusPayload } from '../shared/ssh-types'
import { RPG_CHANNELS } from '../shared/rpg-types'
import type { RunRpgResult } from '../shared/rpg-types'
import { PREFS_CHANNELS } from '../shared/prefs-types'
import type { AppPrefs, SavePrefsResult } from '../shared/prefs-types'
import { SAVED_CHANNELS } from '../shared/saved-types'
import type { ListSavedResult, LoadSavedResult, SaveSnippetResult } from '../shared/saved-types'
import { OPEN_CHANNELS } from '../shared/open-types'
import type { ListFilesResult } from '../shared/open-types'

// Only bridge to the main process: the renderer never imports ssh2 or
// touches credentials, it only invokes these methods over IPC.
contextBridge.exposeInMainWorld('runrpg', {
  version: '0.1.0',
  ssh: {
    connect: (): Promise<ConnectResult> => ipcRenderer.invoke(SSH_CHANNELS.CONNECT),
    run: (command: string): Promise<CommandResult> => ipcRenderer.invoke(SSH_CHANNELS.RUN, command),
    disconnect: (): Promise<void> => ipcRenderer.invoke(SSH_CHANNELS.DISCONNECT),
    onStatus: (callback: (payload: SshStatusPayload) => void): (() => void) => {
      const listener = (_event: unknown, payload: SshStatusPayload): void => callback(payload)
      ipcRenderer.on(SSH_CHANNELS.STATUS, listener)
      return () => ipcRenderer.removeListener(SSH_CHANNELS.STATUS, listener)
    }
  },
  rpg: {
    run: (sourceCode: string): Promise<RunRpgResult> => ipcRenderer.invoke(RPG_CHANNELS.RUN, sourceCode)
  },
  prefs: {
    get: (): Promise<AppPrefs | null> => ipcRenderer.invoke(PREFS_CHANNELS.GET),
    save: (prefs: AppPrefs): Promise<SavePrefsResult> => ipcRenderer.invoke(PREFS_CHANNELS.SAVE, prefs),
    onOpen: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(PREFS_CHANNELS.OPEN, listener)
      return () => ipcRenderer.removeListener(PREFS_CHANNELS.OPEN, listener)
    }
  },
  saved: {
    save: (name: string, sourceCode: string): Promise<SaveSnippetResult> =>
      ipcRenderer.invoke(SAVED_CHANNELS.SAVE, name, sourceCode),
    list: (): Promise<ListSavedResult> => ipcRenderer.invoke(SAVED_CHANNELS.LIST),
    load: (name: string): Promise<LoadSavedResult> => ipcRenderer.invoke(SAVED_CHANNELS.LOAD, name),
    updateOriginal: (library: string, file: string, name: string, sourceCode: string): Promise<SaveSnippetResult> =>
      ipcRenderer.invoke(SAVED_CHANNELS.UPDATE_ORIGINAL, library, file, name, sourceCode)
  },
  open: {
    listFiles: (library: string): Promise<ListFilesResult> => ipcRenderer.invoke(OPEN_CHANNELS.LIST_FILES, library),
    listMembers: (library: string, file: string): Promise<ListSavedResult> =>
      ipcRenderer.invoke(OPEN_CHANNELS.LIST_MEMBERS, library, file),
    loadMember: (library: string, file: string, name: string): Promise<LoadSavedResult> =>
      ipcRenderer.invoke(OPEN_CHANNELS.LOAD_MEMBER, library, file, name)
  }
})
