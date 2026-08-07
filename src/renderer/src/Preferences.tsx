import { useEffect, useState } from 'react'
import Modal from './Modal'
import type { AppPrefs } from '../../shared/prefs-types'

interface FormState {
  host: string
  port: string
  username: string
  password: string
  library: string
}

const EMPTY_FORM: FormState = { host: '', port: '', username: '', password: '', library: '' }

export default function Preferences({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.runrpg.prefs.get().then((prefs) => {
      if (cancelled) return
      if (prefs) {
        setForm({
          host: prefs.host,
          port: String(prefs.port),
          username: prefs.username,
          password: prefs.password,
          library: prefs.library
        })
      }
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validate(): string | null {
    if (!form.host.trim()) return 'Host is required.'
    if (!form.username.trim()) return 'Username is required.'
    const port = Number(form.port)
    if (!form.port.trim() || !Number.isInteger(port) || port <= 0 || port > 65535) {
      return 'Port must be a valid number.'
    }
    return null
  }

  async function handleSave(): Promise<void> {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const prefs: AppPrefs = {
        host: form.host.trim(),
        port: Number(form.port),
        username: form.username.trim(),
        password: form.password,
        library: form.library.trim().toUpperCase()
      }
      const result = await window.runrpg.prefs.save(prefs)
      if (!result.ok) {
        setError(result.message ?? 'Could not save preferences.')
        return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <Modal title="Preferences" onClose={onClose}>
        <p className="modal-hint">Loading…</p>
      </Modal>
    )
  }

  return (
    <Modal title="Preferences" onClose={onClose}>
      <div className="form-grid">
        <label>
          Host
          <input value={form.host} onChange={(e) => update('host', e.target.value)} spellCheck={false} />
        </label>
        <label>
          Port
          <input
            value={form.port}
            onChange={(e) => update('port', e.target.value)}
            spellCheck={false}
            inputMode="numeric"
          />
        </label>
        <label>
          Username
          <input value={form.username} onChange={(e) => update('username', e.target.value)} spellCheck={false} />
        </label>
        <label>
          Password
          <div className="password-row">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              spellCheck={false}
            />
            <button type="button" className="ghost-button" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <label>
          Library
          <input
            value={form.library}
            onChange={(e) => update('library', e.target.value.toUpperCase())}
            spellCheck={false}
            placeholder="e.g. MYLIB"
          />
        </label>
      </div>

      {error && <p className="modal-error">{error}</p>}

      <div className="modal-actions">
        <button onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
