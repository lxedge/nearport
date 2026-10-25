import { useState, type FormEvent } from 'react'
import { createMainnetNamedAccount } from '../lib/near'
import './CreateNamedAccount.css'

const DEPOSIT_NEAR = '0.1'

interface CreateNamedAccountProps {
  seedPhrase: string
  funderAccountId: string
  onComplete: (accountId: string) => void
  onBack: () => void
}

// One dot-separated segment of a NEAR named account: lowercase alphanumerics
// with `-`/`_` only between alphanumeric runs.
function isValidName(name: string): boolean {
  return /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(name)
}

export default function CreateNamedAccount({
  seedPhrase,
  funderAccountId,
  onComplete,
  onBack,
}: CreateNamedAccountProps) {
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
    setError('')
    setBusy(true)
    try {
      const accountId = await createMainnetNamedAccount(seedPhrase, funderAccountId, trimmed, DEPOSIT_NEAR)
      onComplete(accountId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed.')
      setBusy(false)
    }
  }

  return (
    <div className="create-named">
      <header className="create-named-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Create mainnet account</h1>
      </header>

      <p className="hint">
        Creates <code>{name.trim() || 'yourname'}.near</code> and transfers {DEPOSIT_NEAR} NEAR to it
        from your current account.
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
            <span className="suffix">.near</span>
          </div>
        </label>

        {error && <span className="error">{error}</span>}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
