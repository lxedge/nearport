import { useEffect, useState } from 'react'
import Welcome from './Welcome'
import CreateWallet from './CreateWallet'
import SetPassword from './SetPassword'
import Unlock from './Unlock'
import Home from './Home'
import Receive from './Receive'
import Send from './Send'
import Settings from './Settings'
import { decryptSeedPhrase, encryptSeedPhrase } from '../lib/crypto'
import type { Network, CreatedAccount } from '../lib/near'

const ACCOUNT_KEY = 'accountId'
const ENCRYPTED_SEED_KEY = 'encryptedSeed'
const NETWORK_KEY = 'network'

type Screen = 'welcome' | 'create' | 'setPassword' | 'unlock' | 'home' | 'receive' | 'send' | 'settings'

export default function App() {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [encryptedSeed, setEncryptedSeed] = useState<string | null>(null)
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null)
  const [network, setNetwork] = useState<Network>('testnet')
  const [screen, setScreen] = useState<Screen>('welcome')
  const [loading, setLoading] = useState(true)
  const [pendingAccount, setPendingAccount] = useState<CreatedAccount | null>(null)

  useEffect(() => {
    chrome.storage.local.get([ACCOUNT_KEY, ENCRYPTED_SEED_KEY, NETWORK_KEY]).then((data) => {
      const storedId = data[ACCOUNT_KEY]
      const storedSeed = data[ENCRYPTED_SEED_KEY]
      // An account without an encrypted seed is an incomplete pre-password
      // setup; treat it as no account so the user can start fresh.
      if (typeof storedId === 'string' && typeof storedSeed === 'string') {
        setAccountId(storedId)
        setEncryptedSeed(storedSeed)
      }
      const net = data[NETWORK_KEY]
      if (net === 'mainnet' || net === 'testnet') setNetwork(net)
      setLoading(false)
    })
  }, [])

  function handleCreated(account: CreatedAccount) {
    setPendingAccount(account)
    setScreen('setPassword')
  }

  async function handlePasswordSet(password: string) {
    if (!pendingAccount) return
    const encrypted = await encryptSeedPhrase(pendingAccount.seedPhrase, password)
    await chrome.storage.local.set({
      [ACCOUNT_KEY]: pendingAccount.accountId,
      [ENCRYPTED_SEED_KEY]: encrypted,
    })
    setAccountId(pendingAccount.accountId)
    setEncryptedSeed(encrypted)
    setSeedPhrase(pendingAccount.seedPhrase)
    setPendingAccount(null)
    setScreen('home')
  }

  async function handleUnlock(password: string): Promise<boolean> {
    if (!encryptedSeed) return false
    try {
      const seed = await decryptSeedPhrase(encryptedSeed, password)
      setSeedPhrase(seed)
      setScreen('home')
      return true
    } catch {
      return false
    }
  }

  async function handleNetworkChange(net: Network) {
    await chrome.storage.local.set({ [NETWORK_KEY]: net })
    setNetwork(net)
  }

  function handleLock() {
    setSeedPhrase(null)
    setScreen('unlock')
  }

  async function handleSignOut() {
    await chrome.storage.local.remove([ACCOUNT_KEY, ENCRYPTED_SEED_KEY])
    setAccountId(null)
    setEncryptedSeed(null)
    setSeedPhrase(null)
    setPendingAccount(null)
    setScreen('welcome')
  }

  if (loading) return null

  if (accountId === null) {
    if (screen === 'create') {
      return <CreateWallet onComplete={handleCreated} onBack={() => setScreen('welcome')} />
    }
    if (screen === 'setPassword' && pendingAccount) {
      return (
        <SetPassword
          onSubmit={handlePasswordSet}
          onBack={() => {
            setPendingAccount(null)
            setScreen('create')
          }}
        />
      )
    }
    return <Welcome onCreate={() => setScreen('create')} />
  }

  if (screen === 'settings') {
    return (
      <Settings
        network={network}
        onNetworkChange={handleNetworkChange}
        onBack={() => setScreen('home')}
        onLock={handleLock}
        onSignOut={handleSignOut}
      />
    )
  }

  if (screen === 'receive') {
    return <Receive accountId={accountId} onBack={() => setScreen('home')} />
  }

  if (seedPhrase === null) {
    return <Unlock onSubmit={handleUnlock} />
  }

  if (screen === 'send') {
    return (
      <Send
        accountId={accountId}
        seedPhrase={seedPhrase}
        network={network}
        onBack={() => setScreen('home')}
      />
    )
  }

  return (
    <Home
      accountId={accountId}
      network={network}
      onOpenSettings={() => setScreen('settings')}
      onOpenReceive={() => setScreen('receive')}
      onOpenSend={() => setScreen('send')}
    />
  )
}
