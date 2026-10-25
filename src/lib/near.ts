import { generateSeedPhrase, parseSeedPhrase } from 'near-api-js/seed-phrase'
import { Account, keyToImplicitAddress, JsonRpcProvider, nearToYocto, yoctoToNear } from 'near-api-js'
import { sha256 } from '@noble/hashes/sha2.js'
import englishWordlist from 'bip39-light/wordlists/english.json'

export type Network = 'mainnet' | 'testnet'

export const NETWORKS: Record<Network, { label: string; rpcUrl: string }> = {
  mainnet: { label: 'Mainnet', rpcUrl: 'https://rpc.mainnet.near.org' },
  testnet: { label: 'Testnet', rpcUrl: 'https://rpc.testnet.near.org' },
}

// Balances are displayed with at most this many decimal places.
const BALANCE_DECIMALS = 6

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

// Restores a wallet from an existing 12-word seed phrase. Returns the implicit
// account its key controls. Throws if the phrase is not a valid mnemonic.
export function importAccount(seedPhrase: string): CreatedAccount {
  const normalized = seedPhrase.trim().toLowerCase().split(/\s+/).join(' ')
  if (!isValidMnemonic(normalized)) {
    throw new Error('Invalid seed phrase')
  }
  const keyPair = parseSeedPhrase(normalized)
  return { seedPhrase: normalized, accountId: keyToImplicitAddress(keyPair.getPublicKey()) }
}

// Checks that a 12-word phrase is a valid BIP39 mnemonic: every word is in the
// English wordlist and the embedded checksum matches. `parseSeedPhrase` does not
// validate the checksum, so this guards against typos deriving a wrong key.
function isValidMnemonic(mnemonic: string): boolean {
  const words = mnemonic.split(' ')
  if (words.length !== 12) return false
  const indices: number[] = []
  for (const word of words) {
    const index = englishWordlist.indexOf(word)
    if (index === -1) return false
    indices.push(index)
  }
  // 12 words -> 132 bits: 128-bit entropy + 4-bit checksum.
  let bits = ''
  for (const i of indices) bits += i.toString(2).padStart(11, '0')
  const entropyBytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    entropyBytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }
  const hashBits = Array.from(sha256(entropyBytes))
    .map((b) => b.toString(2).padStart(8, '0'))
    .join('')
  return hashBits.slice(0, 4) === bits.slice(128)
}

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
  if (nearToYocto(funderBalance as `${number}`) < nearToYocto(depositNear as `${number}`)) {
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
    deposit: nearToYocto(depositNear as `${number}`),
  })

  // `create_account` can report a failed creation via its callback; confirm the
  // account now holds our key before reporting success.
  const keys = await listAccessKeys(accountId, network)
  if (!keys.includes(publicKey)) {
    throw new Error('Account creation failed; the name may have just been taken.')
  }
  return accountId
}

const TESTNET_FAUCET_URL = 'https://helper.nearprotocol.com/account'

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
    return yoctoToNear(BigInt(result.amount), BALANCE_DECIMALS)
  } catch (err) {
    if (isUnknownAccount(err)) return '0'
    throw err
  }
}

function isUnknownAccount(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /does not exist|UNKNOWN_ACCOUNT/i.test(msg)
}

export interface AccountBalances {
  accounts: Array<{ accountId: string; balance: string }>
  total: string
}

// Fetches the balance (in NEAR) of every account and their sum. Accounts that
// have never been funded (don't exist on chain) count as "0".
export async function getAccountBalances(
  accountIds: string[],
  network: Network,
): Promise<AccountBalances> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  const rows = await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        const result = await provider.query<{ amount: string }>({
          request_type: 'view_account',
          account_id: accountId,
          finality: 'final',
        })
        return { accountId, yocto: BigInt(result.amount) }
      } catch (err) {
        if (isUnknownAccount(err)) return { accountId, yocto: 0n }
        throw err
      }
    }),
  )
  const total = rows.reduce((sum, row) => sum + row.yocto, 0n)
  return {
    accounts: rows.map((row) => ({
      accountId: row.accountId,
      balance: yoctoToNear(row.yocto, BALANCE_DECIMALS),
    })),
    total: yoctoToNear(total, BALANCE_DECIMALS),
  }
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
