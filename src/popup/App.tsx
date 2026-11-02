import { useState } from 'react'
import AccountHeader from './AccountHeader'
import Welcome from './screens/Welcome'
import CreateWallet from './screens/CreateWallet'
import ImportWallet from './screens/ImportWallet'
import SetPassword from './screens/SetPassword'
import Unlock from './screens/Unlock'
import Home from './screens/Home'
import Receive from './screens/Receive'
import Send from './screens/Send'
import Swap from './screens/Swap'
import History from './screens/History'
import ChainSignatures from './screens/ChainSignatures'
import DerivationPaths from './screens/DerivationPaths'
import ExportWallet from './screens/ExportWallet'
import Settings from './screens/Settings'
import { useWallet } from './useWallet'
import type { CreatedAccount } from '../lib/account'

type Screen =
  | 'welcome'
  | 'create'
  | 'import'
  | 'setPassword'
  | 'unlock'
  | 'home'
  | 'receive'
  | 'send'
  | 'swap'
  | 'history'
  | 'chainsig'
  | 'derivationPaths'
  | 'export'
  | 'settings'

export default function App() {
  const wallet = useWallet()
  const [screen, setScreen] = useState<Screen>('welcome')
  const [pendingAccount, setPendingAccount] = useState<CreatedAccount | null>(null)
  const [pendingSource, setPendingSource] = useState<'create' | 'import'>('create')

  function handleAccountReady(account: CreatedAccount, source: 'create' | 'import') {
    setPendingAccount(account)
    setPendingSource(source)
    setScreen('setPassword')
  }

  async function handlePasswordSet(password: string) {
    if (!pendingAccount) return
    await wallet.setPassword(pendingAccount.seedPhrase, password)
    setPendingAccount(null)
    setScreen('home')
  }

  async function handleUnlock(password: string): Promise<boolean> {
    const ok = await wallet.unlock(password)
    if (ok) setScreen('home')
    return ok
  }

  const {
    loading,
    encryptedSeed,
    seedPhrase,
    network,
    namedAccounts,
    activeAccount,
    implicitAddress,
    activeAccountId,
    chainPaths,
    lock,
    signOut,
    setNetwork,
    setChainPath,
    switchAccount,
    claimTokens,
    openSidePanel,
  } = wallet

  if (loading) return null

  if (encryptedSeed === null) {
    if (screen === 'create') {
      return (
        <CreateWallet
          onComplete={(a) => handleAccountReady(a, 'create')}
          onBack={() => setScreen('welcome')}
          onOpenSidePanel={openSidePanel}
        />
      )
    }
    if (screen === 'import') {
      return (
        <ImportWallet
          onComplete={(a) => handleAccountReady(a, 'import')}
          onBack={() => setScreen('welcome')}
          onOpenSidePanel={openSidePanel}
        />
      )
    }
    if (screen === 'setPassword' && pendingAccount) {
      return (
        <SetPassword
          onSubmit={handlePasswordSet}
          onBack={() => {
            setPendingAccount(null)
            setScreen(pendingSource)
          }}
          onOpenSidePanel={openSidePanel}
        />
      )
    }
    return (
      <Welcome
        onCreate={() => setScreen('create')}
        onImport={() => setScreen('import')}
        onOpenSidePanel={openSidePanel}
      />
    )
  }

  if (seedPhrase === null) {
    return <Unlock onSubmit={handleUnlock} />
  }

  // All unlocked screens share the global account header, which stays pinned
  // across navigation. Build the screen body first, then wrap it once.
  const accounts = [implicitAddress!, ...namedAccounts[network]]
  const header = (
    <AccountHeader
      network={network}
      accounts={accounts}
      activeAccountId={activeAccountId!}
      chainPaths={chainPaths}
      onOpenSettings={() => setScreen('settings')}
      onOpenSidePanel={openSidePanel}
    />
  )

  let body: JSX.Element
  if (screen === 'receive') {
    body = (
      <Receive
        accountId={activeAccountId!}
        network={network}
        chainPaths={chainPaths}
        onBack={() => setScreen('home')}
      />
    )
  } else if (screen === 'chainsig') {
    body = (
      <ChainSignatures
        accountId={activeAccountId!}
        seedPhrase={seedPhrase}
        network={network}
        chainPaths={chainPaths}
        onBack={() => setScreen('settings')}
      />
    )
  } else if (screen === 'derivationPaths') {
    body = (
      <DerivationPaths
        chainPaths={chainPaths}
        onSetChainPath={setChainPath}
        onBack={() => setScreen('settings')}
      />
    )
  } else if (screen === 'export') {
    body = <ExportWallet seedPhrase={seedPhrase} onBack={() => setScreen('settings')} />
  } else if (screen === 'settings') {
    body = (
      <Settings
        network={network}
        implicitAddress={implicitAddress!}
        accounts={namedAccounts[network]}
        activeAccount={activeAccount[network]}
        onSwitchAccount={(id) => switchAccount(network, id)}
        onNetworkChange={setNetwork}
        onBack={() => setScreen('home')}
        onLock={() => {
          lock()
          setScreen('unlock')
        }}
        onSignOut={async () => {
          await signOut()
          setScreen('welcome')
        }}
        onOpenChainSig={() => setScreen('chainsig')}
        onClaimTokens={claimTokens}
        onOpenExport={() => setScreen('export')}
        onOpenDerivationPaths={() => setScreen('derivationPaths')}
      />
    )
  } else if (screen === 'swap') {
    body = (
      <Swap
        accountId={activeAccountId!}
        seedPhrase={seedPhrase}
        network={network}
        chainPaths={chainPaths}
        onBack={() => setScreen('home')}
      />
    )
  } else if (screen === 'send') {
    body = (
      <Send
        accountId={activeAccountId!}
        seedPhrase={seedPhrase}
        network={network}
        chainPaths={chainPaths}
        onBack={() => setScreen('home')}
      />
    )
  } else {
    // Home and History are the two main tabs, shown with a bottom tab bar.
    body = (
      <div className="tabs">
        <div className="tab-content">
          {screen === 'history' ? (
            <History accountId={activeAccountId!} network={network} />
          ) : (
            <Home
              network={network}
              accounts={accounts}
              activeAccountId={activeAccountId!}
              onOpenReceive={() => setScreen('receive')}
              onOpenSend={() => setScreen('send')}
              onOpenSwap={() => setScreen('swap')}
              chainPaths={chainPaths}
            />
          )}
        </div>
        <nav className="tab-bar">
          <button
            type="button"
            className={screen !== 'history' ? 'tab active' : 'tab'}
            onClick={() => setScreen('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={screen === 'history' ? 'tab active' : 'tab'}
            onClick={() => setScreen('history')}
          >
            History
          </button>
        </nav>
      </div>
    )
  }

  return (
    <div className="app">
      {header}
      <div className="app-body">{body}</div>
    </div>
  )
}
