import { useState } from 'react'
import { createAccount, type CreatedAccount } from '../../lib/account'
import './CreateWallet.css'

interface CreateWalletProps {
  onComplete: (account: CreatedAccount) => void
  onBack: () => void
  onOpenSidePanel: () => void
}

export default function CreateWallet({ onComplete, onBack, onOpenSidePanel }: CreateWalletProps) {
  // Generate once per mount; stable across re-renders.
  const [account] = useState<CreatedAccount>(() => createAccount())
  const [copied, setCopied] = useState(false)

  function copySeedPhrase() {
    navigator.clipboard
      .writeText(account.seedPhrase)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  return (
    <div className="create">
      <header className="create-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Back up your wallet</h1>
        <button
          type="button"
          className="panel-btn"
          onClick={onOpenSidePanel}
          aria-label="Open side panel"
          title="Open side panel"
        >
          ⧉
        </button>
      </header>

      <p className="warning">
        Write down these 12 words in order and keep them offline. Anyone with them
        controls your funds. Never share them.
      </p>

      <div className="seed-grid">
        {account.seedPhrase.split(' ').map((word, i) => (
          <div className="seed-word" key={i}>
            <span className="index">{i + 1}</span>
            <span className="word">{word}</span>
          </div>
        ))}
      </div>

      <div className="create-actions">
        <button type="button" className="primary" onClick={() => onComplete(account)}>
          I saved it
        </button>
        <button type="button" className="secondary" onClick={copySeedPhrase}>
          {copied ? 'Copied' : 'Copy phrase'}
        </button>
      </div>
    </div>
  )
}
