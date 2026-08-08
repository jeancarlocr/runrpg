import { useState } from 'react'
import Modal from './Modal'
import type { SourceFileInfo } from '../../shared/open-types'
import type { SavedSnippetInfo } from '../../shared/saved-types'

type FileNodeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; members: SavedSnippetInfo[] }
  | { status: 'error'; message: string }

function memberLabel(member: SavedSnippetInfo): string {
  return member.sourceType ? `${member.name}.${member.sourceType.toLowerCase()}` : member.name
}

export default function OpenDialog({
  onClose,
  onSelect
}: {
  onClose: () => void
  onSelect: (library: string, file: string, name: string) => void
}) {
  const [libraryInput, setLibraryInput] = useState('')
  const [library, setLibrary] = useState<string | null>(null)
  const [files, setFiles] = useState<SourceFileInfo[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  // expanded = which files are visually open right now.
  // fileNodes = which files have ever had their members fetched, and the
  // result — kept separate so collapsing never discards the cached members
  // and re-expanding the same file never re-queries.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [fileNodes, setFileNodes] = useState<Record<string, FileNodeState>>({})

  async function handleBrowseLibrary(): Promise<void> {
    const lib = libraryInput.trim().toUpperCase()
    if (!lib) {
      setLibraryError('Enter a library name.')
      return
    }
    setLibraryLoading(true)
    setLibraryError(null)
    try {
      const result = await window.runrpg.open.listFiles(lib)
      if (!result.ok) {
        setLibraryError(result.message ?? 'Could not list that library.')
        return
      }
      setLibrary(lib)
      setFiles(result.items ?? [])
      setExpanded(new Set())
      setFileNodes({})
    } finally {
      setLibraryLoading(false)
    }
  }

  function handleChangeLibrary(): void {
    setLibrary(null)
    setFiles([])
    setExpanded(new Set())
    setFileNodes({})
    setLibraryError(null)
  }

  async function loadMembers(fileName: string): Promise<void> {
    setFileNodes((prev) => ({ ...prev, [fileName]: { status: 'loading' } }))
    const result = await window.runrpg.open.listMembers(library as string, fileName)
    setFileNodes((prev) => ({
      ...prev,
      [fileName]: result.ok
        ? { status: 'loaded', members: result.items ?? [] }
        : { status: 'error', message: result.message ?? 'Could not list members.' }
    }))
  }

  function toggleFile(fileName: string): void {
    const isExpanded = expanded.has(fileName)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (isExpanded) next.delete(fileName)
      else next.add(fileName)
      return next
    })
    if (!isExpanded) {
      const node = fileNodes[fileName]
      if (!node || node.status === 'idle') {
        void loadMembers(fileName)
      }
    }
  }

  return (
    <Modal title="Open" onClose={onClose} wide>
      {library === null && (
        <>
          <label>
            Library
            <input
              value={libraryInput}
              onChange={(e) => {
                setLibraryInput(e.target.value)
                setLibraryError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleBrowseLibrary()
              }}
              spellCheck={false}
              autoFocus
              placeholder="e.g. QGPL"
            />
          </label>

          {libraryError && <p className="modal-error">{libraryError}</p>}

          <div className="modal-actions">
            <button onClick={onClose}>Cancel</button>
            <button onClick={handleBrowseLibrary} disabled={libraryLoading}>
              {libraryLoading ? 'Browsing…' : 'Browse'}
            </button>
          </div>
        </>
      )}

      {library !== null && (
        <div className="tree">
          <div className="tree-root">
            <span className="tree-root-name">{library}</span>
            <button className="ghost-button tree-change-lib" onClick={handleChangeLibrary}>
              Change library
            </button>
          </div>

          {files.length === 0 && <p className="modal-hint">No source files in this library.</p>}

          <ul className="tree-list">
            {files.map((f) => {
              const isOpen = expanded.has(f.name)
              const node = fileNodes[f.name]
              return (
                <li key={f.name}>
                  <button className="tree-file" onClick={() => toggleFile(f.name)}>
                    <span className="tree-arrow">{isOpen ? '▾' : '▸'}</span>
                    <span className="tree-file-name">{f.name}</span>
                    {f.description && <span className="tree-file-desc">{f.description}</span>}
                  </button>

                  {isOpen && (
                    <ul className="tree-list tree-members">
                      {(!node || node.status === 'loading') && <li className="tree-hint">Loading…</li>}
                      {node?.status === 'error' && <li className="tree-error">{node.message}</li>}
                      {node?.status === 'loaded' && node.members.length === 0 && (
                        <li className="tree-hint">No members.</li>
                      )}
                      {node?.status === 'loaded' &&
                        node.members.map((m) => (
                          <li key={m.name}>
                            <button className="tree-member" onClick={() => onSelect(library, f.name, m.name)}>
                              <span className="tree-member-name">{memberLabel(m)}</span>
                              <span className="tree-member-date">{m.savedAt}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Modal>
  )
}
