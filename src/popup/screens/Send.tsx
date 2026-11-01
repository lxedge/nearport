import { useEffect, useState, type FormEvent } from 'react'
import { nearToYocto } from 'near-api-js'
import { getBalance } from '../../lib/balance'
import { sendNear } from '../../lib/transfer'
import {
  EVM_NETWORKS,
  EVM_NETWORK_ORDER,
  getEvmBalance,
  sendEvmTransaction,
} from '../../lib/evm'
import {
  getSolAddress,
  getSolBalance,
  isValidSolAddress,
  sendSolTransaction,
} from '../../lib/solana'
import { getDerivedAddress, type ChainPaths } from '../../lib/chainsig'
import { SOLANA_EXPLORER, type Network } from '../../lib/constants'
import { isValidAccountId, parseUnits, formatUnits } from '../../lib/format'
import './Send.css'

interface SendProps {
  accountId: string
  seedPhrase: string
  network: Network
  chainPaths: ChainPaths
  onBack: () => void
}

type BalanceStatus = 'loading' | 'ready' | 'error'
type SendStatus = 'idle' | 'sending' | 'sent'

// One sendable asset: native NEAR, a native EVM token, or native SOL.
interface AssetTarget {
  id: string
  label: string
  unit: string
  kind: 'near' | 'evm' | 'solana'
}

const TARGETS: AssetTarget[] = [
  { id: 'near', label: 'NEAR', unit: 'NEAR', kind: 'near' },
  ...EVM_NETWORK_ORDER.map((id) => ({
    id,
    label: `${EVM_NETWORKS[id].symbol} · ${EVM_NETWORKS[id].name}`,
    unit: EVM_NETWORKS[id].symbol,
    kind: 'evm' as const,
  })),
  { id: 'solana', label: 'SOL · Solana', unit: 'SOL', kind: 'solana' },
]

export default function Send({ accountId, seedPhrase, network, chainPaths, onBack }: SendProps) {
  const [targetId, setTargetId] = useState('near')
  const [evmAddress, setEvmAddress] = useState('')
  const [solAddress, setSolAddress] = useState('')
  const [balance, setBalance] = useState('—')
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>('loading')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<SendStatus>('idle')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')

  const target = TARGETS.find((t) => t.id === targetId)!

  useEffect(() => {
    let cancelled = false
    getDerivedAddress(accountId, chainPaths.ethereum, network, 'ethereum')
      .then((a) => {
        if (!cancelled) setEvmAddress(a)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [accountId, chainPaths.ethereum, network])

  useEffect(() => {
    let cancelled = false
    getSolAddress(accountId, chainPaths.solana, network)
      .then((a) => {
        if (!cancelled) setSolAddress(a)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [accountId, chainPaths.solana, network])

  useEffect(() => {
    if (target.kind === 'evm' && !evmAddress) return
    if (target.kind === 'solana' && !solAddress) return
    let cancelled = false
    setBalanceStatus('loading')
    const load = async () => {
      if (target.kind === 'evm') return formatUnits(await getEvmBalance(target.id, evmAddress), 18)
      if (target.kind === 'solana') {
        return formatUnits(await getSolBalance(accountId, chainPaths.solana, network), 9)
      }
      return await getBalance(accountId, network)
    }
    load()
      .then((b) => {
        if (cancelled) return
        setBalance(b)
        setBalanceStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setBalanceStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [target.id, target.kind, evmAddress, solAddress, accountId, chainPaths.solana, network])

  function validate(): string | null {
    if (target.kind === 'evm') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient.trim())) return 'Invalid recipient address.'
      if (recipient.trim().toLowerCase() === evmAddress.toLowerCase()) return 'Recipient is your own address.'
      let wei: bigint
      try {
        wei = parseUnits(amount, 18)
      } catch {
        return 'Enter a valid amount (max 18 decimals).'
      }
      if (wei <= 0n) return 'Amount must be greater than zero.'
      if (balanceStatus === 'ready') {
        try {
          if (wei > parseUnits(balance, 18)) return 'Insufficient balance.'
        } catch {
          // Unparseable balance is surfaced separately; don't block the send.
        }
      }
      return null
    }

    if (target.kind === 'solana') {
      const to = recipient.trim()
      if (to.length === 0) return 'Enter a recipient address.'
      if (!isValidSolAddress(to)) return 'Invalid recipient address.'
      if (to === solAddress) return 'Recipient is your own address.'
      let lamports: bigint
      try {
        lamports = parseUnits(amount, 9)
      } catch {
        return 'Enter a valid amount (max 9 decimals).'
      }
      if (lamports <= 0n) return 'Amount must be greater than zero.'
      if (balanceStatus === 'ready') {
        try {
          if (lamports > parseUnits(balance, 9)) return 'Insufficient balance.'
        } catch {
          // Unparseable balance is surfaced separately; don't block the send.
        }
      }
      return null
    }

    const recipientId = recipient.trim()
    if (recipientId.length === 0) return 'Enter a recipient address.'
    if (!isValidAccountId(recipientId)) return 'Invalid recipient address.'
    if (recipientId === accountId) return 'Recipient is your own address.'
    let yocto: bigint
    try {
      yocto = nearToYocto(amount.trim() as `${number}`)
    } catch {
      return 'Enter a valid amount (max 24 decimals).'
    }
    if (yocto <= 0n) return 'Amount must be greater than zero.'
    if (balanceStatus === 'ready') {
      try {
        if (yocto > nearToYocto(balance as `${number}`)) return 'Insufficient balance.'
      } catch {
        // Unparseable balance is surfaced separately; don't block the send.
      }
    }
    return null
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (status === 'sending') return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setStatus('sending')
    try {
      if (target.kind === 'evm') {
        const { hash } = await sendEvmTransaction({
          seedPhrase,
          accountId,
          path: chainPaths.ethereum,
          nearNetwork: network,
          evmNetworkId: target.id,
          to: recipient.trim(),
          valueWei: parseUnits(amount, 18),
        })
        setTxHash(hash)
      } else if (target.kind === 'solana') {
        const { signature } = await sendSolTransaction({
          seedPhrase,
          accountId,
          path: chainPaths.solana,
          network,
          to: recipient.trim(),
          lamports: parseUnits(amount, 9),
        })
        setTxHash(signature)
      } else {
        setTxHash(await sendNear(seedPhrase, accountId, recipient.trim(), amount, network))
      }
      setStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed.')
      setStatus('idle')
    }
  }

  const explorer =
    target.kind === 'evm'
      ? `${EVM_NETWORKS[target.id].explorer}/tx/${txHash}`
      : target.kind === 'solana'
        ? `${SOLANA_EXPLORER[network]}/tx/${txHash}`
        : null

  if (status === 'sent') {
    return (
      <div className="send">
        <header className="send-header">
          <button type="button" className="back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <h1>Sent</h1>
        </header>

        <div className="success-card">
          <div className="success-mark">✓</div>
          <span className="success-title">Sent</span>
          <span className="success-amount">
            {amount} {target.unit}
          </span>
          <span className="success-to">to {recipient.trim()}</span>
        </div>

        <div className="tx">
          <span className="tx-label">Transaction hash</span>
          <code className="tx-value">{txHash}</code>
          {explorer && (
            <a className="tx-link" href={explorer} target="_blank" rel="noreferrer">
              View on {target.kind === 'solana' ? 'Solana' : EVM_NETWORKS[target.id].name} explorer
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
    <div className="send">
      <header className="send-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Send</h1>
      </header>

      <div className="target-select">
        {TARGETS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={t.id === targetId ? 'target-select-btn selected' : 'target-select-btn'}
            onClick={() => setTargetId(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="available">
        Available:
        {balanceStatus === 'loading' && <span className="muted"> loading…</span>}
        {balanceStatus === 'error' && <span className="muted error-text"> unavailable</span>}
        {balanceStatus === 'ready' && (
          <strong>
            {' '}
            {balance} {target.unit}
          </strong>
        )}
      </p>

      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Recipient</span>
          <input
            type="text"
            placeholder={target.kind === 'evm' ? '0x…' : target.kind === 'solana' ? 'Solana address' : 'Account address'}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            autoFocus
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span className="field-label">Amount ({target.unit})</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        {error && <span className="error">{error}</span>}

        <button type="submit" className="primary" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
