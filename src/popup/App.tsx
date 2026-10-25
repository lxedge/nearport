import { useEffect, useState } from 'react'
import Welcome from './Welcome'
import CreateWallet from './CreateWallet'
import SetPassword from './SetPassword'
import Unlock from './Unlock'
import Home from './Home'
import Receive from './Receive'
import Send from './Send'
import ChooseAccount from './ChooseAccount'
import CreateNamedAccount from './CreateNamedAccount'
import Settings from './Settings'
import { decryptSeedPhrase, encryptSeedPhrase } from '../lib/crypto'
import { getImplicitAddress, type Network, type CreatedAccount } from '../lib/near'

const ACCOUNT_KEY = 'accountId'
const ENCRYPTED_SEED_KEY = 'encryptedSeed'
const NETWORK_KEY = 'network'
// Optional named `.near` account for mainnet; when absent the implicit address is used.
const MAINNET_ACCOUNT_KEY = 'mainnetAccountId'
// Plaintext seed is cached in chrome.storage.session (in-memory, cleared on
// browser exit) so a recently-active wallet skips the unlock prompt.
const UNLOCKED_SEED_KEY = 'unlockedSeed'
const LAST_ACTIVE_KEY = 'lastActiveAt'
const AUTO_LOCK_MS = 3 * 60 * 1000

type Screen =
  | 'welcome'
  | 'create'
  | 'chooseAccount'
  | 'setPassword'
  | 'unlock'
  | 'home'
  | 'receive'
  | 'send'
  | 'createNamed'
  | 'settings'

export default function App() {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [mainnetAccountId, setMainnetAccountId] = useState<string | null>(null)
  const [encryptedSeed, setEncryptedSeed] = useState<string | null>(null)
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null)
  const [network, setNetwork] = useState<Network>('testnet')
  const [screen, setScreen] = useState<Screen>('welcome')
  const [loading, setLoading] = useState(true)
  const [pendingAccount, setPendingAccount] = useState<CreatedAccount | null>(null)

  useEffect(() => {
    ;(async () => {
      const data = await chrome.storage.local.get([
        ACCOUNT_KEY,
        MAINNET_ACCOUNT_KEY,
        ENCRYPTED_SEED_KEY,
        NETWORK_KEY,
      ])
      const storedId = data[ACCOUNT_KEY]
      const storedSeed = data[ENCRYPTED_SEED_KEY]
      // An account without an encrypted seed is an incomplete pre-password
      // setup; treat it as no account so the user can start fresh.
      if (typeof storedId === 'string' && typeof storedSeed === 'string') {
        setAccountId(storedId)
        setEncryptedSeed(storedSeed)
      }
      const mainnetId = data[MAINNET_ACCOUNT_KEY]
      if (typeof mainnetId === 'string') setMainnetAccountId(mainnetId)
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
    setScreen('chooseAccount')
  }

  function handleAccountChosen(accountId: string) {
    if (!pendingAccount) return
    // Named accounts are created on testnet via the faucet; keep the wallet on
    // testnet so balance and sends target the right network.
    setNetwork('testnet')
    chrome.storage.local.set({ [NETWORK_KEY]: 'testnet' })
    setPendingAccount({ ...pendingAccount, accountId })
    setScreen('setPassword')
  }

  function handleAccountSkipped() {
    setScreen('setPassword')
  }

  async function handleCreateMainnetNamed(accountId: string) {
    await chrome.storage.local.set({ [MAINNET_ACCOUNT_KEY]: accountId })
    setMainnetAccountId(accountId)
    setScreen('home')
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
    await chrome.storage.local.remove([ACCOUNT_KEY, MAINNET_ACCOUNT_KEY, ENCRYPTED_SEED_KEY])
    await chrome.storage.session.remove([UNLOCKED_SEED_KEY, LAST_ACTIVE_KEY])
    setAccountId(null)
    setMainnetAccountId(null)
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
    if (screen === 'chooseAccount' && pendingAccount) {
      return (
        <ChooseAccount
          seedPhrase={pendingAccount.seedPhrase}
          onComplete={handleAccountChosen}
          onSkip={handleAccountSkipped}
          onBack={() => {
            setPendingAccount(null)
            setScreen('create')
          }}
        />
      )
    }
    if (screen === 'setPassword' && pendingAccount) {
      return (
        <SetPassword
          onSubmit={handlePasswordSet}
          onBack={() => setScreen('chooseAccount')}
        />
      )
    }
    return <Welcome onCreate={() => setScreen('create')} />
  }

  if (seedPhrase === null) {
    return <Unlock onSubmit={handleUnlock} />
  }

  // The wallet tracks one account per network. A named `.testnet` account only
  // exists on testnet; on mainnet it falls back to a stored `.near` account, or
  // to the key's implicit address when none has been created yet.
  const implicitAddress = getImplicitAddress(seedPhrase)
  const activeAccountId =
    network === 'mainnet' ? (mainnetAccountId ?? implicitAddress) : accountId
  const canCreateNamedAccount = network === 'mainnet' && activeAccountId === implicitAddress

  if (screen === 'receive') {
    return <Receive accountId={activeAccountId} onBack={() => setScreen('home')} />
  }

  if (screen === 'createNamed') {
    return (
      <CreateNamedAccount
        seedPhrase={seedPhrase}
        funderAccountId={activeAccountId}
        onComplete={handleCreateMainnetNamed}
        onBack={() => setScreen('home')}
      />
    )
  }

  if (screen === 'settings') {
    return (
      <Settings
        network={network}
        implicitAddress={implicitAddress}
        onNetworkChange={handleNetworkChange}
        onBack={() => setScreen('home')}
        onLock={handleLock}
        onSignOut={handleSignOut}
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
      accountId={activeAccountId}
      network={network}
      showCreateNamed={canCreateNamedAccount}
      onOpenSettings={() => setScreen('settings')}
      onOpenReceive={() => setScreen('receive')}
      onOpenSend={() => setScreen('send')}
      onCreateNamed={() => setScreen('createNamed')}
    />
  )
}
