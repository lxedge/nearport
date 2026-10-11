import { useEffect, useState } from 'react'
import Welcome from './Welcome'
import CreateWallet from './CreateWallet'
import Home from './Home'
import Settings from './Settings'
import type { Network, CreatedAccount } from '../lib/near'

const ACCOUNT_KEY = 'accountId'
const SEED_KEY = 'seedPhrase'
const NETWORK_KEY = 'network'

type Screen = 'welcome' | 'create' | 'home' | 'settings'

export default function App() {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [network, setNetwork] = useState<Network>('testnet')
  const [screen, setScreen] = useState<Screen>('welcome')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chrome.storage.local.get([ACCOUNT_KEY, NETWORK_KEY]).then((data) => {
      const stored = data[ACCOUNT_KEY]
      setAccountId(typeof stored === 'string' ? stored : null)
      const net = data[NETWORK_KEY]
      if (net === 'mainnet' || net === 'testnet') setNetwork(net)
      setLoading(false)
    })
  }, [])

  async function handleCreated(account: CreatedAccount) {
    await chrome.storage.local.set({
      [ACCOUNT_KEY]: account.accountId,
      [SEED_KEY]: account.seedPhrase,
    })
    setAccountId(account.accountId)
    setScreen('home')
  }

  async function handleNetworkChange(net: Network) {
    await chrome.storage.local.set({ [NETWORK_KEY]: net })
    setNetwork(net)
  }

  async function handleSignOut() {
    await chrome.storage.local.remove([ACCOUNT_KEY, SEED_KEY])
    setAccountId(null)
    setScreen('welcome')
  }

  if (loading) return null

  if (accountId === null) {
    if (screen === 'create') {
      return <CreateWallet onComplete={handleCreated} onBack={() => setScreen('welcome')} />
    }
    return <Welcome onCreate={() => setScreen('create')} />
  }

  if (screen === 'settings') {
    return (
      <Settings
        network={network}
        onNetworkChange={handleNetworkChange}
        onBack={() => setScreen('home')}
        onSignOut={handleSignOut}
      />
    )
  }

  return <Home accountId={accountId} network={network} onOpenSettings={() => setScreen('settings')} />
}
