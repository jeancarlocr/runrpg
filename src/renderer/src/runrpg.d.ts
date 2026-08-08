import type { CommandResult, ConnectResult, SshStatusPayload } from '../../shared/ssh-types'
import type { RunRpgResult } from '../../shared/rpg-types'
import type { AppPrefs, SavePrefsResult } from '../../shared/prefs-types'
import type { ListSavedResult, LoadSavedResult, SaveSnippetResult } from '../../shared/saved-types'
import type { ListFilesResult } from '../../shared/open-types'

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
        save: (library: string, file: string, name: string, sourceCode: string) => Promise<SaveSnippetResult>
        updateOriginal: (library: string, file: string, name: string, sourceCode: string) => Promise<SaveSnippetResult>
      }
      open: {
        listFiles: (library: string) => Promise<ListFilesResult>
        listMembers: (library: string, file: string) => Promise<ListSavedResult>
        loadMember: (library: string, file: string, name: string) => Promise<LoadSavedResult>
      }
    }
  }
}
