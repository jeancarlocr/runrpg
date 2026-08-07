import type { CommandResult, ConnectResult, SshStatusPayload } from '../../shared/ssh-types'
import type { RunRpgResult } from '../../shared/rpg-types'

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
    }
  }
}
