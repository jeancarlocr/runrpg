import { useState } from 'react'
import Modal from './Modal'
import type { ParsedProc } from './procParser'

export default function TestProcedureDialog({
  proc,
  onClose,
  onConfirm
}: {
  proc: ParsedProc
  onClose: () => void
  onConfirm: (values: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function update(name: string, value: string): void {
    setValues((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  function handleConfirm(): void {
    for (const p of proc.params) {
      const value = (values[p.name] ?? '').trim()
      if (value === '') {
        setError(`Enter a value for "${p.name}".`)
        return
      }
      if (p.kind === 'numeric' && !/^-?\d+(\.\d+)?$/.test(value)) {
        setError(`"${p.name}" must be a number.`)
        return
      }
    }
    onConfirm(values)
  }

  return (
    <Modal title={`Test Procedure: ${proc.name}`} onClose={onClose}>
      <p className="modal-hint">{proc.returnTypeSpec ? `Returns ${proc.returnTypeSpec}` : 'No return value'}</p>

      {proc.params.length === 0 && <p className="modal-hint">No parameters.</p>}

      {proc.params.map((p) => (
        <label key={p.name}>
          {p.name} ({p.typeSpec})
          <input
            value={values[p.name] ?? ''}
            onChange={(e) => update(p.name, e.target.value)}
            spellCheck={false}
          />
        </label>
      ))}

      {error && <p className="modal-error">{error}</p>}

      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleConfirm}>Run Test</button>
      </div>
    </Modal>
  )
}
