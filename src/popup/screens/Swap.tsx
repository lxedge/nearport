import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  fetchSwapTokens,
  getQuote,
  submitDeposit,
  pollStatus,
  type SwapToken,
  type QuoteResponse,
  type StatusResponse,
  type SwapStatus,
} from '../../lib/intents'
import { sendNativeNearDeposit } from '../../lib/swap'
import { getRawBalance } from '../../lib/balance'
import { getDerivedAddress, type Chain, type ChainPaths } from '../../lib/chainsig'
import { parseUnits, formatUnits } from '../../lib/format'
import type { Network } from '../../lib/constants'
import './Swap.css'

// The wallet's only swappable source asset: native NEAR. Its 1Click assetId is
// the wrapped form; deposits are sent as native NEAR transfers (see swap.ts).
const NEAR_WRAP_ASSET = 'nep141:wrap.near'
const NEAR_DECIMALS = 24

// 1Click destination blockchains that map to a wallet-derivable chainsig chain.
const EVM_BLOCKCHAINS: Record<string, true> = {
  eth: true, base: true, arb: true, bsc: true, pol: true, op: true, scroll: true,
  avax: true, gnosis: true, monad: true, xlayer: true, plasma: true, bera: true,
  movement: true, starknet: true, fogo: true, hood: true, abs: true, adi: true,
}
const BLOCKCHAIN_CHAIN: Record<string, Chain> = {
  sol: 'solana',
  ton: 'ton',
  btc: 'bitcoin',
  zec: 'zcash',
  sui: 'sui',
}

interface SwapProps {
  accountId: string
  seedPhrase: string
  network: Network
  chainPaths: ChainPaths
  onBack: () => void
}

type Phase = 'form' | 'executing' | 'done'

export default function Swap({ accountId, seedPhrase, network, chainPaths, onBack }: SwapProps) {
  const [tokens, setTokens] = useState<SwapToken[] | null>(null)
  const [tokensStatus, setTokensStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [balanceRaw, setBalanceRaw] = useState('0')
  const [balanceStatus, setBalanceStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const [toBlockchain, setToBlockchain] = useState('')
  const [toAssetId, setToAssetId] = useState('')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')

  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [quoteError, setQuoteError] = useState('')

  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [status, setStatus] = useState<SwapStatus | null>(null)
  const [result, setResult] = useState<StatusResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    setTokensStatus('loading')
    fetchSwapTokens()
      .then((list) => {
        if (!cancelled) {
          setTokens(list)
          setTokensStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setTokensStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch the native NEAR balance (the sole source asset).
  useEffect(() => {
    let cancelled = false
    setBalanceStatus('loading')
    getRawBalance(accountId, network)
      .then((raw) => {
        if (cancelled) return
        setBalanceRaw(raw.toString())
        setBalanceStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setBalanceStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [accountId, network])

  const dest = tokens?.find((t) => t.assetId === toAssetId) ?? null

  // Auto-fill recipient from the wallet's own address on the destination chain.
  useEffect(() => {
    if (!dest) return
    let cancelled = false
    if (dest.blockchain === 'near') {
      setRecipient(accountId)
      return
    }
    const chain = EVM_BLOCKCHAINS[dest.blockchain] ? 'ethereum' : BLOCKCHAIN_CHAIN[dest.blockchain]
    if (!chain) {
      setRecipient('')
      return
    }
    getDerivedAddress(accountId, chainPaths[chain], network, chain)
      .then((addr) => {
        if (!cancelled) setRecipient(addr)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [dest, accountId, network, chainPaths])

  // Unique destination blockchains, sorted for a stable dropdown.
  const blockchains = useMemo(() => {
    if (!tokens) return []
    return [...new Set(tokens.map((t) => t.blockchain))].sort()
  }, [tokens])

  // Tokens on the selected destination chain, sorted by symbol.
  const chainTokens = useMemo(() => {
    if (!tokens || !toBlockchain) return []
    return tokens
      .filter((t) => t.blockchain === toBlockchain)
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [tokens, toBlockchain])

  // Preview quote whenever inputs are valid (debounced).
  useEffect(() => {
    if (phase !== 'form' || !dest || !recipient.trim()) {
      setQuote(null)
      setQuoteStatus('idle')
      setQuoteError('')
      return
    }
    let smallest: bigint
    try {
      smallest = parseUnits(amount, NEAR_DECIMALS)
    } catch {
      setQuote(null)
      setQuoteStatus('idle')
      setQuoteError('')
      return
    }
    if (smallest <= 0n) {
      setQuote(null)
      setQuoteStatus('idle')
      setQuoteError('')
      return
    }
    const { promise, resolve } = Promise.withResolvers<void>()
    const timer = setTimeout(resolve, 400)
    let cancelled = false
    void (async () => {
      await promise
      clearTimeout(timer)
      if (cancelled) return
      setQuoteStatus('loading')
      try {
        const q = await getQuote(
          {
            originAsset: NEAR_WRAP_ASSET,
            destinationAsset: dest.assetId,
            amount: smallest.toString(),
            recipient: recipient.trim(),
            refundTo: accountId,
          },
          true,
        )
        if (!cancelled) {
          setQuote(q)
          setQuoteStatus('ready')
          setQuoteError('')
        }
      } catch (err) {
        if (!cancelled) {
          setQuote(null)
          setQuoteStatus('error')
          setQuoteError(err instanceof Error ? err.message : 'Quote failed.')
        }
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [phase, dest, amount, recipient, accountId])

  function validate(): string | null {
    if (!dest) return 'Select a destination token.'
    if (dest.assetId === NEAR_WRAP_ASSET && dest.blockchain === 'near') return 'Source and destination must differ.'
    let smallest: bigint
    try {
      smallest = parseUnits(amount, NEAR_DECIMALS)
    } catch {
      return `Enter a valid amount (max ${NEAR_DECIMALS} decimals).`
    }
    if (smallest <= 0n) return 'Amount must be greater than zero.'
    if (smallest > BigInt(balanceRaw)) return 'Insufficient balance.'
    if (!recipient.trim()) return 'Enter a destination address.'
    if (dest.blockchain === 'near' && recipient.trim() === accountId) {
      // Swapping native NEAR to your own NEAR account is a no-op for the user.
      return 'Destination account is the source account.'
    }
    return null
  }

  async function execute(e: FormEvent) {
    e.preventDefault()
    if (phase === 'executing' || !dest) return
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setError('')
    setPhase('executing')
    try {
      const amountIn = parseUnits(amount, NEAR_DECIMALS).toString()
      const committed = await getQuote(
        {
          originAsset: NEAR_WRAP_ASSET,
          destinationAsset: dest.assetId,
          amount: amountIn,
          recipient: recipient.trim(),
          refundTo: accountId,
        },
        false,
      )
      const depositAddress = committed.quote.depositAddress
      if (!depositAddress) throw new Error('Quote returned no deposit address.')

      const hash = await sendNativeNearDeposit({
        seedPhrase,
        accountId,
        network,
        depositAddress,
        amountIn: committed.quote.amountIn,
      })
      setTxHash(hash)

      // Non-critical: notify the API to speed up detection.
      submitDeposit({ txHash: hash, depositAddress, nearSenderAccount: accountId }).catch(() => {})

      const final = await pollStatus(depositAddress, (s) => setStatus(s.status))
      setResult(final)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed.')
      setPhase('form')
    }
  }

  if (phase === 'done' && result) {
    return (
      <div className="swap">
        <header className="swap-header">
          <button type="button" className="back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <h1>{result.status === 'SUCCESS' ? 'Swap complete' : 'Swap finished'}</h1>
        </header>

        <div className="success-card">
          <div className="success-mark">{result.status === 'SUCCESS' ? '✓' : '!'}</div>
          <span className="success-title">{result.status}</span>
          {result.swapDetails?.amountOut && (
            <span className="success-amount">
              +{formatUnits(result.swapDetails.amountOut, dest?.decimals ?? 0)} {dest?.symbol}
            </span>
          )}
          <span className="success-to">to {recipient.trim()}</span>
        </div>

        <div className="tx">
          <span className="tx-label">Deposit transaction</span>
          <code className="tx-value">{txHash}</code>
          {result.swapDetails?.destinationChainTxHashes?.[0] && (
            <a
              className="tx-link"
              href={result.swapDetails.destinationChainTxHashes[0].explorerUrl}
              target="_blank"
              rel="noreferrer"
            >
              View output transaction
            </a>
          )}
        </div>

        <button type="button" className="primary" onClick={onBack}>
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="swap">
      <header className="swap-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Swap</h1>
      </header>

      {tokensStatus === 'loading' && <p className="available">Loading supported tokens…</p>}
      {tokensStatus === 'error' && (
        <p className="available">
          <span className="error-text">Token list unavailable — retry later.</span>
        </p>
      )}

      <form onSubmit={execute}>
        <div className="swap-side">
          <span className="field-label">From</span>
          <select value={NEAR_WRAP_ASSET} onChange={() => {}}>
            <option value={NEAR_WRAP_ASSET}>NEAR</option>
          </select>
          <span className="available">
            Available:{' '}
            {balanceStatus === 'loading' && <span className="muted"> loading…</span>}
            {balanceStatus === 'error' && <span className="muted error-text"> unavailable</span>}
            {balanceStatus === 'ready' && (
              <strong>{formatUnits(balanceRaw, NEAR_DECIMALS)} NEAR</strong>
            )}
          </span>
        </div>

        <div className="swap-side">
          <span className="field-label">To · Chain</span>
          <select
            value={toBlockchain}
            onChange={(e) => {
              setToBlockchain(e.target.value)
              setToAssetId('')
              setRecipient('')
            }}
          >
            <option value="">Select chain</option>
            {blockchains.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="swap-side">
          <span className="field-label">To · Token</span>
          <select
            value={toAssetId}
            onChange={(e) => setToAssetId(e.target.value)}
            disabled={!toBlockchain}
          >
            <option value="">{toBlockchain ? 'Select token' : 'Pick a chain first'}</option>
            {chainTokens.map((t) => (
              <option key={t.assetId} value={t.assetId}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>

        <label className="field">
          <span className="field-label">Amount</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Recipient</span>
          <input
            type="text"
            placeholder={dest?.blockchain === 'near' ? 'account.near' : 'Destination address'}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            spellCheck={false}
          />
        </label>

        {quoteStatus === 'ready' && quote && (
          <div className="quote">
            <span className="quote-label">You receive</span>
            <span className="quote-amount">
              ≈ {quote.quote.amountOutFormatted} {dest?.symbol}
            </span>
            {quote.quote.minAmountOut && (
              <span className="quote-min">
                minimum {formatUnits(quote.quote.minAmountOut, dest?.decimals ?? 0)} {dest?.symbol}
              </span>
            )}
          </div>
        )}
        {quoteStatus === 'error' && <span className="error">{quoteError}</span>}

        {error && <span className="error">{error}</span>}
        {phase === 'executing' && status && <span className="quote-min">Status: {status}</span>}

        <button type="submit" className="primary" disabled={phase === 'executing' || balanceStatus !== 'ready'}>
          {phase === 'executing' ? 'Swapping…' : 'Swap'}
        </button>
      </form>
    </div>
  )
}
