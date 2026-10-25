import { useEffect, useState } from 'react'
import { getAccountBalances, type AccountBalances } from '../../lib/balance'
import type { Network } from '../../lib/constants'
import './Home.css'

type BalanceStatus = 'loading' | 'ready' | 'error'

interface HomeProps {
  network: Network
  accounts: string[]
  activeAccountId: string
  onOpenSettings: () => void
  onOpenSidePanel: () => void
  onOpenReceive: () => void
  onOpenSend: () => void
  onCreateNamed: () => void
}

export default function Home({
  network,
  accounts,
  activeAccountId,
  onOpenSettings,
  onOpenSidePanel,
  onOpenReceive,
  onOpenSend,
  onCreateNamed,
}: HomeProps) {
  const [balances, setBalances] = useState<AccountBalances | null>(null)
  const [status, setStatus] = useState<BalanceStatus>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getAccountBalances(accounts, network)
      .then((b) => {
        if (cancelled) return
        setBalances(b)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [accounts, network])

  return (
    <div className="home">
      <header className="account">
        <div className="avatar">◈</div>
        <div className="account-meta">
          <span className="account-id">{network === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
          <span className="account-tag">
            {accounts.length} account{accounts.length === 1 ? '' : 's'}
          </span>
        </div>
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

      <section className="balance">
        <span className="label">Total balance</span>
        <div className="balance-row">
          <span className="amount">{balances?.total ?? '—'}</span>
          <span className="unit">NEAR</span>
        </div>
        {status === 'loading' && <span className="hint">Loading balance…</span>}
        {status === 'error' && <span className="hint error">Network unreachable</span>}
        {status === 'ready' && <span className="hint">On NEAR {network}</span>}
      </section>

      {balances && (
        <section className="breakdown">
          {balances.accounts.map(({ accountId, balance }) => (
            <div
              className={accountId === activeAccountId ? 'account-row active' : 'account-row'}
              key={accountId}
            >
              <span className="account-row-id">
                {/^[0-9a-f]{64}$/.test(accountId)
                  ? `Implicit · ${accountId.slice(0, 10)}…${accountId.slice(-6)}`
                  : accountId}
              </span>
              <span className="account-row-balance">{balance} NEAR</span>
            </div>
          ))}
        </section>
      )}

      <section className="quick-actions">
        <button type="button" onClick={onOpenSend}>Send</button>
        <button type="button" onClick={onOpenReceive}>Receive</button>
      </section>

      <button type="button" className="create-named-btn" onClick={onCreateNamed}>
        Create a named account
      </button>
    </div>
  )
}
