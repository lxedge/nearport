import { useEffect, useState } from 'react'
import Welcome from './Welcome'
import CreateWallet from './CreateWallet'
import SetPassword from './SetPassword'
import Unlock from './Unlock'
import Home from './Home'
import Receive from './Receive'
import Send from './Send'
import CreateNamedAccount from './CreateNamedAccount'
import ChainSignatures from './ChainSignatures'
import Settings from './Settings'
import { decryptSeedPhrase, encryptSeedPhrase } from '../lib/crypto'
import { getImplicitAddress, type Network, type CreatedAccount } from '../lib/near'

const ENCRYPTED_SEED_KEY = 'encryptedSeed'
const NETWORK_KEY = 'network'
// Per-network named accounts plus which one is active. An empty list or a null
// active account means the implicit address is in use for that network.
const TESTNET_ACCOUNTS_KEY = 'testnetAccounts'
const ACTIVE_TESTNET_ACCOUNT_KEY = 'activeTestnetAccount'
const MAINNET_ACCOUNTS_KEY = 'mainnetAccounts'
const ACTIVE_MAINNET_ACCOUNT_KEY = 'activeMainnetAccount'
// Legacy single-account keys from earlier versions; read only to migrate.
const LEGACY_ACCOUNT_KEY = 'accountId'
const LEGACY_MAINNET_ACCOUNT_KEY = 'mainnetAccountId'

const ACCOUNTS_KEYS: Record<Network, string> = {
  testnet: TESTNET_ACCOUNTS_KEY,
  mainnet: MAINNET_ACCOUNTS_KEY,
}
const ACTIVE_KEYS: Record<Network, string> = {
  testnet: ACTIVE_TESTNET_ACCOUNT_KEY,
  mainnet: ACTIVE_MAINNET_ACCOUNT_KEY,
}
// Plaintext seed is cached in chrome.storage.session (in-memory, cleared on
// browser exit) so a recently-active wallet skips the unlock prompt.
const UNLOCKED_SEED_KEY = 'unlockedSeed'
const LAST_ACTIVE_KEY = 'lastActiveAt'
const AUTO_LOCK_MS = 3 * 60 * 1000

type Screen =
  | 'welcome'
  | 'create'
  | 'setPassword'
  | 'unlock'
  | 'home'
  | 'receive'
  | 'send'
  | 'createNamed'
  | 'chainsig'
  | 'settings'

export default function App() {
  const [namedAccounts, setNamedAccounts] = useState<Record<Network, string[]>>({
    testnet: [],
    mainnet: [],
  })
  const [activeAccount, setActiveAccount] = useState<Record<Network, string | null>>({
    testnet: null,
    mainnet: null,
  })
  const [encryptedSeed, setEncryptedSeed] = useState<string | null>(null)
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null)
  const [network, setNetwork] = useState<Network>('testnet')
  const [screen, setScreen] = useState<Screen>('welcome')
  const [loading, setLoading] = useState(true)
  const [pendingAccount, setPendingAccount] = useState<CreatedAccount | null>(null)

  useEffect(() => {
    ;(async () => {
      const data = await chrome.storage.local.get([
        TESTNET_ACCOUNTS_KEY,
        ACTIVE_TESTNET_ACCOUNT_KEY,
        MAINNET_ACCOUNTS_KEY,
        ACTIVE_MAINNET_ACCOUNT_KEY,
        LEGACY_ACCOUNT_KEY,
        LEGACY_MAINNET_ACCOUNT_KEY,
        ENCRYPTED_SEED_KEY,
        NETWORK_KEY,
      ])

      const storedSeed = data[ENCRYPTED_SEED_KEY]
      if (typeof storedSeed === 'string') setEncryptedSeed(storedSeed)

      // Testnet accounts (migrate the old single `accountId` when it was named).
      const tAccounts = Array.isArray(data[TESTNET_ACCOUNTS_KEY])
        ? data[TESTNET_ACCOUNTS_KEY].filter((a): a is string => typeof a === 'string')
        : []
      if (tAccounts.length === 0) {
        const legacy = data[LEGACY_ACCOUNT_KEY]
        if (typeof legacy === 'string' && legacy.endsWith('.testnet')) tAccounts.push(legacy)
      }
      const tActiveRaw = data[ACTIVE_TESTNET_ACCOUNT_KEY]
      const tActive =
        typeof tActiveRaw === 'string' && tAccounts.includes(tActiveRaw)
          ? tActiveRaw
          : (tAccounts[tAccounts.length - 1] ?? null)

      // Mainnet accounts (migrate the old single `mainnetAccountId`).
      const mAccounts = Array.isArray(data[MAINNET_ACCOUNTS_KEY])
        ? data[MAINNET_ACCOUNTS_KEY].filter((a): a is string => typeof a === 'string')
        : []
      if (mAccounts.length === 0) {
        const legacy = data[LEGACY_MAINNET_ACCOUNT_KEY]
        if (typeof legacy === 'string') mAccounts.push(legacy)
      }
      const mActiveRaw = data[ACTIVE_MAINNET_ACCOUNT_KEY]
      const mActive =
        typeof mActiveRaw === 'string' && mAccounts.includes(mActiveRaw)
          ? mActiveRaw
          : (mAccounts[mAccounts.length - 1] ?? null)

      setNamedAccounts({ testnet: tAccounts, mainnet: mAccounts })
      setActiveAccount({ testnet: tActive, mainnet: mActive })

      const net = data[NETWORK_KEY]
      if (net === 'mainnet' || net === 'testnet') setNetwork(net)

      // Restore the unlocked seed if the wallet was active within the auto-lock
      // window, sliding the window forward on each open.
      const session = await chrome.storage.session.get([UNLOCKED_SEED_KEY, LAST_ACTIVE_KEY])
      const cachedSeed = session[UNLOCKED_SEED_KEY]
      const lastActive = session[LAST_ACTIVE_KEY]
      if (
        typeof cachedSeed === 'string' &&
        typeof lastActive === 'number' &&
        Date.now() - lastActive <= AUTO_LOCK_MS
      ) {
        setSeedPhrase(cachedSeed)
        await chrome.storage.session.set({ [LAST_ACTIVE_KEY]: Date.now() })
      } else {
        await chrome.storage.session.remove([UNLOCKED_SEED_KEY, LAST_ACTIVE_KEY])
      }

      setLoading(false)
    })()
  }, [])

  function handleCreated(account: CreatedAccount) {
    setPendingAccount(account)
    setScreen('setPassword')
  }

  async function handleCreateNamed(net: Network, accountId: string) {
    const next = [...namedAccounts[net], accountId]
    await chrome.storage.local.set({
      [ACCOUNTS_KEYS[net]]: next,
      [ACTIVE_KEYS[net]]: accountId,
    })
    setNamedAccounts((prev) => ({ ...prev, [net]: next }))
    setActiveAccount((prev) => ({ ...prev, [net]: accountId }))
    setScreen('home')
  }

  function handleSwitchAccount(net: Network, id: string | null) {
    setActiveAccount((prev) => ({ ...prev, [net]: id }))
    if (id === null) {
      chrome.storage.local.remove([ACTIVE_KEYS[net]])
    } else {
      chrome.storage.local.set({ [ACTIVE_KEYS[net]]: id })
    }
  }

  async function handlePasswordSet(password: string) {
    if (!pendingAccount) return
    const encrypted = await encryptSeedPhrase(pendingAccount.seedPhrase, password)
    await chrome.storage.local.set({ [ENCRYPTED_SEED_KEY]: encrypted })
    setNamedAccounts({ testnet: [], mainnet: [] })
    setActiveAccount({ testnet: null, mainnet: null })
    setEncryptedSeed(encrypted)
    setSeedPhrase(pendingAccount.seedPhrase)
    await chrome.storage.session.set({
      [UNLOCKED_SEED_KEY]: pendingAccount.seedPhrase,
      [LAST_ACTIVE_KEY]: Date.now(),
    })
    setPendingAccount(null)
    setScreen('home')
  }

  async function handleUnlock(password: string): Promise<boolean> {
    if (!encryptedSeed) return false
    try {
      const seed = await decryptSeedPhrase(encryptedSeed, password)
      await chrome.storage.session.set({
        [UNLOCKED_SEED_KEY]: seed,
        [LAST_ACTIVE_KEY]: Date.now(),
      })
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
    chrome.storage.session.remove([UNLOCKED_SEED_KEY, LAST_ACTIVE_KEY])
    setSeedPhrase(null)
    setScreen('unlock')
  }

  async function handleSignOut() {
    await chrome.storage.local.remove([
      TESTNET_ACCOUNTS_KEY,
      ACTIVE_TESTNET_ACCOUNT_KEY,
      MAINNET_ACCOUNTS_KEY,
      ACTIVE_MAINNET_ACCOUNT_KEY,
      ENCRYPTED_SEED_KEY,
    ])
    await chrome.storage.session.remove([UNLOCKED_SEED_KEY, LAST_ACTIVE_KEY])
    setNamedAccounts({ testnet: [], mainnet: [] })
    setActiveAccount({ testnet: null, mainnet: null })
    setEncryptedSeed(null)
    setSeedPhrase(null)
    setPendingAccount(null)
    setScreen('welcome')
  }

  if (loading) return null

  if (encryptedSeed === null) {
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

  if (seedPhrase === null) {
    return <Unlock onSubmit={handleUnlock} />
  }

  const implicitAddress = getImplicitAddress(seedPhrase)
  const activeAccountId = activeAccount[network] ?? implicitAddress

  if (screen === 'receive') {
    return <Receive accountId={activeAccountId} onBack={() => setScreen('home')} />
  }

  if (screen === 'createNamed') {
    return (
      <CreateNamedAccount
        network={network}
        seedPhrase={seedPhrase}
        funderAccountId={activeAccountId}
        onComplete={(id) => handleCreateNamed(network, id)}
        onBack={() => setScreen('home')}
      />
    )
  }

  if (screen === 'chainsig') {
    return (
      <ChainSignatures
        accountId={activeAccountId}
        seedPhrase={seedPhrase}
        network={network}
        onBack={() => setScreen('settings')}
      />
    )
  }

  if (screen === 'settings') {
    return (
      <Settings
        network={network}
        implicitAddress={implicitAddress}
        accounts={namedAccounts[network]}
        activeAccount={activeAccount[network]}
        onSwitchAccount={(id) => handleSwitchAccount(network, id)}
        onNetworkChange={handleNetworkChange}
        onBack={() => setScreen('home')}
        onLock={handleLock}
        onSignOut={handleSignOut}
        onOpenChainSig={() => setScreen('chainsig')}
      />
    )
  }

  if (screen === 'send') {
    return (
      <Send
        accountId={activeAccountId}
        seedPhrase={seedPhrase}
        network={network}
        onBack={() => setScreen('home')}
      />
    )
  }

  return (
    <Home
      network={network}
      accounts={[implicitAddress, ...namedAccounts[network]]}
      activeAccountId={activeAccountId}
      onOpenSettings={() => setScreen('settings')}
      onOpenReceive={() => setScreen('receive')}
      onOpenSend={() => setScreen('send')}
      onCreateNamed={() => setScreen('createNamed')}
    />
  )
}
