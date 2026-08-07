import { useEffect, useState } from 'react'
import Modal from './Modal'
import { isValidObjectName } from '../../shared/ibmiNames'

export default function SaveDialog({
  onClose,
  onConfirm
}: {
  onClose: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [existingNames, setExistingNames] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    window.runrpg.saved.list().then((result) => {
      if (!cancelled && result.ok) {
        setExistingNames((result.items ?? []).map((item) => item.name))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const upperName = name.trim().toUpperCase()
  const collision = upperName.length > 0 && existingNames.includes(upperName)

  function handleConfirm(): void {
    if (!isValidObjectName(upperName)) {
      setError('Name must start with a letter and be at most 10 letters/digits.')
      return
    }
    onConfirm(upperName)
  }

  return (
    <Modal title="Save snippet as..." onClose={onClose}>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          spellCheck={false}
          autoFocus
          maxLength={10}
        />
      </label>

      {error && <p className="modal-error">{error}</p>}
      {!error && collision && (
        <p className="modal-warning">&quot;{upperName}&quot; already exists — saving will overwrite it.</p>
      )}

      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleConfirm}>{collision ? 'Overwrite' : 'Save'}</button>
      </div>
    </Modal>
  )
}
