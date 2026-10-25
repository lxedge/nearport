import { useState } from 'react'
import type { Network } from '../lib/near'
import './Settings.css'

interface SettingsProps {
  network: Network
  implicitAddress: string
  accounts: string[]
  activeAccount: string | null
  onSwitchAccount: (id: string | null) => void
  onNetworkChange: (n: Network) => void
  onBack: () => void
  onLock: () => void
  onSignOut: () => void
  onOpenChainSig: () => void
}

export default function Settings({
  network,
  implicitAddress,
  accounts,
  activeAccount,
  onSwitchAccount,
  onNetworkChange,
  onBack,
  onLock,
  onSignOut,
  onOpenChainSig,
}: SettingsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function copyAccount(id: string) {
    navigator.clipboard
      .writeText(id)
      .then(() => setCopiedId(id))
      .catch(() => {})
  }

  return (
    <div className="settings">
      <header className="settings-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Settings</h1>
      </header>

      <section className="group">
        <span className="label">Network</span>
        <div className="segmented">
          <button
            type="button"
            className={network === 'testnet' ? 'segment selected' : 'segment'}
            onClick={() => onNetworkChange('testnet')}
          >
            Testnet
          </button>
          <button
            type="button"
            className={network === 'mainnet' ? 'segment selected' : 'segment'}
            onClick={() => onNetworkChange('mainnet')}
          >
            Mainnet
          </button>
        </div>
        <span className="hint">
          {network === 'mainnet' ? 'Mainnet uses real funds.' : 'Testnet uses fake NEAR.'}
        </span>
      </section>

      {accounts.length > 0 && (
        <section className="group">
          <span className="label">Account</span>
          <div className="account-list">
            <div className={activeAccount === null ? 'account-item selected' : 'account-item'}>
              <button type="button" className="account-select" onClick={() => onSwitchAccount(null)}>
                Implicit · {implicitAddress.slice(0, 10)}…{implicitAddress.slice(-6)}
              </button>
              <button
                type="button"
                className="account-copy"
                onClick={() => copyAccount(implicitAddress)}
                aria-label="Copy implicit address"
              >
                {copiedId === implicitAddress ? 'Copied' : 'Copy'}
              </button>
            </div>
            {accounts.map((id) => (
              <div className={id === activeAccount ? 'account-item selected' : 'account-item'} key={id}>
                <button type="button" className="account-select" onClick={() => onSwitchAccount(id)}>
                  {id}
                </button>
                <button
                  type="button"
                  className="account-copy"
                  onClick={() => copyAccount(id)}
                  aria-label={`Copy ${id}`}
                >
                  {copiedId === id ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <button type="button" className="lock" onClick={onOpenChainSig}>
        Chain signatures
      </button>

      <button type="button" className="lock spacer" onClick={onLock}>
        Lock wallet
      </button>

      <button type="button" className="danger" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  )
}
