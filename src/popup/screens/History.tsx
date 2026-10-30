import { useEffect, useState } from 'react'
import { getHistory, txnExplorerUrl, type HistoryTransaction } from '../../lib/history'
import type { Network } from '../../lib/constants'
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
  const [selected, setSelected] = useState<HistoryTransaction | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getHistory(accountId, network)
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

  if (selected) {
    const explorerUrl = txnExplorerUrl(network, selected.hash)
    const inbound = selected.direction === 'in'
    return (
      <div className="history">
        <header className="history-header">
          <button type="button" className="back" onClick={() => setSelected(null)} aria-label="Back">
            ←
          </button>
          <h1>Transaction</h1>
        </header>

        <dl className="txn-detail">
          <div className="detail-row">
            <dt>Type</dt>
            <dd>{selected.type}</dd>
          </div>
          <div className="detail-row">
            <dt>Status</dt>
            <dd className={selected.success ? 'detail-ok' : 'detail-fail'}>
              {selected.success ? 'Success' : 'Failed'}
            </dd>
          </div>
          <div className="detail-row">
            <dt>Direction</dt>
            <dd>{inbound ? 'Received' : 'Sent'}</dd>
          </div>
          {selected.amountNear && (
            <div className="detail-row">
              <dt>Amount</dt>
              <dd>
                {inbound ? '+' : '-'}
                {selected.amountNear} NEAR
              </dd>
            </div>
          )}
          <div className="detail-row">
            <dt>From</dt>
            <dd className="detail-party">{selected.from}</dd>
          </div>
          <div className="detail-row">
            <dt>To</dt>
            <dd className="detail-party">{selected.to}</dd>
          </div>
          <div className="detail-row">
            <dt>Time</dt>
            <dd>{new Date(selected.timestamp).toLocaleString()}</dd>
          </div>
          <div className="detail-row detail-col">
            <dt>Hash</dt>
            <dd>
              <code className="detail-hash">{selected.hash}</code>
            </dd>
          </div>
        </dl>

        {explorerUrl && (
          <button type="button" className="primary" onClick={() => void chrome.tabs.create({ url: explorerUrl })}>
            View in explorer ↗
          </button>
        )}
      </div>
    )
  }

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
              <button type="button" className="txn-btn" onClick={() => setSelected(t)}>
                <span className="txn-main">
                  <span className={t.direction === 'in' ? 'dir in' : 'dir out'}>
                    {t.direction === 'in' ? '↓' : '↑'}
                  </span>
                  <span className="txn-meta">
                    <span className="txn-type">{t.type}</span>
                    <span className="txn-party">
                      {t.direction === 'in' ? 'from' : 'to'}{' '}
                      {t.direction === 'in' ? t.from : t.to}
                    </span>
                  </span>
                  {t.amountNear && (
                    <span className="txn-amount">
                      {t.direction === 'in' ? '+' : '-'}
                      {t.amountNear} NEAR
                    </span>
                  )}
                  <span className="txn-chevron" aria-hidden="true">
                    ›
                  </span>
                </span>
                <span className="txn-sub">
                  <span className="txn-time">{formatTime(t.timestamp)}</span>
                  {!t.success && <span className="txn-fail">failed</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
