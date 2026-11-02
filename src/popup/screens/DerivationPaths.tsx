import { useState } from 'react'
import { CHAIN_LABELS, CHAIN_ORDER, type Chain, type ChainPaths } from '../../lib/chainsig'
import './DerivationPaths.css'

interface DerivationPathsProps {
  chainPaths: ChainPaths
  onSetChainPath: (chain: Chain, path: string) => void
  onBack: () => void
}

export default function DerivationPaths({ chainPaths, onSetChainPath, onBack }: DerivationPathsProps) {
  const [editing, setEditing] = useState<Chain | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<{ chain: Chain; path: string } | null>(null)

  function startEdit(chain: Chain) {
    setEditing(chain)
    setDraft(chainPaths[chain])
  }

  function requestSave() {
    if (!editing) return
    const path = draft.trim()
    if (path.length === 0) return
    setConfirming({ chain: editing, path })
  }

  function confirmSave() {
    if (!confirming) return
    onSetChainPath(confirming.chain, confirming.path)
    setConfirming(null)
    setEditing(null)
  }

  return (
    <div className="derivation-paths">
      <header className="derivation-paths-header">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1>Derivation paths</h1>
      </header>

      <p className="hint">
        Each path controls a different address on that chain. Changing a path switches which
        address your NEAR account controls.
      </p>

      <div className="path-list">
        {CHAIN_ORDER.map((chain) => (
          <div className="path-row" key={chain}>
            <span className="path-label">{CHAIN_LABELS[chain]}</span>
            {editing === chain ? (
              <>
                <input
                  type="text"
                  className="path-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                <button
                  type="button"
                  className="path-action"
                  onClick={requestSave}
                  disabled={draft.trim().length === 0}
                >
                  Save
                </button>
                <button type="button" className="path-action" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <code className="path-value">{chainPaths[chain]}</code>
                <button type="button" className="path-action" onClick={() => startEdit(chain)}>
                  Edit
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {confirming && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Change derivation path?</h2>
            <p>
              Changing the {CHAIN_LABELS[confirming.chain]} path switches which address your NEAR
              account controls. The old address may still hold funds.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmSave}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
