import { useEffect, useState } from 'react'
import { getBalance, type Network } from '../lib/near'
import './Home.css'

type BalanceStatus = 'loading' | 'ready' | 'error'

interface HomeProps {
  accountId: string
  network: Network
  showCreateNamed: boolean
  onOpenSettings: () => void
  onOpenReceive: () => void
  onOpenSend: () => void
  onCreateNamed: () => void
}

export default function Home({
  accountId,
  network,
  showCreateNamed,
  onOpenSettings,
  onOpenReceive,
  onOpenSend,
  onCreateNamed,
}: HomeProps) {
  const [balance, setBalance] = useState('—')
  const [status, setStatus] = useState<BalanceStatus>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getBalance(accountId, network)
      .then((b) => {
        if (cancelled) return
        setBalance(b)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [accountId, network])

  return (
    <div className="home">
      <header className="account">
        <div className="avatar">◈</div>
        <div className="account-meta">
          <span className="account-id">{accountId}</span>
          <span className="account-tag">{network}</span>
        </div>
        <button type="button" className="settings-btn" onClick={onOpenSettings} aria-label="Settings">
          ⚙
        </button>
      </header>

      <section className="balance">
        <span className="label">Balance</span>
        <div className="balance-row">
          <span className="amount">{balance}</span>
          <span className="unit">NEAR</span>
        </div>
        {status === 'loading' && <span className="hint">Loading balance…</span>}
        {status === 'error' && <span className="hint error">Network unreachable</span>}
        {status === 'ready' && <span className="hint">On NEAR {network}</span>}
      </section>

      <section className="quick-actions">
        <button type="button" onClick={onOpenSend}>Send</button>
        <button type="button" onClick={onOpenReceive}>Receive</button>
      </section>

      {showCreateNamed && (
        <button type="button" className="create-named-btn" onClick={onCreateNamed}>
          Create a named account
        </button>
      )}
    </div>
  )
}
