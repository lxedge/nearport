import { useEffect, useState, type FormEvent } from 'react'
import { getDerivedAddress, signMessage, type Chain, type ChainSignature, type SignatureScheme } from '../lib/chainsig'
import type { Network } from '../lib/near'
import './ChainSignatures.css'

const CHAINS: Array<{ id: Chain; label: string }> = [
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'bitcoin', label: 'Bitcoin' },
  { id: 'solana', label: 'Solana' },
  { id: 'sui', label: 'Sui' },
  { id: 'ton', label: 'TON' },
]

interface ChainSignaturesProps {
  accountId: string
  seedPhrase: string
  network: Network
  onBack: () => void
}

export default function ChainSignatures({ accountId, seedPhrase, network, onBack }: ChainSignaturesProps) {
  const [path, setPath] = useState('ethereum-1')
  const [addresses, setAddresses] = useState<Partial<Record<Chain, string>>>({})
  const [addressStatus, setAddressStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [copied, setCopied] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [scheme, setScheme] = useState<SignatureScheme>('secp256k1')
  const [signature, setSignature] = useState<ChainSignature | null>(null)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setAddressStatus('loading')
    Promise.all(
      CHAINS.map(async (c) => [c.id, await getDerivedAddress(accountId, path, network, c.id)] as const),
    )
      .then((rows) => {
        if (cancelled) return
        setAddresses(Object.fromEntries(rows))
        setAddressStatus('idle')
      })
      .catch(() => {
        if (!cancelled) setAddressStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [accountId, path, network])

  function copy(chain: Chain, value: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(chain))
      .catch(() => {})
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (signing || message.length === 0) return
    setError('')
    setSigning(true)
    try {
      setSignature(await signMessage(seedPhrase, accountId, message, path, network, scheme))
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
        different set of addresses.
      </p>

      <label className="chainsig-field">
        <span className="chainsig-field-label">Derivation path</span>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
        />
      </label>

      <div className="chain-list">
        {CHAINS.map(({ id, label }) => (
          <div className="chain-row" key={id}>
            <div className="chain-meta">
              <span className="chain-label">{label}</span>
              <code className="chain-address">
                {addressStatus === 'loading' && '…'}
                {addressStatus === 'error' && 'failed'}
                {addressStatus === 'idle' && (addresses[id] ?? '')}
              </code>
            </div>
            {addresses[id] && (
              <button
                type="button"
                className="chain-copy"
                onClick={() => copy(id, addresses[id]!)}
              >
                {copied === id ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submit}>
        <label className="chainsig-field">
          <span className="chainsig-field-label">Message to sign</span>
          <input
            type="text"
            placeholder="hello near"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            spellCheck={false}
          />
        </label>

        <div className="scheme-row">
          <button
            type="button"
            className={scheme === 'secp256k1' ? 'scheme selected' : 'scheme'}
            onClick={() => setScheme('secp256k1')}
          >
            secp256k1
          </button>
          <button
            type="button"
            className={scheme === 'ed25519' ? 'scheme selected' : 'scheme'}
            onClick={() => setScheme('ed25519')}
          >
            ed25519
          </button>
        </div>

        {error && <span className="error">{error}</span>}

        <button type="submit" className="primary" disabled={signing || message.length === 0}>
          {signing ? 'Signing…' : 'Sign message'}
        </button>
      </form>

      {signature && (
        <div className="signature">
          <span className="chainsig-field-label">Signature</span>
          {signature.scheme === 'secp256k1' ? (
            <>
              <code>r: {signature.r}</code>
              <code>s: {signature.s}</code>
              <code>v: {signature.recoveryId}</code>
            </>
          ) : (
            <code>{signature.signature}</code>
          )}
        </div>
      )}
    </div>
  )
}
