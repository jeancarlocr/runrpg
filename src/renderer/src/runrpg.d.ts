import type { CommandResult, ConnectResult, SshStatusPayload } from '../../shared/ssh-types'
import type { RunRpgResult } from '../../shared/rpg-types'
import type { AppPrefs, SavePrefsResult } from '../../shared/prefs-types'
import type { ListSavedResult, LoadSavedResult, SaveSnippetResult } from '../../shared/saved-types'

export {}

declare global {
  interface Window {
    runrpg: {
      version: string
      ssh: {
        connect: () => Promise<ConnectResult>
        run: (command: string) => Promise<CommandResult>
        disconnect: () => Promise<void>
        onStatus: (callback: (payload: SshStatusPayload) => void) => () => void
      }
      rpg: {
        run: (sourceCode: string) => Promise<RunRpgResult>
      }
      prefs: {
        get: () => Promise<AppPrefs | null>
        save: (prefs: AppPrefs) => Promise<SavePrefsResult>
        onOpen: (callback: () => void) => () => void
      }
      saved: {
        save: (name: string, sourceCode: string) => Promise<SaveSnippetResult>
        list: () => Promise<ListSavedResult>
        load: (name: string) => Promise<LoadSavedResult>
      }
    }
  }
}
