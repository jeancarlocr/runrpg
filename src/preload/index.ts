import { contextBridge } from 'electron'

// A partir de la Fase 1 (sesión SSH persistente) aquí se expondrán
// funciones como window.runrpg.connect(), .run(source), etc.
// que llamen por ipcRenderer al proceso main, que es el único
// que debe tocar ssh2 directamente.
contextBridge.exposeInMainWorld('runrpg', {
  version: '0.1.0'
})
