import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import './Receive.css'

interface ReceiveProps {
  accountId: string
  onBack: () => void
}

export default function Receive({ accountId, onBack }: ReceiveProps) {
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(accountId, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [accountId])

  function copyAddress() {
    navigator.clipboard
      .writeText(accountId)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  return (
    <div className="receive">
      <header className="receive-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Receive NEAR</h1>
      </header>

      <p className="hint">Share this address to receive NEAR.</p>

      <div className="qr-card">
        {qr ? <img src={qr} alt="QR code for account address" className="qr" /> : <div className="qr" />}
      </div>

      <div className="address">
        <span className="address-label">Account address</span>
        <code className="address-value">{accountId}</code>
      </div>

      <button type="button" className="primary" onClick={copyAddress}>
        {copied ? 'Copied' : 'Copy address'}
      </button>
    </div>
  )
}
