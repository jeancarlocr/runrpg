import { useEffect, useState } from 'react'
import Modal from './Modal'
import type { SavedSnippetInfo } from '../../shared/saved-types'

export default function SavedPrograms({
  onClose,
  onSelect
}: {
  onClose: () => void
  onSelect: (name: string) => void
}) {
  const [items, setItems] = useState<SavedSnippetInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.runrpg.saved.list().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message ?? 'Could not list saved snippets.')
        setItems([])
        return
      }
      setItems(result.items ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Modal title="Saved Programs" onClose={onClose}>
      {error && <p className="modal-error">{error}</p>}
      {!error && items === null && <p className="modal-hint">Loading…</p>}
      {!error && items !== null && items.length === 0 && <p className="modal-hint">Nothing saved yet.</p>}
      {items && items.length > 0 && (
        <ul className="saved-list">
          {items.map((item) => (
            <li key={item.name}>
              <button className="saved-item" onClick={() => onSelect(item.name)}>
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
