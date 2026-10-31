import { useEffect, useState } from 'react'
import { getAccountBalances, type AccountBalances } from '../../lib/balance'
import { getTokenBalances, type TokenBalance } from '../../lib/tokens'
import { getDerivedAddress, type ChainPaths } from '../../lib/chainsig'
import { EVM_NETWORKS, EVM_NETWORK_ORDER, formatNativeAmount, getEvmBalance } from '../../lib/evm'
import type { Network } from '../../lib/constants'
import './Home.css'

type BalanceStatus = 'loading' | 'ready' | 'error'

interface HomeProps {
  network: Network
  accounts: string[]
  activeAccountId: string
  onOpenSettings: () => void
  onOpenSidePanel: () => void
  onOpenAddresses: () => void
  onOpenReceive: () => void
  onOpenSend: () => void
  onOpenSwap: () => void
  chainPaths: ChainPaths
}

export default function Home({
  network,
  accounts,
  activeAccountId,
  onOpenSettings,
  onOpenSidePanel,
  onOpenAddresses,
  onOpenReceive,
  onOpenSend,
  onOpenSwap,
  chainPaths,
}: HomeProps) {
  const [balances, setBalances] = useState<AccountBalances | null>(null)
  const [status, setStatus] = useState<BalanceStatus>('loading')
  const [tokens, setTokens] = useState<TokenBalance[]>([])
  const [tokenStatus, setTokenStatus] = useState<BalanceStatus>('loading')
  const [evmAssets, setEvmAssets] = useState<Array<{ id: string; symbol: string; name: string; balance: string }>>([])
  const [evmStatus, setEvmStatus] = useState<BalanceStatus>('loading')

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

  useEffect(() => {
    let cancelled = false
    setTokenStatus('loading')
    getTokenBalances(activeAccountId, network)
      .then((list) => {
        if (cancelled) return
        setTokens(list)
        setTokenStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setTokenStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [activeAccountId, network])

  useEffect(() => {
    let cancelled = false
    setEvmStatus('loading')
    ;(async () => {
      const address = await getDerivedAddress(activeAccountId, chainPaths.ethereum, network, 'ethereum')
      const rows = await Promise.all(
        EVM_NETWORK_ORDER.map(async (id) => ({
          id,
          symbol: EVM_NETWORKS[id].symbol,
          name: EVM_NETWORKS[id].name,
          balance: formatNativeAmount(await getEvmBalance(id, address)),
        })),
      )
      if (!cancelled) {
        setEvmAssets(rows)
        setEvmStatus('ready')
      }
    })().catch(() => {
      if (!cancelled) setEvmStatus('error')
    })
    return () => {
      cancelled = true
    }
  }, [activeAccountId, chainPaths.ethereum, network])

  return (
    <div className="home">
      <header className="account">
        <button
          type="button"
          className="account-toggle"
          onClick={onOpenAddresses}
          aria-label="View all addresses"
          title="View all addresses"
        >
          <span className="avatar">◈</span>
          <span className="account-meta">
            <span className="account-id">{network === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
            <span className="account-tag">
              {accounts.length} account{accounts.length === 1 ? '' : 's'}
            </span>
          </span>
          <span className="chevron">▾</span>
        </button>
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
        <button type="button" onClick={onOpenSwap}>Swap</button>
        <button type="button" onClick={onOpenReceive}>Receive</button>
      </section>

      <section className="tokens">
        <span className="label">Tokens</span>
        {tokenStatus === 'loading' && <span className="hint">Loading tokens…</span>}
        {tokenStatus === 'error' && <span className="hint error">Tokens unavailable</span>}
        {tokenStatus === 'ready' && tokens.length === 0 && <span className="hint">No tokens yet</span>}
        {tokens.length > 0 && (
          <div className="token-list">
            {tokens.map((t) => (
              <div className="token-row" key={t.contractId}>
                {t.icon ? (
                  <img className="token-icon" src={t.icon} alt="" />
                ) : (
                  <span className="token-icon fallback">{t.symbol.charAt(0).toUpperCase()}</span>
                )}
                <div className="token-meta">
                  <span className="token-symbol">{t.symbol}</span>
                  <span className="token-name">{t.name}</span>
                </div>
                <span className="token-balance">{t.formatted}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="tokens">
        <span className="label">Other chains</span>
        {evmStatus === 'loading' && <span className="hint">Loading balances…</span>}
        {evmStatus === 'error' && <span className="hint error">Balances unavailable</span>}
        {evmStatus === 'ready' && (
          <div className="token-list">
            {evmAssets.map((a) => (
              <div className="token-row" key={a.id}>
                <span className="token-icon fallback">{a.symbol.charAt(0).toUpperCase()}</span>
                <div className="token-meta">
                  <span className="token-symbol">{a.symbol}</span>
                  <span className="token-name">{a.name}</span>
                </div>
                <span className="token-balance">
                  {a.balance} {a.symbol}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
