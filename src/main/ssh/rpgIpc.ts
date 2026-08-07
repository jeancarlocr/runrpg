import { ipcMain } from 'electron'
import { runRpgSnippet } from './rpgRunner'
import { RPG_CHANNELS } from '../../shared/rpg-types'

let registered = false

export function registerRpgIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(RPG_CHANNELS.RUN, async (_event, sourceCode: string) => {
    return runRpgSnippet(sourceCode)
  })
}
