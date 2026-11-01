import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { getDerivedPublicKey, signPayload, type ChainSignature } from './chainsig'
import { SOLANA_RPC, type Network } from './constants'
import { recordTransaction } from './history'

// Native SOL transfers via NEAR chain signatures. The NEAR MPC network derives
// the ed25519 public key for the account + path and signs the serialized
// transaction message; @solana/web3.js handles the (error-prone) message
// serialization and broadcast.

const SOL_DECIMALS = 9n

// Parses a decimal SOL amount into lamports. Throws on malformed input or more
// than 9 fractional digits.
export function parseSolAmount(s: string): bigint {
  const t = s.trim()
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t)
  if (!m || (m[1] === '' && m[2] === undefined)) throw new Error('Invalid amount')
  const whole = m[1] === '' ? 0n : BigInt(m[1])
  const frac = m[2] ?? ''
  if (frac.length > 9) throw new Error('Amount has more than 9 decimals')
  return whole * 10n ** SOL_DECIMALS + BigInt(frac.padEnd(9, '0'))
}

// Formats lamports as a trimmed decimal SOL string.
export function formatSolAmount(lamports: bigint): string {
  const unit = 10n ** SOL_DECIMALS
  const whole = lamports / unit
  const frac = (lamports % unit).toString().padStart(9, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

// The derived Solana address (base58) controlled by the NEAR account + path.
export async function getSolAddress(
  accountId: string,
  path: string,
  network: Network,
): Promise<string> {
  const raw = await getDerivedPublicKey(accountId, path, network, 'solana')
  return new PublicKey(raw).toBase58()
}

// Queries the SOL balance (in lamports) of a derived address.
export async function getSolBalance(
  accountId: string,
  path: string,
  network: Network,
): Promise<bigint> {
  const connection = new Connection(SOLANA_RPC[network])
  const address = await getSolAddress(accountId, path, network)
  return BigInt(await connection.getBalance(new PublicKey(address)))
}

export interface SolSendParams {
  seedPhrase: string
  accountId: string
  path: string
  network: Network
  to: string // base58 recipient address
  lamports: bigint
}

// Builds, signs (via MPC), and broadcasts a native SOL transfer. Returns the
// transaction signature and the derived sender address.
export async function sendSolTransaction(params: SolSendParams): Promise<{ signature: string; from: string }> {
  const { seedPhrase, accountId, path, network, to, lamports } = params
  let toKey: PublicKey
  try {
    toKey = new PublicKey(to)
  } catch {
    throw new Error('Invalid recipient address')
  }

  const connection = new Connection(SOLANA_RPC[network])
  const from = await getSolAddress(accountId, path, network)
  const fromKey = new PublicKey(from)

  const tx = new Transaction()
  tx.add(SystemProgram.transfer({ fromPubkey: fromKey, toPubkey: toKey, lamports }))
  tx.feePayer = fromKey
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

  // The MPC signs the serialized message bytes directly (ed25519, no extra hash).
  const message = tx.serializeMessage()
  const sig = (await signPayload(
    seedPhrase,
    accountId,
    message,
    path,
    network,
    'ed25519',
  )) as ChainSignature & { scheme: 'ed25519' }

  tx.addSignature(fromKey, hexToBytes(sig.signature))

  const serialized = await tx.serialize()
  const signature = await connection.sendRawTransaction(serialized, {
    skipPreflight: false,
  })

  await recordTransaction(accountId, network, {
    hash: signature,
    type: 'Send SOL',
    from,
    to,
    amountNear: null,
    direction: 'out',
    success: true,
  })
  return { signature, from }
}
