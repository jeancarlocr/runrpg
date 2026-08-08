import { useEffect, useState } from 'react'
import Modal from './Modal'
import { isValidObjectName } from '../../shared/ibmiNames'
import { RUNRPG_SOURCE_FILE } from '../../shared/saved-types'
import type { SavedSnippetInfo } from '../../shared/saved-types'
import { useSourceFiles } from './useSourceFiles'

export default function SavedPrograms({
  defaultLibrary,
  onClose,
  onSelect
}: {
  defaultLibrary: string
  onClose: () => void
  onSelect: (library: string, file: string, name: string) => void
}) {
  const [library, setLibrary] = useState(defaultLibrary)
  const [file, setFile] = useState(RUNRPG_SOURCE_FILE)
  const [items, setItems] = useState<SavedSnippetInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const sourceFiles = useSourceFiles(library)

  async function refresh(): Promise<void> {
    const lib = library.trim().toUpperCase()
    const f = file.trim().toUpperCase()
    if (!isValidObjectName(lib) || !isValidObjectName(f)) {
      setError('Library and source file must start with a letter and be at most 10 letters/digits.')
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.runrpg.open.listMembers(lib, f)
      if (!result.ok) {
        setError(result.message ?? 'Could not list saved snippets.')
        setItems([])
        return
      }
      setItems(result.items ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // Only on mount — further browsing is triggered explicitly via the Browse button.
  }, [])

  return (
    <Modal title="Saved Programs" onClose={onClose}>
      <div className="form-grid">
        <label>
          Library
          <input
            value={library}
            onChange={(e) => setLibrary(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void refresh()
            }}
            spellCheck={false}
            maxLength={10}
          />
        </label>
        <label>
          Source file
          <input
            value={file}
            onChange={(e) => setFile(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void refresh()
            }}
            spellCheck={false}
            maxLength={10}
            list="saved-programs-source-files"
          />
          <datalist id="saved-programs-source-files">
            {sourceFiles.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="modal-actions">
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Browsing…' : 'Browse'}
        </button>
      </div>

      {error && <p className="modal-error">{error}</p>}
      {!error && items === null && <p className="modal-hint">Loading…</p>}
      {!error && items !== null && items.length === 0 && <p className="modal-hint">Nothing saved here yet.</p>}
      {!error && items && items.length > 0 && (
        <ul className="saved-list">
          {items.map((item) => (
            <li key={item.name}>
              <button
                className="saved-item"
                onClick={() => onSelect(library.trim().toUpperCase(), file.trim().toUpperCase(), item.name)}
              >
                <span className="saved-name">{item.name}</span>
                <span className="saved-date">{item.savedAt}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
