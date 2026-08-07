import { contextBridge, ipcRenderer } from 'electron'
import { SSH_CHANNELS } from '../shared/ssh-types'
import type { CommandResult, ConnectResult, SshStatusPayload } from '../shared/ssh-types'
import { RPG_CHANNELS } from '../shared/rpg-types'
import type { RunRpgResult } from '../shared/rpg-types'

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
  }
})
