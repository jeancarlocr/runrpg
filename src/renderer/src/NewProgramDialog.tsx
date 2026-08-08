import { useState } from 'react'
import Modal from './Modal'
import { isValidProcName } from './rpgTemplate'

export default function NewProgramDialog({
  dirty,
  onClose,
  onConfirm
}: {
  dirty: boolean
  onClose: () => void
  onConfirm: (procNames: string[]) => void
}) {
  const [namesInput, setNamesInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleConfirm(): void {
    const names = namesInput
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)

    if (names.length === 0) {
      setError('Enter at least one procedure name.')
      return
    }

    const invalid = names.filter((n) => !isValidProcName(n))
    if (invalid.length > 0) {
      setError(
        `Invalid procedure name(s): ${invalid.join(', ')} — must start with a letter and contain only letters, digits, or underscores.`
      )
      return
    }

    onConfirm(names)
  }

  return (
    <Modal title="New Program" onClose={onClose}>
      <label>
        Procedure names (comma-separated)
        <input
          value={namesInput}
          onChange={(e) => {
            setNamesInput(e.target.value)
            setError(null)
          }}
          spellCheck={false}
          autoFocus
          placeholder="validateCustomer, calculateDiscount, buildMessage"
        />
      </label>

      {error && <p className="modal-error">{error}</p>}
      {!error && dirty && (
        <p className="modal-warning">The editor has unsaved changes — generating will replace them.</p>
      )}

      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleConfirm}>{dirty ? 'Discard & Generate' : 'Generate'}</button>
      </div>
    </Modal>
  )
}
