import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerSshIpc } from './ssh/ipc'
import { registerRpgIpc } from './ssh/rpgIpc'
import { sshSession } from './ssh/sshSession'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 720,
    backgroundColor: '#0F1216',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerSshIpc()
  registerRpgIpc()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  sshSession.disconnect()
})
