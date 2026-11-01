import { useState } from 'react'
import AccountMenu from './screens/AccountMenu'
import type { ChainPaths } from '../lib/chainsig'
import type { Network } from '../lib/constants'
import './AccountHeader.css'

interface AccountHeaderProps {
  network: Network
  accounts: string[]
  activeAccountId: string
  chainPaths: ChainPaths
  onOpenSettings: () => void
  onOpenSidePanel: () => void
}

// Global header shown across every unlocked screen: the active account address
// (hover opens the address-copy menu) plus the side-panel and settings actions.
export default function AccountHeader({
  network,
  accounts,
  activeAccountId,
  chainPaths,
  onOpenSettings,
  onOpenSidePanel,
}: AccountHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header
      className="account"
      onMouseEnter={() => setMenuOpen(true)}
      onMouseLeave={() => setMenuOpen(false)}
    >
      <button
        type="button"
        className="account-toggle"
        aria-label="View all addresses"
        title="View all addresses"
      >
        <span className="account-meta">
          <span className="account-id">
            {/^[0-9a-f]{64}$/.test(activeAccountId)
              ? `${activeAccountId.slice(0, 8)}…${activeAccountId.slice(-6)}`
              : activeAccountId}
          </span>
        </span>
      </button>
      {menuOpen && (
        <AccountMenu
          network={network}
          accounts={accounts}
          activeAccountId={activeAccountId}
          chainPaths={chainPaths}
        />
      )}
      <button
        type="button"
        className="panel-btn"
        onClick={onOpenSidePanel}
        aria-label="Open side panel"
        title="Open side panel"
      >
        ⧉
      </button>
      <button type="button" className="settings-btn" onClick={onOpenSettings} aria-label="Settings">
        ⚙
      </button>
    </header>
  )
}
