import { ipcMain } from 'electron'
import { loadSavedSnippet, listSavedSnippets, saveRpgSnippet, updateOriginalMember } from './rpgSaved'
import { SAVED_CHANNELS } from '../../shared/saved-types'

let registered = false

export function registerSavedIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(SAVED_CHANNELS.SAVE, async (_event, name: string, sourceCode: string) => {
    return saveRpgSnippet(name, sourceCode)
  })

  ipcMain.handle(SAVED_CHANNELS.LIST, async () => {
    return listSavedSnippets()
  })

  ipcMain.handle(SAVED_CHANNELS.LOAD, async (_event, name: string) => {
    return loadSavedSnippet(name)
  })

  ipcMain.handle(
    SAVED_CHANNELS.UPDATE_ORIGINAL,
    async (_event, library: string, file: string, name: string, sourceCode: string) => {
      return updateOriginalMember(library, file, name, sourceCode)
    }
  )
}
