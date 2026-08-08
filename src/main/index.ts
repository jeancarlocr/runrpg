import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { registerSshIpc } from './ssh/ipc'
import { registerRpgIpc } from './ssh/rpgIpc'
import { registerPrefsIpc } from './ssh/prefsIpc'
import { registerSavedIpc } from './ssh/rpgSavedIpc'
import { registerOpenIpc } from './ssh/rpgExploreIpc'
import { sshSession } from './ssh/sshSession'
import { PREFS_CHANNELS } from '../shared/prefs-types'

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

  // autoHideMenuBar stays on (Alt still reveals it) to keep the custom dark
  // titlebar clean — the native gray menu bar would clash with it. The
  // CmdOrCtrl+, accelerator fires regardless of whether the bar is shown.
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => win.webContents.send(PREFS_CHANNELS.OPEN)
        }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerSshIpc()
  registerRpgIpc()
  registerPrefsIpc()
  registerSavedIpc()
  registerOpenIpc()
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
