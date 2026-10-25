import { useEffect, useState } from 'react'
import { fetchTransactions, type HistoryTransaction } from '../lib/history'
import type { Network } from '../lib/near'
import './History.css'

interface HistoryProps {
  accountId: string
  network: Network
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

export default function History({ accountId, network }: HistoryProps) {
  const [txns, setTxns] = useState<HistoryTransaction[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetchTransactions(accountId, network)
      .then((list) => {
        if (cancelled) return
        setTxns(list)
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
    <div className="history">
      <header className="history-header">
        <h1>History</h1>
      </header>

      {status === 'loading' && <p className="hint">Loading transactions…</p>}
      {status === 'error' && <p className="hint error">History unavailable</p>}
      {status === 'ready' && txns.length === 0 && <p className="hint">No transactions yet.</p>}

      {status === 'ready' && txns.length > 0 && (
        <ul className="txn-list">
          {txns.map((t) => (
            <li className="txn" key={t.hash}>
              <div className="txn-main">
                <span className={t.direction === 'in' ? 'dir in' : 'dir out'}>
                  {t.direction === 'in' ? '↓' : '↑'}
                </span>
                <div className="txn-meta">
                  <span className="txn-type">{t.type}</span>
                  <span className="txn-party">
                    {t.direction === 'in' ? 'from' : 'to'} {t.counterparty}
                  </span>
                </div>
                {t.amountNear && (
                  <span className="txn-amount">
                    {t.direction === 'in' ? '+' : '-'}
                    {t.amountNear} NEAR
                  </span>
                )}
              </div>
              <div className="txn-sub">
                <span className="txn-time">{formatTime(t.timestamp)}</span>
                {!t.success && <span className="txn-fail">failed</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
