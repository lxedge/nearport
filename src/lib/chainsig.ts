import { Account, JsonRpcProvider, baseDecode, baseEncode } from 'near-api-js'
import { parseSeedPhrase } from 'near-api-js/seed-phrase'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { NETWORKS, type Network } from './constants'
import { recordTransaction } from './history'

// NEAR chain signatures: a NEAR account can control accounts on other chains
// (Ethereum, Bitcoin, Solana, Sui, TON, …) by requesting signatures from the MPC
// network. See https://docs.near.org/chain-abstraction/chain-signatures

const MPC_CONTRACTS: Record<Network, string> = {
  mainnet: 'v1.signer',
  testnet: 'v1.signer-prod.testnet',
}

const SIGN_GAS = 300_000_000_000_000n // 300 TGas
const SIGN_DEPOSIT = 1n // 1 yoctoNEAR (the contract's minimum)

export type Chain = 'ethereum' | 'bitcoin' | 'solana' | 'sui' | 'ton'
export type SignatureScheme = 'secp256k1' | 'ed25519'

// Chains signed with Ed25519 (domain 1); the rest use Secp256k1 (domain 0).
const ED25519_CHAINS: Chain[] = ['solana', 'sui', 'ton']

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
export async function getDerivedAddress(
  accountId: string,
  path: string,
  network: Network,
  chain: Chain,
): Promise<string> {
  const domain = ED25519_CHAINS.includes(chain) ? 1 : 0
  const raw = await derivePublicKey(accountId, path, network, domain)
  switch (chain) {
    case 'ethereum':
      return secp256k1ToEvmAddress(raw)
    case 'bitcoin':
      return secp256k1ToBtcAddress(raw)
    case 'solana':
      return bytesToBase58(raw)
    case 'sui':
      return ed25519ToSuiAddress(raw)
    case 'ton':
      return ed25519ToTonAddress(raw)
  }
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
  const keyPair = parseSeedPhrase(seedPhrase)
  const account = new Account(accountId, NETWORKS[network].rpcUrl, keyPair.toString())

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
    counterparty: path,
    amountNear: null,
    direction: 'out',
    success: true,
  })
  return signature
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
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
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

function bytesToBase58(bytes: Uint8Array): string {
  return baseEncode(bytes)
}

function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4)
  const full = new Uint8Array(payload.length + 4)
  full.set(payload, 0)
  full.set(checksum, payload.length)
  return bytesToBase58(full)
}

function secp256k1ToEvmAddress(raw: Uint8Array): string {
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 4
  uncompressed.set(raw, 1)
  return '0x' + bytesToHex(keccak_256(uncompressed).slice(-20))
}

function secp256k1ToBtcAddress(raw: Uint8Array): string {
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 4
  uncompressed.set(raw, 1)
  const hash = ripemd160(sha256(uncompressed))
  const payload = new Uint8Array(21)
  payload[0] = 0 // mainnet P2PKH version byte
  payload.set(hash, 1)
  return base58CheckEncode(payload)
}

function ed25519ToSuiAddress(raw: Uint8Array): string {
  const data = new Uint8Array(raw.length + 1)
  data[0] = 0 // ed25519 signature-scheme flag byte
  data.set(raw, 1)
  return '0x' + bytesToHex(blake2b(data, { dkLen: 32 }))
}

function ed25519ToTonAddress(raw: Uint8Array): string {
  // Raw TON address form: basechain (workchain 0) with the key as the account id.
  return '0:' + bytesToHex(raw)
}
