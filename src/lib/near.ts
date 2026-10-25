import { generateSeedPhrase, parseSeedPhrase } from 'near-api-js/seed-phrase'
import { Account, keyToImplicitAddress, JsonRpcProvider, nearToYocto, yoctoToNear } from 'near-api-js'

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
