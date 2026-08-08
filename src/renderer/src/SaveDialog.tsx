import { useEffect, useState } from 'react'
import Modal from './Modal'
import { isValidObjectName } from '../../shared/ibmiNames'

export interface SnippetOrigin {
  library: string
  file: string
  name: string
}

type Step = 'choice' | 'name'

export default function SaveDialog({
  origin,
  onClose,
  onSaveNew,
  onUpdateOriginal
}: {
  origin: SnippetOrigin | null
  onClose: () => void
  onSaveNew: (name: string) => void
  onUpdateOriginal: () => void
}) {
  const [step, setStep] = useState<Step>(origin ? 'choice' : 'name')
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
    onSaveNew(upperName)
  }

  if (step === 'choice' && origin) {
    const target = `${origin.library}/${origin.file}/${origin.name}`
    return (
      <Modal title="Save" onClose={onClose}>
        <p className="modal-hint">
          This code was loaded from an existing member outside RunRPG&apos;s scratchpad.
        </p>

        <div className="save-choice">
          <div className="save-choice-option danger">
            <p className="modal-warning">
              This overwrites a real program — {target} — not a RunRPG scratchpad snippet.
            </p>
            <button onClick={onUpdateOriginal}>Update {target}</button>
          </div>

          <div className="save-choice-option">
            <p className="modal-hint">Keeps {target} untouched; saves this as a new snippet instead.</p>
            <button onClick={() => setStep('name')}>Save as new snippet in RUNRPGSRC</button>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Save snippet as..." onClose={onClose}>
      {origin && (
        <button className="ghost-button ghost-back" onClick={() => setStep('choice')}>
          ← Back
        </button>
      )}

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
