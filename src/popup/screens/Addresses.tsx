import { useState } from 'react'
import { CHAIN_LABELS, CHAIN_ORDER, type ChainPaths } from '../../lib/chainsig'
import type { Network } from '../../lib/constants'
import { useDerivedAddresses } from '../useDerivedAddresses'
import './Addresses.css'

interface AddressesProps {
  // NEAR accounts the wallet controls: the implicit address first, then named.
  accounts: string[]
  activeAccountId: string
  chainPaths: ChainPaths
  network: Network
  onBack: () => void
}

export default function Addresses({
  accounts,
  activeAccountId,
  chainPaths,
  network,
  onBack,
}: AddressesProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const { addresses, status } = useDerivedAddresses(activeAccountId, chainPaths, network)

  function copy(value: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(value))
      .catch(() => {})
  }

  return (
    <div className="addresses">
      <header className="addresses-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Addresses</h1>
      </header>

      <section className="addr-group">
        <span className="label">NEAR</span>
        <div className="addr-list">
          {accounts.map((id) => (
            <div className={id === activeAccountId ? 'addr-row active' : 'addr-row'} key={id}>
              <div className="addr-meta">
                <span className="addr-label">
                  {/^[0-9a-f]{64}$/.test(id) ? 'Implicit account' : 'Named account'}
                </span>
                <code className="addr-value">{id}</code>
              </div>
              <button type="button" className="addr-copy" onClick={() => copy(id)}>
                {copied === id ? 'Copied' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="addr-group">
        <span className="label">Derived (chain signatures)</span>
        <div className="addr-list">
          {CHAIN_ORDER.map((chain) => (
            <div className="addr-row" key={chain}>
              <div className="addr-meta">
                <span className="addr-label">{CHAIN_LABELS[chain]}</span>
                <code className="addr-value">
                  {status === 'loading' && '…'}
                  {status === 'error' && 'failed'}
                  {status === 'ready' && (addresses[chain] ?? '')}
                </code>
              </div>
              {status === 'ready' && addresses[chain] && (
                <button
                  type="button"
                  className="addr-copy"
                  onClick={() => copy(addresses[chain]!)}
                >
                  {copied === addresses[chain] ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          ))}
        </div>
        <span className="hint">
          Controlled by {activeAccountId}. Derivation paths are set in Settings.
        </span>
      </section>
    </div>
  )
}
