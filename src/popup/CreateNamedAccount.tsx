import { useState, type FormEvent } from 'react'
import { createNamedAccount, type Network } from '../lib/near'
import './CreateNamedAccount.css'

const DEPOSIT_NEAR = '0.1'

interface CreateNamedAccountProps {
  network: Network
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
  network,
  seedPhrase,
  funderAccountId,
  onComplete,
  onBack,
}: CreateNamedAccountProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const suffix = network === 'testnet' ? '.testnet' : '.near'

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
      const accountId = await createNamedAccount(seedPhrase, funderAccountId, trimmed, DEPOSIT_NEAR, network)
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
        <h1>Create named account</h1>
      </header>

      <p className="hint">
        Creates {name.trim() || 'yourname'}
        {suffix} and transfers {DEPOSIT_NEAR} NEAR to it from your current account.
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
            <span className="suffix">{suffix}</span>
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
