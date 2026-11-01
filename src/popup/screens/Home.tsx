import { useEffect, useMemo, useState } from 'react'
import { getAccountBalances, getBalance, type AccountBalances } from '../../lib/balance'
import { getTokenBalances } from '../../lib/tokens'
import { getDerivedAddress, type ChainPaths } from '../../lib/chainsig'
import { EVM_NETWORKS, EVM_NETWORK_ORDER, getEvmBalance } from '../../lib/evm'
import { formatUnits, sumDecimals } from '../../lib/format'
import type { Network } from '../../lib/constants'
import './Home.css'

type BalanceStatus = 'loading' | 'ready' | 'error'

interface HomeProps {
  network: Network
  accounts: string[]
  activeAccountId: string
  onOpenReceive: () => void
  onOpenSend: () => void
  onOpenSwap: () => void
  chainPaths: ChainPaths
}

// One asset held by the account, aggregated across chains. `chains` has one
// entry per chain the token is held on (same symbol bridged to multiple chains).
// `total` is the sum of all chain balances at display precision (6 decimals).
// `native` marks the chain's gas token (NEAR); native assets sort first.
interface Asset {
  symbol: string
  name: string
  icon: string | null
  native: boolean
  total: string
  chains: Array<{ chainId: string; chainLabel: string; balance: string }>
}

// Chain ids selectable in the asset filter, plus their display labels.
const CHAIN_LABELS: Record<string, string> = {
  near: 'NEAR',
  ...Object.fromEntries(EVM_NETWORK_ORDER.map((id) => [id, EVM_NETWORKS[id].name])),
}
const CHAIN_IDS: string[] = ['near', ...EVM_NETWORK_ORDER]

// Native assets (the home-chain gas token) sort first, then alphabetical.
function sortAssets(assets: Iterable<Asset>): Asset[] {
  return [...assets].sort((a, b) =>
    a.native === b.native ? a.symbol.localeCompare(b.symbol) : a.native ? -1 : 1,
  )
}

export default function Home({
  network,
  accounts,
  activeAccountId,
  onOpenReceive,
  onOpenSend,
  onOpenSwap,
  chainPaths,
}: HomeProps) {
  const [balances, setBalances] = useState<AccountBalances | null>(null)
  const [status, setStatus] = useState<BalanceStatus>('loading')
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetStatus, setAssetStatus] = useState<BalanceStatus>('loading')
  const [chainFilter, setChainFilter] = useState('all')
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)

  // `accounts` is a fresh array literal from the parent on every render, so a
  // `useEffect` keyed on the array reference would re-fetch in an endless loop.
  // Depend on the joined account list instead.
  const accountsKey = accounts.join(',')

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
  }, [accountsKey, network])

  // Aggregate the active account's assets, grouped by symbol across chains.
  // NEAR-chain assets (native + NEP-141) render immediately; EVM native balances
  // arrive later because they need a slow MPC `derived_public_key` lookup, and a
  // derivation failure must not hide the NEAR assets.
  useEffect(() => {
    let cancelled = false
    setAssetStatus('loading')
    ;(async () => {
      const [nativeNear, nep141] = await Promise.all([
        getBalance(activeAccountId, network),
        getTokenBalances(activeAccountId, network),
      ])

      const groups = new Map<string, Asset>()
      const push = (symbol: string, name: string, icon: string | null, chainId: string, chainLabel: string, balance: string, native = false) => {
        const key = symbol.toLowerCase()
        let asset = groups.get(key)
        if (!asset) {
          asset = { symbol, name, icon, native, total: '', chains: [] }
          groups.set(key, asset)
        }
        asset.native = asset.native || native
        asset.chains.push({ chainId, chainLabel, balance })
      }

      // Sum each aggregated asset's chain balances at display precision.
      const finalize = () =>
        sortAssets(
          [...groups.values()].map((a) => ({
            ...a,
            total: sumDecimals(a.chains.map((c) => c.balance)),
          })),
        )

      // NEAR is the wallet's home-chain gas token; keep it pinned first.
      push('NEAR', 'NEAR', null, 'near', 'NEAR', nativeNear, true)
      for (const t of nep141) push(t.symbol, t.name, t.icon, 'near', 'NEAR', t.formatted)

      if (cancelled) return
      setAssets(finalize())
      setAssetStatus('ready')

      // EVM native balances are best-effort; append them once derived.
      try {
        const evmAddress = await getDerivedAddress(activeAccountId, chainPaths.ethereum, network, 'ethereum')
        const evmRows = await Promise.all(
          EVM_NETWORK_ORDER.map(async (id) => ({
            id,
            symbol: EVM_NETWORKS[id].symbol,
            balance: formatUnits(await getEvmBalance(id, evmAddress), 18),
          })),
        )
        if (cancelled) return
        for (const row of evmRows) {
          push(row.symbol, row.symbol, null, row.id, CHAIN_LABELS[row.id], row.balance)
        }
        setAssets(finalize())
      } catch {
        // EVM balances unavailable; the NEAR-chain assets are already shown.
      }
    })().catch(() => {
      if (!cancelled) setAssetStatus('error')
    })
    return () => {
      cancelled = true
    }
  }, [activeAccountId, chainPaths.ethereum, network])

  // Filter assets to the selected chain (or show all).
  const visibleAssets = useMemo(() => {
    if (chainFilter === 'all') return assets
    return assets
      .map((a) => ({ ...a, chains: a.chains.filter((c) => c.chainId === chainFilter) }))
      .filter((a) => a.chains.length > 0)
  }, [assets, chainFilter])

  return (
    <div className="home">
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

      <section className="quick-actions">
        <button type="button" onClick={onOpenSend}>
          <span className="qa-icon">↑</span>
          Send
        </button>
        <button type="button" onClick={onOpenSwap}>
          <span className="qa-icon">⇄</span>
          Swap
        </button>
        <button type="button" onClick={onOpenReceive}>
          <span className="qa-icon">↓</span>
          Receive
        </button>
      </section>

      <section className="assets">
        <div className="assets-head">
          <span className="label">Assets</span>
          <select
            className="chain-select"
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
            aria-label="Filter assets by chain"
          >
            <option value="all">All chains</option>
            {CHAIN_IDS.map((id) => (
              <option key={id} value={id}>
                {CHAIN_LABELS[id]}
              </option>
            ))}
          </select>
        </div>

        {assetStatus === 'loading' && <span className="hint">Loading assets…</span>}
        {assetStatus === 'error' && <span className="hint error">Assets unavailable</span>}
        {assetStatus === 'ready' && visibleAssets.length === 0 && (
          <span className="hint">No assets on this chain</span>
        )}
        {visibleAssets.length > 0 && (
          <div className="asset-list">
            {visibleAssets.map((a) => {
              const multi = a.chains.length > 1
              const expanded = expandedSymbol === a.symbol.toLowerCase()
              return (
                <div className="asset-group" key={a.symbol}>
                  <button
                    type="button"
                    className={multi ? 'asset-row clickable' : 'asset-row'}
                    onClick={() => multi && setExpandedSymbol(expanded ? null : a.symbol.toLowerCase())}
                  >
                    {a.icon ? (
                      <img className="asset-icon" src={a.icon} alt="" />
                    ) : (
                      <span className="asset-icon fallback">{a.symbol.charAt(0).toUpperCase()}</span>
                    )}
                    <div className="asset-meta">
                      <span className="asset-symbol">{a.symbol}</span>
                      <span className="asset-name">
                        {multi ? `${a.chains.length} chains` : a.chains[0].chainLabel}
                      </span>
                    </div>
                    {multi ? (
                      <span className="asset-balance">{a.total}</span>
                    ) : (
                      <span className="asset-balance">{a.chains[0].balance}</span>
                    )}
                    {multi && (
                      <span className="asset-chevron">{expanded ? '▾' : '▸'}</span>
                    )}
                  </button>

                  {multi && expanded && (
                    <div className="asset-detail">
                      {a.chains.map((c) => (
                        <div className="asset-detail-row" key={c.chainId}>
                          <span className="asset-detail-chain">{c.chainLabel}</span>
                          <span className="asset-detail-balance">{sumDecimals([c.balance])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
