// Shared types for the Saved Programs flow (Phase 4).
// Must not import anything from ssh2/fs here — the renderer loads this file too.

export const SAVED_CHANNELS = {
  SAVE: 'saved:save',
  LIST: 'saved:list',
  LOAD: 'saved:load',
  UPDATE_ORIGINAL: 'saved:updateOriginal'
} as const

// The library/RUNRPGSRC target is RunRPG's own scratchpad. Shared between
// main (rpgSaved.ts) and renderer (App.tsx, to tell a RunRPG-owned load
// apart from a third-party one loaded via "Open…") so the literal can't
// drift between the two.
export const RUNRPG_SOURCE_FILE = 'RUNRPGSRC'

export interface SavedSnippetInfo {
  name: string
  savedAt: string
  sourceType: string | null
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
