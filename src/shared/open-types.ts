// Shared types for the "Open…" library/file/member browser (Phase 5).
// Must not import anything from ssh2/fs here — the renderer loads this file too.

export const OPEN_CHANNELS = {
  LIST_FILES: 'open:listFiles',
  LIST_MEMBERS: 'open:listMembers',
  LOAD_MEMBER: 'open:loadMember'
} as const

export interface SourceFileInfo {
  name: string
  description: string
}

export interface ListFilesResult {
  ok: boolean
  items?: SourceFileInfo[]
  message?: string
}
