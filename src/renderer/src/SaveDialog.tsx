import { useEffect, useState } from 'react'
import Modal from './Modal'
import { isValidObjectName } from '../../shared/ibmiNames'
import { RUNRPG_SOURCE_FILE } from '../../shared/saved-types'
import { useSourceFiles } from './useSourceFiles'

export interface SnippetOrigin {
  library: string
  file: string
  name: string
}

type Step = 'choice' | 'name'

export default function SaveDialog({
  origin,
  defaultLibrary,
  onClose,
  onSaveNew,
  onUpdateOriginal
}: {
  origin: SnippetOrigin | null
  defaultLibrary: string
  onClose: () => void
  onSaveNew: (library: string, file: string, name: string) => void
  onUpdateOriginal: () => void
}) {
  const [step, setStep] = useState<Step>(origin ? 'choice' : 'name')
  const [library, setLibrary] = useState(origin?.library ?? defaultLibrary)
  const [file, setFile] = useState(origin?.file ?? RUNRPG_SOURCE_FILE)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [existingNames, setExistingNames] = useState<string[]>([])
  const sourceFiles = useSourceFiles(library)

  const upperLibrary = library.trim().toUpperCase()
  const upperFile = file.trim().toUpperCase()
  const upperName = name.trim().toUpperCase()

  useEffect(() => {
    if (!isValidObjectName(upperLibrary) || !isValidObjectName(upperFile)) {
      setExistingNames([])
      return
    }
    let cancelled = false
    window.runrpg.open.listMembers(upperLibrary, upperFile).then((result) => {
      if (!cancelled && result.ok) {
        setExistingNames((result.items ?? []).map((item) => item.name))
      }
    })
    return () => {
      cancelled = true
    }
  }, [upperLibrary, upperFile])

  const collision = upperName.length > 0 && existingNames.includes(upperName)

  function handleConfirm(): void {
    if (!isValidObjectName(upperLibrary)) {
      setError('Library must start with a letter and be at most 10 letters/digits.')
      return
    }
    if (!isValidObjectName(upperFile)) {
      setError('Source file must start with a letter and be at most 10 letters/digits.')
      return
    }
    if (!isValidObjectName(upperName)) {
      setError('Name must start with a letter and be at most 10 letters/digits.')
      return
    }
    onSaveNew(upperLibrary, upperFile, upperName)
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
            <button onClick={() => setStep('name')}>Save as new snippet</button>
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
        Library
        <input
          value={library}
          onChange={(e) => {
            setLibrary(e.target.value)
            setError(null)
          }}
          spellCheck={false}
          autoFocus
          maxLength={10}
        />
      </label>

      <label>
        Source file
        <input
          value={file}
          onChange={(e) => {
            setFile(e.target.value)
            setError(null)
          }}
          spellCheck={false}
          maxLength={10}
          list="save-dialog-source-files"
        />
        <datalist id="save-dialog-source-files">
          {sourceFiles.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>

      <label>
        Name
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          spellCheck={false}
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
