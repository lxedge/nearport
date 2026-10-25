import { useEffect, useState, type FormEvent } from 'react'
import { getDerivedEthereumAddress, signMessage, type ChainSignature } from '../lib/chainsig'
import type { Network } from '../lib/near'
import './ChainSignatures.css'

interface ChainSignaturesProps {
  accountId: string
  seedPhrase: string
  network: Network
  onBack: () => void
}

export default function ChainSignatures({ accountId, seedPhrase, network, onBack }: ChainSignaturesProps) {
  const [path, setPath] = useState('ethereum-1')
  const [address, setAddress] = useState('')
  const [addressStatus, setAddressStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState<ChainSignature | null>(null)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setAddressStatus('loading')
    getDerivedEthereumAddress(accountId, path, network)
      .then((a) => {
        if (cancelled) return
        setAddress(a)
        setAddressStatus('idle')
      })
      .catch(() => {
        if (!cancelled) setAddressStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [accountId, path, network])

  function copyAddress() {
    navigator.clipboard
      .writeText(address)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (signing || message.length === 0) return
    setError('')
    setSigning(true)
    try {
      const sig = await signMessage(seedPhrase, accountId, message, path, network)
      setSignature(sig)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed.')
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="chainsig">
      <header className="chainsig-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Chain signatures</h1>
      </header>

      <p className="hint">
        Your NEAR account controls addresses on other chains. Each derivation path maps to a
        different address.
      </p>

      <label className="field">
        <span className="field-label">Derivation path</span>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
        />
      </label>

      <div className="address-card">
        <span className="field-label">Ethereum address</span>
        {addressStatus === 'loading' && <span className="muted">Deriving…</span>}
        {addressStatus === 'error' && <span className="error">Failed to derive</span>}
        {addressStatus === 'idle' && <code className="address-value">{address}</code>}
        {address && (
          <button type="button" className="copy" onClick={copyAddress}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Message to sign</span>
          <input
            type="text"
            placeholder="hello near"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            spellCheck={false}
          />
        </label>

        {error && <span className="error">{error}</span>}

        <button type="submit" className="primary" disabled={signing || message.length === 0}>
          {signing ? 'Signing…' : 'Sign message'}
        </button>
      </form>

      {signature && (
        <div className="signature">
          <span className="field-label">Signature</span>
          <code>r: {signature.r}</code>
          <code>s: {signature.s}</code>
          <code>v: {signature.recoveryId}</code>
        </div>
      )}
    </div>
  )
}
