import { useState } from 'react'
import { getSecretKey } from '../../lib/account'
import './ExportWallet.css'

interface ExportWalletProps {
  seedPhrase: string
  onBack: () => void
}

export default function ExportWallet({ seedPhrase, onBack }: ExportWalletProps) {
  const [copiedSeed, setCopiedSeed] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

  const words = seedPhrase.split(' ')
  const secretKey = getSecretKey(seedPhrase)

  function copy(text: string, which: 'seed' | 'key') {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (which === 'seed') setCopiedSeed(true)
        else setCopiedKey(true)
      })
      .catch(() => {})
  }

  return (
    <div className="export">
      <header className="export-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Export wallet</h1>
      </header>

      <p className="warning">
        Anyone with your seed phrase or private key can take all your funds. Never share them.
      </p>

      <section className="group">
        <span className="label">Seed phrase</span>
        <div className="seed-grid">
          {words.map((word, i) => (
            <div className="seed-word" key={i}>
              <span className="index">{i + 1}</span>
              <span className="word">{word}</span>
            </div>
          ))}
        </div>
        <button type="button" className="copy" onClick={() => copy(seedPhrase, 'seed')}>
          {copiedSeed ? 'Copied' : 'Copy seed phrase'}
        </button>
      </section>

      <section className="group">
        <span className="label">Private key</span>
        <code className="secret-key">{secretKey}</code>
        <button type="button" className="copy" onClick={() => copy(secretKey, 'key')}>
          {copiedKey ? 'Copied' : 'Copy private key'}
        </button>
      </section>
    </div>
  )
}
