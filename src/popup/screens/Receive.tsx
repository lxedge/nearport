import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  CHAIN_LABELS,
  CHAIN_ORDER,
  type Chain,
  type ChainPaths,
} from '../../lib/chainsig'
import type { Network } from '../../lib/constants'
import { useDerivedAddresses } from '../useDerivedAddresses'
import './Receive.css'

interface ReceiveProps {
  accountId: string
  network: Network
  chainPaths: ChainPaths
  onBack: () => void
}

type ReceiveChain = 'near' | Chain

interface ReceiveTarget {
  id: ReceiveChain
  label: string
  // null while foreign-chain addresses are still being derived (or on error).
  address: string | null
}

// Tile glyphs: distinctive currency marks where one exists, otherwise a single
// initial. Labels sit beside each tile, so a plain letter is unambiguous.
const GLYPHS: Record<ReceiveChain, string> = {
  near: 'N',
  ethereum: 'Ξ',
  bitcoin: '₿',
  bitcoincash: 'B',
  litecoin: 'Ł',
  dogecoin: 'Ð',
  dash: 'Đ',
  zcash: 'Z',
  tron: 'T',
  solana: '◎',
  sui: 'S',
  aptos: 'A',
  stellar: '✦',
  ton: 'T',
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

export default function Receive({ accountId, network, chainPaths, onBack }: ReceiveProps) {
  const [selected, setSelected] = useState<ReceiveChain | null>(null)
  const [copied, setCopied] = useState<ReceiveChain | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(true)

  const { addresses, status } = useDerivedAddresses(accountId, chainPaths, network)

  // NEAR is the account itself; the rest are its MPC-derived foreign addresses.
  const targets: ReceiveTarget[] = useMemo(() => {
    const rows: ReceiveTarget[] = [{ id: 'near', label: 'NEAR', address: accountId }]
    for (const chain of CHAIN_ORDER) {
      rows.push({
        id: chain,
        label: CHAIN_LABELS[chain],
        address: status === 'ready' ? addresses[chain] ?? null : null,
      })
    }
    return rows
  }, [accountId, addresses, status])

  const selectedTarget = selected ? targets.find((t) => t.id === selected) ?? null : null
  const address = selectedTarget?.address ?? ''

  useEffect(() => {
    if (!address) {
      setQr(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(address, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  function copyAddress(target: ReceiveTarget) {
    if (!target.address) return
    navigator.clipboard
      .writeText(target.address)
      .then(() => setCopied(target.id))
      .catch(() => {})
  }

  function backToSelect() {
    setSelected(null)
    setQrOpen(true)
  }

  // Step 2 — the address for the selected chain.
  if (selected && selectedTarget) {
    return (
      <div className="receive">
        <header className="receive-header">
          <button type="button" className="back" onClick={backToSelect} aria-label="Back">
            ←
          </button>
          <h1>{selectedTarget.label}</h1>
        </header>

        {qrOpen && (
          <div className="qr-card">
            {qr ? (
              <img src={qr} alt={`QR code for ${selectedTarget.label} address`} className="qr" />
            ) : (
              <div className="qr" />
            )}
          </div>
        )}

        <div className="address">
          <div className="address-meta">
            <span className="address-label">Address</span>
            <code className="address-value">
              {address || (status === 'error' ? 'Unavailable' : 'Deriving address…')}
            </code>
          </div>
          <button
            type="button"
            className="address-copy"
            onClick={() => copyAddress(selectedTarget)}
            disabled={!address}
          >
            {copied === selectedTarget.id ? 'Copied' : 'Copy'}
          </button>
        </div>

        <button type="button" className="secondary" onClick={() => setQrOpen((v) => !v)}>
          {qrOpen ? 'Hide QR code' : 'Show QR code'}
        </button>
      </div>
    )
  }

  // Step 1 — pick a chain.
  return (
    <div className="receive">
      <header className="receive-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Receive</h1>
      </header>

      <p className="hint">Select a chain to receive funds.</p>

      <div className="chain-list">
        {targets.map((t) => (
          <div className="chain-card" key={t.id}>
            <button type="button" className="chain-main" onClick={() => setSelected(t.id)}>
              <span className="chain-icon" aria-hidden="true">
                {GLYPHS[t.id]}
              </span>
              <span className="chain-meta">
                <span className="chain-label">{t.label}</span>
                <code className="chain-address">
                  {t.address ?? (status === 'error' ? 'Unavailable' : 'Deriving…')}
                </code>
              </span>
            </button>
            <button
              type="button"
              className="chain-btn"
              title="Show address & QR code"
              aria-label={`Show ${t.label} address and QR code`}
              onClick={() => setSelected(t.id)}
            >
              <MoreIcon />
            </button>
            <button
              type="button"
              className="chain-btn"
              title="Copy address"
              aria-label={`Copy ${t.label} address`}
              disabled={!t.address}
              onClick={() => copyAddress(t)}
            >
              {copied === t.id ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
