import { BrowserWindow, ipcMain } from 'electron'
import { sshSession } from './sshSession'
import { SSH_CHANNELS, type ConnectResult, type SshStatusPayload } from '../../shared/ssh-types'

function broadcastStatus(payload: SshStatusPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(SSH_CHANNELS.STATUS, payload)
  }
}

let registered = false

export function registerSshIpc(): void {
  if (registered) return
  registered = true

  sshSession.on('status', broadcastStatus)

  ipcMain.handle(SSH_CHANNELS.CONNECT, async (): Promise<ConnectResult> => {
    try {
      await sshSession.connect()
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(SSH_CHANNELS.RUN, async (_event, command: string) => {
    return sshSession.runCommand(command)
  })

  ipcMain.handle(SSH_CHANNELS.DISCONNECT, async () => {
    await sshSession.disconnect()
  })
}
