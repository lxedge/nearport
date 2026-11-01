import { useState } from 'react'
import { CHAIN_LABELS, CHAIN_ORDER, type ChainPaths } from '../../lib/chainsig'
import type { Network } from '../../lib/constants'
import { useDerivedAddresses } from '../useDerivedAddresses'
import './AccountMenu.css'

interface AccountMenuProps {
  network: Network
  accounts: string[]
  activeAccountId: string
  chainPaths: ChainPaths
}

// MetaMask-style account menu: a dropdown listing every address the wallet
// controls — the NEAR accounts plus the chain-signature-derived addresses —
// each with a one-click copy. Rendered inside the hover region of the home
// header, so it stays open while the pointer is over it.
export default function AccountMenu({
  network,
  accounts,
  activeAccountId,
  chainPaths,
}: AccountMenuProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const { addresses, status } = useDerivedAddresses(activeAccountId, chainPaths, network)

  function copy(value: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(value))
      .catch(() => {})
  }

  // Show only the head/tail of a long address; short names stay intact.
  const shorten = (value: string): string =>
    value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value

  return (
    <div className="account-menu">
      <div className="account-menu-section">
        <span className="account-menu-label">NEAR</span>
        {accounts.map((id) => {
          const implicit = /^[0-9a-f]{64}$/.test(id)
          return (
            <div className={id === activeAccountId ? 'menu-row active' : 'menu-row'} key={id}>
              <span className="menu-row-name">{implicit ? 'Implicit account' : id}</span>
              {implicit && <code className="menu-row-value">{shorten(id)}</code>}
              <button
                type="button"
                className="menu-row-copy"
                onClick={() => copy(id)}
                aria-label={`Copy ${id}`}
              >
                {copied === id ? '✓' : 'Copy'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="account-menu-section">
        <span className="account-menu-label">Derived addresses</span>
        {CHAIN_ORDER.map((chain) => {
          const addr = status === 'ready' ? addresses[chain] ?? '' : status === 'loading' ? '…' : 'failed'
          const ready = addr && addr !== '…' && addr !== 'failed'
          return (
            <div className="menu-row" key={chain}>
              <span className="menu-row-name">{CHAIN_LABELS[chain]}</span>
              <code className="menu-row-value">{ready ? shorten(addr) : addr}</code>
              {ready && (
                <button
                  type="button"
                  className="menu-row-copy"
                  onClick={() => copy(addr)}
                  aria-label={`Copy ${CHAIN_LABELS[chain]} address`}
                >
                  {copied === addr ? '✓' : 'Copy'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
