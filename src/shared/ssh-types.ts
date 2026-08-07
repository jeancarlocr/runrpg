// Shared types between main, preload and renderer for the SSH bridge.
// Must not import anything from ssh2 here — the renderer loads this file too.

export const SSH_CHANNELS = {
  CONNECT: 'ssh:connect',
  RUN: 'ssh:run',
  DISCONNECT: 'ssh:disconnect',
  STATUS: 'ssh:status'
} as const

export type SshStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

export interface SshStatusPayload {
  status: SshStatus
  message?: string
}

export interface ConnectResult {
  ok: boolean
  message?: string
}

export interface CommandResult {
  ok: boolean
  stdout: string
  exitCode: number | null
  stderr?: string
  message?: string
}
