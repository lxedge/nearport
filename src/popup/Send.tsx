import { useEffect, useState, type FormEvent } from 'react'
import { nearToYocto } from 'near-api-js'
import { getBalance, sendNear, type Network } from '../lib/near'
import './Send.css'

interface SendProps {
  accountId: string
  seedPhrase: string
  network: Network
  onBack: () => void
}

type BalanceStatus = 'loading' | 'ready' | 'error'
type SendStatus = 'idle' | 'sending' | 'sent'

// NEAR account id: 2-64 chars. Either an implicit account (64 lowercase hex
// chars) or a named account whose dot-separated segments are lowercase
// alphanumerics with `-`/`_` only between alphanumeric runs.
function isValidAccountId(id: string): boolean {
  if (id.length < 2 || id.length > 64) return false
  if (/^[0-9a-f]{64}$/.test(id)) return true
  return id.split('.').every((seg) => /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(seg))
}

export default function Send({ accountId, seedPhrase, network, onBack }: SendProps) {
  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState('—')
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>('loading')
  const [status, setStatus] = useState<SendStatus>('idle')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')

  useEffect(() => {
    let cancelled = false
    setBalanceStatus('loading')
    getBalance(accountId, network)
      .then((b) => {
        if (cancelled) return
        setBalance(b)
        setBalanceStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setBalanceStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [accountId, network])

  function validate(): string | null {
    const recipient = receiver.trim()
    if (recipient.length === 0) return 'Enter a recipient address.'
    if (!isValidAccountId(recipient)) return 'Invalid recipient address.'
    if (recipient === accountId) return 'Recipient is your own address.'

    let yocto: bigint
    try {
      yocto = nearToYocto(amount.trim() as `${number}`)
    } catch {
      return 'Enter a valid amount (max 24 decimals).'
    }
    if (yocto <= 0n) return 'Amount must be greater than zero.'

    if (balanceStatus === 'ready') {
      try {
        if (yocto > nearToYocto(balance as `${number}`)) return 'Insufficient balance.'
      } catch {
        // Unparseable balance is surfaced separately; don't block the send.
      }
    }
    return null
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (status === 'sending') return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setStatus('sending')
    try {
      const hash = await sendNear(seedPhrase, accountId, receiver.trim(), amount, network)
      setTxHash(hash)
      setStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed.')
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <div className="send">
        <header className="send-header">
          <button type="button" className="back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <h1>Send NEAR</h1>
        </header>

        <div className="success-card">
          <div className="success-mark">✓</div>
          <span className="success-title">Sent</span>
          <span className="success-amount">
            {amount} NEAR
          </span>
          <span className="success-to">to {receiver.trim()}</span>
        </div>

        <div className="tx">
          <span className="tx-label">Transaction hash</span>
          <code className="tx-value">{txHash}</code>
        </div>

        <button type="button" className="primary" onClick={onBack}>
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="send">
      <header className="send-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Send NEAR</h1>
      </header>

      <p className="available">
        Available:
        {balanceStatus === 'loading' && <span className="muted"> loading…</span>}
        {balanceStatus === 'error' && <span className="muted error-text"> unavailable</span>}
        {balanceStatus === 'ready' && <strong> {balance} NEAR</strong>}
      </p>

      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Recipient</span>
          <input
            type="text"
            placeholder="Account address"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            autoFocus
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span className="field-label">Amount (NEAR)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        {error && <span className="error">{error}</span>}

        <button type="submit" className="primary" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
