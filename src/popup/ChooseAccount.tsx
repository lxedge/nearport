import { useState, type FormEvent } from 'react'
import { createTestnetNamedAccount } from '../lib/near'
import './ChooseAccount.css'

interface ChooseAccountProps {
  seedPhrase: string
  onComplete: (accountId: string) => void
  onSkip: () => void
  onBack: () => void
}

// One dot-separated segment of a NEAR named account: lowercase alphanumerics
// with `-`/`_` only between alphanumeric runs.
function isValidName(name: string): boolean {
  return /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(name)
}

export default function ChooseAccount({ seedPhrase, onComplete, onSkip, onBack }: ChooseAccountProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('Enter an account name.')
      return
    }
    if (trimmed.length > 56) {
      setError('Account name is too long.')
      return
    }
    if (!isValidName(trimmed)) {
      setError('Use lowercase letters, numbers, and - or _.')
      return
    }
    if (trimmed.startsWith('temp-')) {
      setError('Names starting with "temp-" are not allowed.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const accountId = await createTestnetNamedAccount(seedPhrase, trimmed)
      onComplete(accountId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed.')
      setBusy(false)
    }
  }

  return (
    <div className="choose-account">
      <header className="choose-account-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Choose account name</h1>
      </header>

      <p className="hint">
        Pick a readable testnet account. It is funded with test NEAR so you can start
        using it right away.
      </p>

      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Account name</span>
          <div className="name-input">
            <input
              type="text"
              placeholder="alice"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
            <span className="suffix">.testnet</span>
          </div>
        </label>

        {error && <span className="error">{error}</span>}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <button type="button" className="secondary" onClick={onSkip} disabled={busy}>
        Skip (use implicit address)
      </button>
    </div>
  )
}
