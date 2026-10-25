import { generateSeedPhrase, parseSeedPhrase } from 'near-api-js/seed-phrase'
import { Account, keyToImplicitAddress, JsonRpcProvider, nearToYocto, yoctoToNear } from 'near-api-js'

export type Network = 'mainnet' | 'testnet'

export const NETWORKS: Record<Network, { label: string; rpcUrl: string }> = {
  mainnet: { label: 'Mainnet', rpcUrl: 'https://rpc.mainnet.near.org' },
  testnet: { label: 'Testnet', rpcUrl: 'https://rpc.testnet.near.org' },
}

export interface CreatedAccount {
  seedPhrase: string
  accountId: string
}

// Creates a fresh NEAR account: a 12-word mnemonic plus the implicit account id
// derived from its public key (64 hex chars). Implicit accounts need no on-chain
// registration to receive funds; named accounts (e.g. foo.testnet) come later.
export function createAccount(): CreatedAccount {
  const { seedPhrase, keyPair } = generateSeedPhrase()
  const accountId = keyToImplicitAddress(keyPair.getPublicKey())
  return { seedPhrase, accountId }
}

// The implicit account id (64 hex chars) derived from a seed phrase's public key.
// Every key has an implicit address, independent of any named account it controls.
export function getImplicitAddress(seedPhrase: string): string {
  return keyToImplicitAddress(parseSeedPhrase(seedPhrase).getPublicKey())
}

const TESTNET_FAUCET_URL = 'https://helper.nearprotocol.com/account'

// Creates a named `.testnet` account via the NEAR testnet faucet, registering the
// seed phrase's public key as a full-access key and funding it with test NEAR.
// Returns the new account id. Throws if the name is taken or the faucet fails.
export async function createTestnetNamedAccount(seedPhrase: string, name: string): Promise<string> {
  const accountId = `${name}.testnet`
  const keyPair = parseSeedPhrase(seedPhrase)
  const publicKey = keyPair.getPublicKey().toString()

  // Fail fast with a clear message when the name is already registered.
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
  // (e.g. the name was taken between our check and the faucet's transaction).
  // Confirm our key was actually registered before reporting success.
  const keys = await listAccessKeys(accountId, 'testnet')
  if (!keys.includes(publicKey)) {
    throw new Error('Account creation failed; the name may have just been taken.')
  }
  return accountId
}

// Creates a named `.near` account on mainnet by calling the `near` top-level
// account's `create_account` method from `funderAccountId` (the wallet's funded
// mainnet account). Transfers `depositNear` to the new account, which is
// controlled by the same key as the funder. Returns the new account id.
export async function createMainnetNamedAccount(
  seedPhrase: string,
  funderAccountId: string,
  name: string,
  depositNear: string,
): Promise<string> {
  const accountId = `${name}.near`
  const keyPair = parseSeedPhrase(seedPhrase)
  const publicKey = keyPair.getPublicKey().toString()

  if ((await listAccessKeys(accountId, 'mainnet')).length > 0) {
    throw new Error('That account name is already taken.')
  }

  const account = new Account(funderAccountId, NETWORKS.mainnet.rpcUrl, keyPair.toString())
  await account.callFunction({
    contractId: 'near',
    methodName: 'create_account',
    args: { new_account_id: accountId, new_public_key: publicKey },
    deposit: nearToYocto(depositNear as `${number}`),
  })

  // `create_account` can report a failed creation via its callback; confirm the
  // account now holds our key before reporting success.
  const keys = await listAccessKeys(accountId, 'mainnet')
  if (!keys.includes(publicKey)) {
    throw new Error('Account creation failed; the name may have just been taken.')
  }
  return accountId
}

// Returns the public keys registered on an account, or [] if it doesn't exist.
// Used to detect taken names and to verify a freshly created account.
async function listAccessKeys(accountId: string, network: Network): Promise<string[]> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  try {
    const result = await provider.query<{ keys: Array<{ public_key: string }> }>({
      request_type: 'view_access_key_list',
      account_id: accountId,
      finality: 'optimistic',
    })
    return result.keys.map((k) => k.public_key)
  } catch (err) {
    if (isUnknownAccount(err)) return []
    throw err
  }
}

// Queries the account balance (in NEAR) from the given network's RPC node.
// Returns "0" for an account that hasn't been funded yet (doesn't exist on chain).
export async function getBalance(accountId: string, network: Network): Promise<string> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  try {
    const result = await provider.query<{ amount: string }>({
      request_type: 'view_account',
      account_id: accountId,
      finality: 'final',
    })
    return yoctoToNear(BigInt(result.amount))
  } catch (err) {
    if (isUnknownAccount(err)) return '0'
    throw err
  }
}

function isUnknownAccount(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /does not exist|UNKNOWN_ACCOUNT/i.test(msg)
}

// Sends NEAR from the wallet's account to `receiverId`, signing the transaction
// with the key derived from the stored seed phrase. Returns the transaction hash.
// `amountNear` must already be a valid, positive decimal NEAR amount (the caller
// validates it); nearToYocto converts it and throws on malformed input.
export async function sendNear(
  seedPhrase: string,
  accountId: string,
  receiverId: string,
  amountNear: string,
  network: Network,
): Promise<string> {
  const keyPair = parseSeedPhrase(seedPhrase)
  const account = new Account(accountId, NETWORKS[network].rpcUrl, keyPair.toString())
  const result = await account.transfer({ receiverId, amount: nearToYocto(amountNear as `${number}`) })
  return result.transaction_outcome.id
}
