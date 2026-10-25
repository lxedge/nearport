import { useState, type FormEvent } from 'react'
import './SetPassword.css'

interface SetPasswordProps {
  onSubmit: (password: string) => void
  onBack: () => void
}

export default function SetPassword({ onSubmit, onBack }: SetPasswordProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setBusy(true)
    onSubmit(password)
  }

  return (
    <div className="set-password">
      <header className="set-password-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Set a password</h1>
      </header>

      <p className="hint">
        This password encrypts your seed phrase on this device and is required to unlock
        your wallet. It cannot be recovered if lost.
      </p>

      <form onSubmit={submit}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <span className="error">{error}</span>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Encrypting…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
