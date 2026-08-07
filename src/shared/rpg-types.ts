// Shared types for the RPG compile/run pipeline (Phase 2).
// Must not import anything from ssh2 here — the renderer loads this file too.

export const RPG_CHANNELS = {
  RUN: 'rpg:run'
} as const

export interface RunRpgResult {
  compiled: boolean
  compileErrors?: string[]
  output?: string
  error?: string
}
