import { generateSeedPhrase, parseSeedPhrase } from 'near-api-js/seed-phrase'
import { keyToImplicitAddress } from 'near-api-js'
import { NEARBLOCKS_API, type Network } from './constants'
import { normalizeSeedPhrase } from './format'
import { isValidMnemonic } from './mnemonic'

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

// The secret key string (e.g. "ed25519:...") derived from a seed phrase.
export function getSecretKey(seedPhrase: string): string {
  return parseSeedPhrase(seedPhrase).toString()
}

// Restores a wallet from an existing 12-word seed phrase. Returns the implicit
// account its key controls. Throws if the phrase is not a valid mnemonic.
export function importAccount(seedPhrase: string): CreatedAccount {
  const normalized = normalizeSeedPhrase(seedPhrase)
  if (!isValidMnemonic(normalized)) {
    throw new Error('Invalid seed phrase')
  }
  const keyPair = parseSeedPhrase(normalized)
  return { seedPhrase: normalized, accountId: keyToImplicitAddress(keyPair.getPublicKey()) }
}

// Finds the named accounts controlled by a seed phrase's public key by querying
// the NearBlocks indexer. Excludes the implicit address and returns [] when the
// indexer is unavailable (e.g. NearBlocks stopped indexing testnet).
export async function discoverNamedAccounts(
  seedPhrase: string,
  network: Network,
): Promise<string[]> {
  const keyPair = parseSeedPhrase(seedPhrase)
  const publicKey = keyPair.getPublicKey().toString()
  const implicit = keyToImplicitAddress(keyPair.getPublicKey())
  const res = await fetch(`${NEARBLOCKS_API[network]}/v1/keys/${publicKey}`)
  if (!res.ok) return []
  const data = (await res.json()) as { keys: Array<{ account_id: string; permission_kind?: string }> }
  return data.keys
    .filter((k) => k.account_id !== implicit && k.permission_kind === 'FULL_ACCESS')
    .map((k) => k.account_id)
}
