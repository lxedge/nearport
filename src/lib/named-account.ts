import { Account } from 'near-api-js'
import { parseSeedPhrase } from 'near-api-js/seed-phrase'
import { NETWORKS, TESTNET_FAUCET_URL, type Network } from './constants'
import { formatNear, parseNear } from './format'
import { listAccessKeys } from './rpc'
import { getBalance } from './balance'
import { recordTransaction } from './history'

// Creates a named account (`.testnet` or `.near`) by calling the top-level
// account's `create_account` method (`testnet` on testnet, `near` on mainnet)
// from `funderAccountId` (a funded account the wallet controls). Transfers
// `depositNear` to the new account, which is controlled by the same key as the
// funder. Returns the new account id. Throws if the name is taken or fails.
export async function createNamedAccount(
  seedPhrase: string,
  funderAccountId: string,
  name: string,
  depositNear: string,
  network: Network,
): Promise<string> {
  const accountId = network === 'mainnet' ? `${name}.near` : `${name}.testnet`
  const keyPair = parseSeedPhrase(seedPhrase)
  const publicKey = keyPair.getPublicKey().toString()

  // Fail fast with a clear message when the name is already registered.
  if ((await listAccessKeys(accountId, network)).length > 0) {
    throw new Error('That account name is already taken.')
  }

  // The funder must exist on-chain and hold enough NEAR to fund the new account.
  const funderBalance = await getBalance(funderAccountId, network)
  if (parseNear(funderBalance) < parseNear(depositNear)) {
    throw new Error(
      network === 'testnet'
        ? 'Your account has no NEAR to fund a new account. Claim test tokens first (Settings → Test tokens).'
        : 'Your account has no NEAR to fund a new account. Add NEAR to it first.',
    )
  }

  const account = new Account(funderAccountId, NETWORKS[network].rpcUrl, keyPair.toString())
  await account.callFunction({
    contractId: network === 'mainnet' ? 'near' : 'testnet',
    methodName: 'create_account',
    args: { new_account_id: accountId, new_public_key: publicKey },
    deposit: parseNear(depositNear),
  })

  // `create_account` can report a failed creation via its callback; confirm the
  // account now holds our key before reporting success.
  const keys = await listAccessKeys(accountId, network)
  if (!keys.includes(publicKey)) {
    throw new Error('Account creation failed; the name may have just been taken.')
  }
  await recordTransaction(funderAccountId, network, {
    type: 'Create account',
    counterparty: accountId,
    amountNear: formatNear(parseNear(depositNear)),
    direction: 'out',
    success: true,
  })
  return accountId
}

// Creates a named `.testnet` account via the NEAR testnet faucet, which funds it
// with free test NEAR. Returns the new account id. Throws if the name is taken
// or the faucet fails.
export async function createFaucetAccount(seedPhrase: string, name: string): Promise<string> {
  const accountId = `${name}.testnet`
  const publicKey = parseSeedPhrase(seedPhrase).getPublicKey().toString()

  if ((await listAccessKeys(accountId, 'testnet')).length > 0) {
    throw new Error('That account name is already taken.')
  }

  const res = await fetch(TESTNET_FAUCET_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
  })
  if (!res.ok) {
    const body = (await res.text()).trim()
    throw new Error(`Faucet request failed (${res.status})${body ? `: ${body.slice(0, 160)}` : ''}`)
  }

  // The faucet returns 200 even when its on-chain CreateAccount action failed
  // (e.g. a name taken between our check and its transaction); verify our key.
  const keys = await listAccessKeys(accountId, 'testnet')
  if (!keys.includes(publicKey)) {
    throw new Error('Account creation failed; the name may have just been taken.')
  }
  await recordTransaction(accountId, 'testnet', {
    type: 'Claim test tokens',
    counterparty: 'faucet',
    amountNear: null,
    direction: 'in',
    success: true,
  })
  return accountId
}
