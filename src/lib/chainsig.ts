import { baseDecode } from 'near-api-js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { rawToAddress } from './addresses'
import { signerAccount } from './account'
import { getNearProvider } from './provider'
import type { Network } from './constants'
import { recordTransaction } from './history'

// NEAR chain signatures: a NEAR account can control accounts on other chains
// (Ethereum, Bitcoin, Zcash, Solana, Sui, TON, …) by requesting signatures from the MPC
// network. See https://docs.near.org/chain-abstraction/chain-signatures

const MPC_CONTRACTS: Record<Network, string> = {
  mainnet: 'v1.signer',
  testnet: 'v1.signer-prod.testnet',
}

const SIGN_GAS = 300_000_000_000_000n // 300 TGas
const SIGN_DEPOSIT = 1n // 1 yoctoNEAR (the contract's minimum)

export type Chain =
  | 'ethereum'
  | 'bitcoin'
  | 'bitcoincash'
  | 'litecoin'
  | 'dogecoin'
  | 'dash'
  | 'zcash'
  | 'tron'
  | 'solana'
  | 'sui'
  | 'aptos'
  | 'stellar'
  | 'ton'
export type SignatureScheme = 'secp256k1' | 'ed25519'

// Signature scheme per chain: secp256k1 (MPC domain 0) for EVM / Bitcoin-family /
// Tron, ed25519 (domain 1) for Solana / Sui / Aptos / Stellar / TON.
export const CHAIN_SCHEMES: Record<Chain, SignatureScheme> = {
  ethereum: 'secp256k1',
  bitcoin: 'secp256k1',
  bitcoincash: 'secp256k1',
  litecoin: 'secp256k1',
  dogecoin: 'secp256k1',
  dash: 'secp256k1',
  zcash: 'secp256k1',
  tron: 'secp256k1',
  solana: 'ed25519',
  sui: 'ed25519',
  aptos: 'ed25519',
  stellar: 'ed25519',
  ton: 'ed25519',
}

// Display order and labels for the chains the wallet derives addresses for.
export const CHAIN_ORDER: Chain[] = [
  'ethereum',
  'bitcoin',
  'bitcoincash',
  'litecoin',
  'dogecoin',
  'dash',
  'zcash',
  'tron',
  'solana',
  'sui',
  'aptos',
  'stellar',
  'ton',
]

export const CHAIN_LABELS: Record<Chain, string> = {
  ethereum: 'Ethereum',
  bitcoin: 'Bitcoin',
  bitcoincash: 'Bitcoin Cash',
  litecoin: 'Litecoin',
  dogecoin: 'Dogecoin',
  dash: 'Dash',
  zcash: 'Zcash',
  tron: 'Tron',
  solana: 'Solana',
  sui: 'Sui',
  aptos: 'Aptos',
  stellar: 'Stellar',
  ton: 'TON',
}

// A per-chain derivation path. NEAR chain-signature paths are arbitrary strings
// (e.g. "ethereum-1"); each chain defaults to its own so accounts stay distinct.
export type ChainPaths = Record<Chain, string>

export const DEFAULT_CHAIN_PATHS: ChainPaths = {
  ethereum: 'ethereum-1',
  bitcoin: 'bitcoin-1',
  bitcoincash: 'bitcoincash-1',
  litecoin: 'litecoin-1',
  dogecoin: 'dogecoin-1',
  dash: 'dash-1',
  zcash: 'zcash-1',
  tron: 'tron-1',
  solana: 'solana-1',
  sui: 'sui-1',
  aptos: 'aptos-1',
  stellar: 'stellar-1',
  ton: 'ton-1',
}

// 1Click destination blockchains that map to the shared Ethereum-derived address
// (all EVM chains share one secp256k1-derived 0x address).
const EVM_BLOCKCHAINS: Record<string, true> = {
  eth: true, base: true, arb: true, bsc: true, pol: true, op: true, scroll: true,
  avax: true, gnosis: true, monad: true, xlayer: true, plasma: true, bera: true,
  fogo: true, hood: true, abs: true, adi: true, hypercore: true,
}

// 1Click destination blockchains mapped to a wallet-derivable chainsig chain.
const BLOCKCHAIN_CHAIN: Record<string, Chain> = {
  sol: 'solana',
  ton: 'ton',
  btc: 'bitcoin',
  bch: 'bitcoincash',
  ltc: 'litecoin',
  doge: 'dogecoin',
  dash: 'dash',
  zec: 'zcash',
  sui: 'sui',
  aptos: 'aptos',
  stellar: 'stellar',
  tron: 'tron',
}

// A 1Click destination blockchain is usable only when the wallet can derive the
// user's receiving address for it: the NEAR account itself, an EVM chain, or a
// chain with a known chainsig derivation. Anything else (unsupported MPC curve
// such as Aleo/Cardano/Starknet, post-quantum chains like QTC/PRL, or chains
// whose address scheme is not yet verified like XRP/Movement) is excluded so a
// user can never send into an address the wallet does not control.
export function isDerivableBlockchain(blockchain: string): boolean {
  return blockchain === 'near' || EVM_BLOCKCHAINS[blockchain] === true || BLOCKCHAIN_CHAIN[blockchain] !== undefined
}

// The chainsig chain whose derived address receives funds on a 1Click
// destination blockchain, or null for the NEAR account itself.
export function blockchainDerivationChain(blockchain: string): Chain | null {
  if (EVM_BLOCKCHAINS[blockchain] === true) return 'ethereum'
  return BLOCKCHAIN_CHAIN[blockchain] ?? null
}

export type ChainSignature =
  | { scheme: 'secp256k1'; r: string; s: string; recoveryId: number }
  | { scheme: 'ed25519'; signature: string } // 64-byte hex

interface Secp256k1SignResponse {
  scheme: 'Secp256k1'
  big_r: { affine_point: string }
  s: { scalar: string }
  recovery_id: number
}

interface Ed25519SignResponse {
  scheme: 'Ed25519'
  signature: number[]
}

// Derives the foreign address controlled by `accountId` + `path` on a chain.
// Deterministic given (accountId, path, chain, network); the derived public key
// is cached (see getDerivedPublicKey), and the address is encoded from it.
export async function getDerivedAddress(
  accountId: string,
  path: string,
  network: Network,
  chain: Chain,
): Promise<string> {
  const raw = await getDerivedPublicKey(accountId, path, network, chain)
  return rawToAddress(chain, raw)
}

// Signs an arbitrary message: hashed with keccak256 for secp256k1 (EVM/Bitcoin),
// or signed raw for ed25519 (Solana/TON/Sui).
export async function signMessage(
  seedPhrase: string,
  accountId: string,
  message: string,
  path: string,
  network: Network,
  scheme: SignatureScheme,
): Promise<ChainSignature> {
  const bytes = new TextEncoder().encode(message)
  const payload = scheme === 'secp256k1' ? keccak_256(bytes) : bytes
  return signPayload(seedPhrase, accountId, payload, path, network, scheme)
}

// Requests a signature over `payload` from the MPC contract for the given scheme.
export async function signPayload(
  seedPhrase: string,
  accountId: string,
  payload: Uint8Array,
  path: string,
  network: Network,
  scheme: SignatureScheme,
): Promise<ChainSignature> {
  const account = signerAccount(seedPhrase, accountId, network)

  let signature: ChainSignature
  if (scheme === 'secp256k1') {
    const result = await account.callFunction<Secp256k1SignResponse>({
      contractId: MPC_CONTRACTS[network],
      methodName: 'sign',
      args: { request: { payload: Array.from(payload), path, key_version: 0 } },
      deposit: SIGN_DEPOSIT,
      gas: SIGN_GAS,
    })
    signature = {
      scheme: 'secp256k1',
      r: result.big_r.affine_point.slice(2), // drop the 02/03 parity prefix byte
      s: result.s.scalar,
      recoveryId: result.recovery_id,
    }
  } else {
    const result = await account.callFunction<Ed25519SignResponse>({
      contractId: MPC_CONTRACTS[network],
      methodName: 'sign',
      args: { request: { payload_v2: { Eddsa: bytesToHex(payload) }, path, domain_id: 1 } },
      deposit: SIGN_DEPOSIT,
      gas: SIGN_GAS,
    })
    signature = { scheme: 'ed25519', signature: bytesToHex(Uint8Array.from(result.signature)) }
  }

  await recordTransaction(accountId, network, {
    type: 'Chain signature',
    from: accountId,
    to: path,
    amountNear: null,
    direction: 'out',
    success: true,
  })
  return signature
}

// Returns the raw derived public key bytes for a chain: 64 bytes (X||Y) for
// secp256k1 (domain 0) or 32 bytes for ed25519 (domain 1). Cached like the
// address derivation, since it is deterministic for (accountId, path, network).
export async function getDerivedPublicKey(
  accountId: string,
  path: string,
  network: Network,
  chain: Chain,
): Promise<Uint8Array> {
  const storageKey = `derivedPubKey:${network}:${accountId}:${path}:${chain}`
  const cached = (await chrome.storage.local.get(storageKey))[storageKey]
  if (typeof cached === 'string') return Uint8Array.from(Buffer.from(cached, 'base64'))
  const domain = CHAIN_SCHEMES[chain] === 'ed25519' ? 1 : 0
  const raw = await derivePublicKey(accountId, path, network, domain)
  await chrome.storage.local.set({
    [storageKey]: Buffer.from(raw).toString('base64'),
  })
  return raw
}

// --- internal helpers ---

// Returns the raw derived public key bytes for a domain: 64 bytes (X||Y) for
// secp256k1 (domain 0) or 32 bytes for ed25519 (domain 1).
async function derivePublicKey(
  accountId: string,
  path: string,
  network: Network,
  domain: number,
): Promise<Uint8Array> {
  const provider = getNearProvider(network)
  const result = await provider.query<{ result: number[] }>({
    request_type: 'call_function',
    account_id: MPC_CONTRACTS[network],
    method_name: 'derived_public_key',
    args_base64: btoa(JSON.stringify({ path, predecessor: accountId, domain_id: domain })),
    finality: 'final',
  })
  const json = new TextDecoder().decode(Uint8Array.from(result.result))
  const publicKey = JSON.parse(json) as string // "secp256k1:<base58>" | "ed25519:<base58>"
  return baseDecode(publicKey.split(':')[1])
}
