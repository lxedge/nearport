import { Account, JsonRpcProvider, baseDecode } from 'near-api-js'
import { parseSeedPhrase } from 'near-api-js/seed-phrase'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { NETWORKS, type Network } from './near'

// NEAR chain signatures: a NEAR account can control accounts on other chains
// (Ethereum, Bitcoin, Solana, …) by requesting signatures from the MPC network.
// See https://docs.near.org/chain-abstraction/chain-signatures

const MPC_CONTRACTS: Record<Network, string> = {
  mainnet: 'v1.signer',
  testnet: 'v1.signer-prod.testnet',
}

const SIGN_GAS = 300_000_000_000_000n // 300 TGas
const SIGN_DEPOSIT = 1n // 1 yoctoNEAR (the contract's minimum)

export interface ChainSignature {
  r: string // 32-byte hex
  s: string // 32-byte hex
  recoveryId: number // 0 or 1
}

interface SignResponse {
  scheme: 'Secp256k1' | 'Ed25519'
  big_r: { affine_point: string }
  s: { scalar: string }
  recovery_id: number
}

// Derives the EVM (Ethereum) address controlled by `accountId` + `path` via the
// MPC service. The same account + path always yields the same address; different
// paths yield different addresses.
export async function getDerivedEthereumAddress(
  accountId: string,
  path: string,
  network: Network,
): Promise<string> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  const result = await provider.query<{ result: number[] }>({
    request_type: 'call_function',
    account_id: MPC_CONTRACTS[network],
    method_name: 'derived_public_key',
    args_base64: btoa(JSON.stringify({ path, predecessor: accountId, domain_id: 0 })),
    finality: 'final',
  })
  const json = new TextDecoder().decode(Uint8Array.from(result.result))
  const publicKey = JSON.parse(json) as string // "secp256k1:<base58>"
  return secp256k1ToEvmAddress(publicKey)
}

// Signs an arbitrary message (keccak256-hashed, Ethereum convention) for the given
// derivation path, returning the secp256k1 signature components.
export async function signMessage(
  seedPhrase: string,
  accountId: string,
  message: string,
  path: string,
  network: Network,
): Promise<ChainSignature> {
  const payload = keccak_256(new TextEncoder().encode(message))
  return signPayload(seedPhrase, accountId, payload, path, network)
}

// Requests a secp256k1 signature over a 32-byte payload from the MPC contract.
async function signPayload(
  seedPhrase: string,
  accountId: string,
  payload: Uint8Array,
  path: string,
  network: Network,
): Promise<ChainSignature> {
  const keyPair = parseSeedPhrase(seedPhrase)
  const account = new Account(accountId, NETWORKS[network].rpcUrl, keyPair.toString())
  const result = await account.callFunction<SignResponse>({
    contractId: MPC_CONTRACTS[network],
    methodName: 'sign',
    args: {
      request: {
        payload: Array.from(payload),
        path,
        key_version: 0,
      },
    },
    deposit: SIGN_DEPOSIT,
    gas: SIGN_GAS,
  })
  return {
    r: result.big_r.affine_point.slice(2), // drop the 02/03 parity prefix byte
    s: result.s.scalar,
    recoveryId: result.recovery_id,
  }
}

// Converts a `secp256k1:<base58>` public key into an Ethereum address.
function secp256k1ToEvmAddress(publicKey: string): string {
  const raw = baseDecode(publicKey.split(':')[1]) // 64 bytes (X || Y)
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 4
  uncompressed.set(raw, 1)
  const hash = keccak_256(uncompressed)
  return '0x' + bytesToHex(hash.slice(-20))
}
