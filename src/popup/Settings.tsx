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
}: SettingsProps) {
  const [copied, setCopied] = useState(false)

  function copyImplicit() {
    navigator.clipboard
      .writeText(implicitAddress)
      .then(() => setCopied(true))
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
            <button
              type="button"
              className={activeAccount === null ? 'account-option selected' : 'account-option'}
              onClick={() => onSwitchAccount(null)}
            >
              Implicit · {implicitAddress.slice(0, 10)}…{implicitAddress.slice(-6)}
            </button>
            {accounts.map((id) => (
              <button
                key={id}
                type="button"
                className={id === activeAccount ? 'account-option selected' : 'account-option'}
                onClick={() => onSwitchAccount(id)}
              >
                {id}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="group">
        <span className="label">Implicit address</span>
        <code className="implicit">{implicitAddress}</code>
        <button type="button" className="copy" onClick={copyImplicit}>
          {copied ? 'Copied' : 'Copy address'}
        </button>
      </section>

      <button type="button" className="lock" onClick={onLock}>
        Lock wallet
      </button>

      <button type="button" className="danger" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  )
}
