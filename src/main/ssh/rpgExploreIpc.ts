import { ipcMain } from 'electron'
import { listLibrarySourceFiles } from './rpgExplore'
import { listMembers, loadMember } from './rpgSaved'
import { OPEN_CHANNELS } from '../../shared/open-types'

let registered = false

export function registerOpenIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(OPEN_CHANNELS.LIST_FILES, async (_event, library: string) => {
    return listLibrarySourceFiles(library)
  })

  ipcMain.handle(OPEN_CHANNELS.LIST_MEMBERS, async (_event, library: string, file: string) => {
    return listMembers(library, file)
  })

  ipcMain.handle(OPEN_CHANNELS.LOAD_MEMBER, async (_event, library: string, file: string, name: string) => {
    return loadMember(library, file, name)
  })
}
