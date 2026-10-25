import './Welcome.css'

interface WelcomeProps {
  onCreate: () => void
  onImport: () => void
}

export default function Welcome({ onCreate, onImport }: WelcomeProps) {
  return (
    <div className="welcome">
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
