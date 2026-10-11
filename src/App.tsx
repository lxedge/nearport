import { useEffect, useState } from 'react'

interface RuntimeInfo {
  name: string
  version: string
}

export default function App() {
  const [info, setInfo] = useState<RuntimeInfo | null>(null)
  const [pingReply, setPingReply] = useState('')

  useEffect(() => {
    const manifest = chrome.runtime.getManifest()
    setInfo({ name: manifest.name, version: manifest.version })
  }, [])

  async function pingBackground() {
    const res = await chrome.runtime.sendMessage({ type: 'PING' })
    setPingReply(res.message)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">◈</div>
        <div>
          <h1>NearPort</h1>
          <p className="subtitle">NEAR wallet</p>
        </div>
      </header>

      <section className="card">
        <span className="label">Account</span>
        <span className="value muted">No account connected</span>
        <span className="hint">NEAR integration comes next.</span>
      </section>

      <section className="card">
        <span className="label">Extension runtime</span>
        <dl className="kv">
          <div>
            <dt>Name</dt>
            <dd>{info?.name ?? '…'}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{info?.version ?? '…'}</dd>
          </div>
        </dl>
        <button type="button" onClick={pingBackground}>
          Ping service worker
        </button>
        {pingReply && <p className="reply">Background replied: {pingReply}</p>}
      </section>
    </div>
  )
}
