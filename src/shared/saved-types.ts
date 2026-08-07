// Shared types for the Saved Programs flow (Phase 4).
// Must not import anything from ssh2/fs here — the renderer loads this file too.

export const SAVED_CHANNELS = {
  SAVE: 'saved:save',
  LIST: 'saved:list',
  LOAD: 'saved:load'
} as const

export interface SavedSnippetInfo {
  name: string
  savedAt: string
}

export interface SaveSnippetResult {
  ok: boolean
  compiled: boolean
  compileErrors?: string[]
  error?: string
}

export interface ListSavedResult {
  ok: boolean
  items?: SavedSnippetInfo[]
  message?: string
}

export interface LoadSavedResult {
  ok: boolean
  source?: string
  message?: string
}
