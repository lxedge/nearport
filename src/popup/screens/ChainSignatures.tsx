import { useState, type FormEvent } from 'react'
import {
  CHAIN_LABELS,
  CHAIN_ORDER,
  CHAIN_SCHEMES,
  signMessage,
  type Chain,
  type ChainPaths,
  type ChainSignature,
} from '../../lib/chainsig'
import type { Network } from '../../lib/constants'
import { useDerivedAddresses } from '../useDerivedAddresses'
import './ChainSignatures.css'

interface ChainSignaturesProps {
  accountId: string
  seedPhrase: string
  network: Network
  chainPaths: ChainPaths
  onBack: () => void
}

export default function ChainSignatures({
  accountId,
  seedPhrase,
  network,
  chainPaths,
  onBack,
}: ChainSignaturesProps) {
  const [chain, setChain] = useState<Chain>('ethereum')
  const [copied, setCopied] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState<ChainSignature | null>(null)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  const { addresses, status } = useDerivedAddresses(accountId, chainPaths, network)

  function copy(c: Chain, value: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(c))
      .catch(() => {})
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (signing || message.length === 0) return
    setError('')
    setSigning(true)
    try {
      setSignature(
        await signMessage(seedPhrase, accountId, message, chainPaths[chain], network, CHAIN_SCHEMES[chain]),
      )
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
        Your NEAR account controls addresses on other chains. Each chain uses its own derivation
        path, set in Settings.
      </p>

      <div className="chain-list">
        {CHAIN_ORDER.map((c) => (
          <div className="chain-row" key={c}>
            <div className="chain-meta">
              <span className="chain-label">{CHAIN_LABELS[c]}</span>
              <code className="chain-path">{chainPaths[c]}</code>
              <code className="chain-address">
                {status === 'loading' && '…'}
                {status === 'error' && 'failed'}
                {status === 'ready' && (addresses[c] ?? '')}
              </code>
            </div>
            {status === 'ready' && addresses[c] && (
              <button type="button" className="chain-copy" onClick={() => copy(c, addresses[c]!)}>
                {copied === c ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        ))}
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

        <div className="chain-select">
          {CHAIN_ORDER.map((c) => (
            <button
              type="button"
              key={c}
              className={chain === c ? 'chain-select-btn selected' : 'chain-select-btn'}
              onClick={() => setChain(c)}
            >
              {CHAIN_LABELS[c]}
            </button>
          ))}
        </div>
        <span className="sign-meta">
          {CHAIN_LABELS[chain]} · {CHAIN_SCHEMES[chain]} · {chainPaths[chain]}
        </span>

        {error && <span className="error">{error}</span>}

        <button type="submit" className="primary" disabled={signing || message.length === 0}>
          {signing ? 'Signing…' : 'Sign message'}
        </button>
      </form>

      {signature && (
        <div className="signature">
          <span className="field-label">Signature</span>
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
