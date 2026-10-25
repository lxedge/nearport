import { useEffect, useState } from 'react'
import { decryptSeedPhrase, encryptSeedPhrase } from '../lib/crypto'
import { getImplicitAddress, discoverNamedAccounts } from '../lib/account'
import { createFaucetAccount } from '../lib/named-account'
import type { Network } from '../lib/constants'

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

export function useWallet() {
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
  const [network, setNetworkState] = useState<Network>('testnet')
  const [loading, setLoading] = useState(true)

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
      if (net === 'mainnet' || net === 'testnet') setNetworkState(net)

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

  async function addAccount(net: Network, accountId: string) {
    const next = [...namedAccounts[net], accountId]
    await chrome.storage.local.set({
      [ACCOUNTS_KEYS[net]]: next,
      [ACTIVE_KEYS[net]]: accountId,
    })
    setNamedAccounts((prev) => ({ ...prev, [net]: next }))
    setActiveAccount((prev) => ({ ...prev, [net]: accountId }))
  }

  // Finds named accounts controlled by the seed's key (via the indexer) and adds
  // them to the wallet. Imported wallets otherwise only restore the implicit address.
  async function discoverAndAddAccounts(seed: string) {
    for (const net of ['mainnet', 'testnet'] as const) {
      const found = await discoverNamedAccounts(seed, net).catch(() => [])
      if (found.length === 0) continue
      const merged = [...namedAccounts[net]]
      for (const id of found) {
        if (!merged.includes(id)) merged.push(id)
      }
      await chrome.storage.local.set({ [ACCOUNTS_KEYS[net]]: merged })
      setNamedAccounts((prev) => ({ ...prev, [net]: merged }))
      if (activeAccount[net] === null) {
        await chrome.storage.local.set({ [ACTIVE_KEYS[net]]: found[0] })
        setActiveAccount((prev) => (prev[net] === null ? { ...prev, [net]: found[0] } : prev))
      }
    }
  }

  async function setPassword(seed: string, password: string) {
    const encrypted = await encryptSeedPhrase(seed, password)
    await chrome.storage.local.set({ [ENCRYPTED_SEED_KEY]: encrypted })
    setNamedAccounts({ testnet: [], mainnet: [] })
    setActiveAccount({ testnet: null, mainnet: null })
    setEncryptedSeed(encrypted)
    setSeedPhrase(seed)
    await chrome.storage.session.set({
      [UNLOCKED_SEED_KEY]: seed,
      [LAST_ACTIVE_KEY]: Date.now(),
    })
    void discoverAndAddAccounts(seed)
  }

  async function unlock(password: string): Promise<boolean> {
    if (!encryptedSeed) return false
    try {
      const seed = await decryptSeedPhrase(encryptedSeed, password)
      await chrome.storage.session.set({
        [UNLOCKED_SEED_KEY]: seed,
        [LAST_ACTIVE_KEY]: Date.now(),
      })
      setSeedPhrase(seed)
      void discoverAndAddAccounts(seed)
      return true
    } catch {
      return false
    }
  }

  function lock() {
    chrome.storage.session.remove([UNLOCKED_SEED_KEY, LAST_ACTIVE_KEY])
    setSeedPhrase(null)
  }

  async function signOut() {
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
  }

  function setNetwork(net: Network) {
    chrome.storage.local.set({ [NETWORK_KEY]: net })
    setNetworkState(net)
  }

  function switchAccount(net: Network, id: string | null) {
    setActiveAccount((prev) => ({ ...prev, [net]: id }))
    if (id === null) {
      chrome.storage.local.remove([ACTIVE_KEYS[net]])
    } else {
      chrome.storage.local.set({ [ACTIVE_KEYS[net]]: id })
    }
  }

  async function createNamed(net: Network, accountId: string) {
    await addAccount(net, accountId)
  }

  // Claims free test tokens by creating a funded `.testnet` account via the
  // faucet, then adds it to the wallet. Returns the new account id.
  async function claimTokens(name: string): Promise<string> {
    if (!seedPhrase) throw new Error('Wallet is locked.')
    const accountId = await createFaucetAccount(seedPhrase, name)
    await addAccount('testnet', accountId)
    return accountId
  }

  function openSidePanel() {
    chrome.windows
      .getCurrent()
      .then((win) => {
        if (typeof win.id === 'number') chrome.sidePanel.open({ windowId: win.id })
      })
      .catch(() => {})
  }

  const implicitAddress = seedPhrase ? getImplicitAddress(seedPhrase) : null
  const activeAccountId = activeAccount[network] ?? implicitAddress

  return {
    loading,
    encryptedSeed,
    seedPhrase,
    network,
    namedAccounts,
    activeAccount,
    implicitAddress,
    activeAccountId,
    setPassword,
    unlock,
    lock,
    signOut,
    setNetwork,
    switchAccount,
    createNamed,
    claimTokens,
    openSidePanel,
  }
}
