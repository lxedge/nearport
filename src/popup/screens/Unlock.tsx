import { useState, type FormEvent } from 'react'
import './Unlock.css'

interface UnlockProps {
  onSubmit: (password: string) => Promise<boolean>
}

export default function Unlock({ onSubmit }: UnlockProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || password.length === 0) return
    setBusy(true)
    setError('')
    const ok = await onSubmit(password)
    setBusy(false)
    if (!ok) setError('Incorrect password.')
  }

  return (
    <div className="unlock">
      <div className="brand">
        <div className="logo">◈</div>
        <h1>NearPort</h1>
      </div>

      <form onSubmit={submit}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <span className="error">{error}</span>}
        <button type="submit" className="primary" disabled={busy || password.length === 0}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
