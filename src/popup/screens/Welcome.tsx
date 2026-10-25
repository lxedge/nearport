import './Welcome.css'

interface WelcomeProps {
  onCreate: () => void
  onImport: () => void
  onOpenSidePanel: () => void
}

export default function Welcome({ onCreate, onImport, onOpenSidePanel }: WelcomeProps) {
  return (
    <div className="welcome">
      <button
        type="button"
        className="panel-btn"
        onClick={onOpenSidePanel}
        aria-label="Open side panel"
        title="Open side panel"
      >
        ⧉
      </button>
      <div className="brand">
        <div className="logo">◈</div>
        <h1>NearPort</h1>
      </div>

      <p className="tagline">A wallet for the NEAR ecosystem</p>

      <div className="actions">
        <button type="button" className="primary" onClick={onCreate}>
          Create a new wallet
        </button>
        <button type="button" className="secondary" onClick={onImport}>
          I already have a wallet
        </button>
      </div>
    </div>
  )
}
