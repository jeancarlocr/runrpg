import { useEffect, useRef, useState } from 'react'
import { isValidObjectName } from '../../shared/ibmiNames'

const DEBOUNCE_MS = 400

/**
 * Debounced source-file suggestions for a library, backed by the same
 * listFiles() call "Open…" uses. Never surfaces an error — an invalid
 * library or a failed query just means no suggestions, since callers use
 * this to power a <datalist> that degrades to free text on its own.
 *
 * The very first successful load (typically a library already prefilled
 * when the dialog opens) skips the debounce delay — only loads *after*
 * that one debounce on further edits. hasLoadedOnce is flipped inside the
 * request's success callback, not when the timer is scheduled: React
 * StrictMode double-invokes this effect on mount (schedule → cancel →
 * schedule again), so a flag set at schedule time would already be "used
 * up" by the cancelled first pass, leaving the surviving pass to wait out
 * the full debounce anyway.
 */
export function useSourceFiles(library: string): string[] {
  const [files, setFiles] = useState<string[]>([])
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const lib = library.trim().toUpperCase()
    if (!isValidObjectName(lib)) {
      setFiles([])
      return
    }

    let cancelled = false
    const delay = hasLoadedOnce.current ? DEBOUNCE_MS : 0
    const timer = setTimeout(() => {
      window.runrpg.open.listFiles(lib).then((result) => {
        if (cancelled) return
        hasLoadedOnce.current = true
        setFiles(result.ok ? (result.items ?? []).map((f) => f.name) : [])
      })
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [library])

  return files
}
