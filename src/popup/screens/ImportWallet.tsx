import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { importAccount, type CreatedAccount } from '../../lib/account'
import './ImportWallet.css'

const WORD_COUNT = 12

interface ImportWalletProps {
  onComplete: (account: CreatedAccount) => void
  onBack: () => void
  onOpenSidePanel: () => void
}

export default function ImportWallet({ onComplete, onBack, onOpenSidePanel }: ImportWalletProps) {
  const [words, setWords] = useState<string[]>(() => Array(WORD_COUNT).fill(''))
  const [error, setError] = useState('')
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(i: number, value: string) {
    const parts = value.split(' ')
    if (parts.length > 1) {
      // A space was typed or multiple words pasted: distribute and advance.
      const clean = parts.filter((p) => p !== '')
      setWords((prev) => {
        const next = [...prev]
        for (let j = 0; j < clean.length && i + j < WORD_COUNT; j++) {
          next[i + j] = clean[j]
        }
        return next
      })
      inputsRef.current[Math.min(i + clean.length, WORD_COUNT - 1)]?.focus()
    } else {
      setWords((prev) => {
        const next = [...prev]
        next[i] = value
        return next
      })
    }
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && words[i] === '' && i > 0) {
      e.preventDefault()
      inputsRef.current[i - 1]?.focus()
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (words.some((w) => w.trim() === '')) {
      setError('Enter all 12 words.')
      return
    }
    try {
      onComplete(importAccount(words.map((w) => w.trim().toLowerCase()).join(' ')))
    } catch {
      setError('Invalid seed phrase. Check the words and their order.')
    }
  }

  return (
    <div className="import">
      <header className="import-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Import wallet</h1>
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

      <p className="hint">
        Enter your 12-word seed phrase. Press space to move to the next word.
      </p>

      <form onSubmit={submit}>
        <div className="seed-inputs">
          {words.map((word, i) => (
            <div className="seed-input" key={i}>
              <span className="index">{i + 1}</span>
              <input
                type="text"
                ref={(el) => {
                  inputsRef.current[i] = el
                }}
                value={word}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                autoFocus={i === 0}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          ))}
        </div>

        {error && <span className="error">{error}</span>}

        <button type="submit" className="primary">
          Import
        </button>
      </form>
    </div>
  )
}
