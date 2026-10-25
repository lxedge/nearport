import { useState } from 'react'
import Welcome from './screens/Welcome'
import CreateWallet from './screens/CreateWallet'
import ImportWallet from './screens/ImportWallet'
import SetPassword from './screens/SetPassword'
import Unlock from './screens/Unlock'
import Home from './screens/Home'
import Receive from './screens/Receive'
import Send from './screens/Send'
import History from './screens/History'
import CreateNamedAccount from './screens/CreateNamedAccount'
import ChainSignatures from './screens/ChainSignatures'
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
  | 'history'
  | 'createNamed'
  | 'chainsig'
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
    lock,
    signOut,
    setNetwork,
    switchAccount,
    createNamed,
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

  if (screen === 'receive') {
    return <Receive accountId={activeAccountId!} onBack={() => setScreen('home')} />
  }

  if (screen === 'createNamed') {
    return (
      <CreateNamedAccount
        network={network}
        seedPhrase={seedPhrase}
        funderAccountId={activeAccountId!}
        onComplete={async (id) => {
          await createNamed(network, id)
          setScreen('home')
        }}
        onBack={() => setScreen('home')}
      />
    )
  }

  if (screen === 'chainsig') {
    return (
      <ChainSignatures
        accountId={activeAccountId!}
        seedPhrase={seedPhrase}
        network={network}
        onBack={() => setScreen('settings')}
      />
    )
  }

  if (screen === 'export') {
    return <ExportWallet seedPhrase={seedPhrase} onBack={() => setScreen('settings')} />
  }

  if (screen === 'settings') {
    return (
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
      />
    )
  }

  if (screen === 'send') {
    return (
      <Send
        accountId={activeAccountId!}
        seedPhrase={seedPhrase}
        network={network}
        onBack={() => setScreen('home')}
      />
    )
  }

  // Home and History are the two main tabs, shown with a bottom tab bar.
  return (
    <div className="tabs">
      <div className="tab-content">
        {screen === 'history' ? (
          <History accountId={activeAccountId!} network={network} />
        ) : (
          <Home
            network={network}
            accounts={[implicitAddress!, ...namedAccounts[network]]}
            activeAccountId={activeAccountId!}
            onOpenSettings={() => setScreen('settings')}
            onOpenSidePanel={openSidePanel}
            onOpenReceive={() => setScreen('receive')}
            onOpenSend={() => setScreen('send')}
            onCreateNamed={() => setScreen('createNamed')}
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
