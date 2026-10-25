import type { Network } from '../lib/near'
import './Settings.css'

interface SettingsProps {
  network: Network
  onNetworkChange: (n: Network) => void
  onBack: () => void
  onLock: () => void
  onSignOut: () => void
}

export default function Settings({ network, onNetworkChange, onBack, onLock, onSignOut }: SettingsProps) {
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

      <button type="button" className="lock" onClick={onLock}>
        Lock wallet
      </button>

      <button type="button" className="danger" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  )
}
