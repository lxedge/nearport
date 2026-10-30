import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js'
import { getDerivedAddress, signPayload, type ChainSignature } from './chainsig'
import type { Network } from './constants'
import { recordTransaction } from './history'

// Ethereum-compatible chains the wallet can send native tokens on. All EVM
// chains share one secp256k1-derived address; they differ only in chainId (baked
// into the EIP-1559 signing hash) and the RPC endpoint used to read state and
// broadcast. chainIds are authoritative (EIP-155 replay protection depends on them).
export interface EvmNetwork {
  id: string
  name: string
  chainId: number
  rpcUrl: string
  symbol: string
  explorer: string
}

export const EVM_NETWORKS: Record<string, EvmNetwork> = {
  base: {
    id: 'base',
    name: 'Base',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    symbol: 'ETH',
    explorer: 'https://basescan.org',
  },
  arbitrum: {
    id: 'arbitrum',
    name: 'Arbitrum One',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    symbol: 'ETH',
    explorer: 'https://arbiscan.io',
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Chain',
    chainId: 56,
    rpcUrl: 'https://bsc-dataseed.binance.org',
    symbol: 'BNB',
    explorer: 'https://bscscan.com',
  },
}

export const EVM_NETWORK_ORDER: string[] = ['base', 'arbitrum', 'bsc']

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const SECP256K1_N_DIV_2 = SECP256K1_N >> 1n

export interface EvmSendParams {
  seedPhrase: string
  accountId: string // NEAR account that controls the EVM address
  path: string // EVM derivation path (chainPaths.ethereum)
  nearNetwork: Network
  evmNetworkId: string
  to: string // 0x… recipient
  valueWei: bigint
  data?: string // 0x… call data, default '0x'
}

// --- RPC ---

async function evmRpc(net: EvmNetwork, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(net.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  let data: { result?: unknown; error?: { message?: string } }
  try {
    data = await res.json()
  } catch {
    throw new Error(`RPC ${net.name}: invalid response (${res.status})`)
  }
  if (data.error) throw new Error(data.error.message ?? 'RPC error')
  return data.result
}

function hexToBigInt(h: unknown): bigint {
  if (typeof h !== 'string') throw new Error('RPC returned a non-hex value')
  if (h === '0x' || h === '0x0') return 0n
  return BigInt(h)
}

export async function getEvmBalance(evmNetworkId: string, address: string): Promise<bigint> {
  const net = EVM_NETWORKS[evmNetworkId]
  if (!net) throw new Error('Unknown EVM network')
  return hexToBigInt(await evmRpc(net, 'eth_getBalance', [address, 'latest']))
}

async function estimateGas(
  net: EvmNetwork,
  from: string,
  to: string,
  valueWei: bigint,
  data: string,
): Promise<bigint> {
  try {
    return hexToBigInt(
      await evmRpc(net, 'eth_estimateGas', [
        { from, to, value: '0x' + valueWei.toString(16), data },
      ]),
    )
  } catch {
    return 21000n // plain ETH transfer
  }
}

async function estimateFees(net: EvmNetwork): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  let maxPriorityFeePerGas = 1_000_000_000n // 1 gwei fallback
  try {
    maxPriorityFeePerGas = hexToBigInt(await evmRpc(net, 'eth_maxPriorityFeePerGas', []))
  } catch {
    // fall through to the default
  }

  let maxFeePerGas: bigint
  try {
    const block = (await evmRpc(net, 'eth_getBlockByNumber', ['latest', false])) as {
      baseFeePerGas?: string
    }
    const baseFee = block.baseFeePerGas ? hexToBigInt(block.baseFeePerGas) : 0n
    maxFeePerGas = baseFee > 0n ? baseFee * 2n + maxPriorityFeePerGas : 0n
  } catch {
    maxFeePerGas = 0n
  }

  // Some L2s don't expose baseFeePerGas; fall back to eth_gasPrice.
  if (maxFeePerGas === 0n) {
    const gasPrice = hexToBigInt(await evmRpc(net, 'eth_gasPrice', []))
    maxFeePerGas = gasPrice * 2n
  }
  return { maxFeePerGas, maxPriorityFeePerGas }
}

// --- RLP (Ethereum) ---

function bigIntToBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array(0)
  let hex = n.toString(16)
  if (hex.length % 2) hex = '0' + hex
  return hexToBytes(hex)
}

function rlpBytes(buf: Uint8Array): Uint8Array {
  const len = buf.length
  if (len === 1 && buf[0] < 0x80) return buf
  if (len < 56) return concatBytes(new Uint8Array([0x80 + len]), buf)
  const lenBytes = bigIntToBytes(BigInt(len))
  return concatBytes(new Uint8Array([0xb7 + lenBytes.length]), lenBytes, buf)
}

function rlpInt(n: bigint): Uint8Array {
  return rlpBytes(bigIntToBytes(n))
}

function rlpList(items: Uint8Array[]): Uint8Array {
  const payload = concatBytes(...items)
  const len = payload.length
  if (len < 56) return concatBytes(new Uint8Array([0xc0 + len]), payload)
  const lenBytes = bigIntToBytes(BigInt(len))
  return concatBytes(new Uint8Array([0xf7 + lenBytes.length]), lenBytes, payload)
}

function hexStrToBytes(h: string): Uint8Array {
  const s = h.startsWith('0x') ? h.slice(2) : h
  if (s.length === 0) return new Uint8Array(0)
  if (s.length % 2) throw new Error('Odd-length hex string')
  return hexToBytes(s)
}

// --- EIP-1559 transaction ---

export interface Eip1559Tx {
  chainId: bigint
  nonce: bigint
  maxPriorityFeePerGas: bigint
  maxFeePerGas: bigint
  gasLimit: bigint
  to: Uint8Array // 20 bytes
  value: bigint
  data: Uint8Array
}

export interface Eip1559Signature {
  r: bigint
  s: bigint
  yParity: number
}

// The eight EIP-1559 fields in their canonical RLP order.
function fieldItems(tx: Eip1559Tx): Uint8Array[] {
  return [
    rlpInt(tx.chainId),
    rlpInt(tx.nonce),
    rlpInt(tx.maxPriorityFeePerGas),
    rlpInt(tx.maxFeePerGas),
    rlpInt(tx.gasLimit),
    rlpBytes(tx.to),
    rlpInt(tx.value),
    rlpBytes(tx.data),
    rlpList([]), // accessList
  ]
}

// RLP of the unsigned type-2 payload (without the 0x02 prefix).
export function encodeEip1559Unsigned(tx: Eip1559Tx): Uint8Array {
  return rlpList(fieldItems(tx))
}

// keccak256(0x02 || rlp(fields)) — the EIP-1559 signing hash.
export function eip1559Sighash(tx: Eip1559Tx): Uint8Array {
  return keccak_256(concatBytes(new Uint8Array([2]), encodeEip1559Unsigned(tx)))
}

// Full raw transaction bytes: 0x02 || rlp(fields + [yParity, r, s]).
export function encodeEip1559Signed(tx: Eip1559Tx, sig: Eip1559Signature): Uint8Array {
  return concatBytes(
    new Uint8Array([2]),
    rlpList([...fieldItems(tx), rlpInt(BigInt(sig.yParity)), rlpInt(sig.r), rlpInt(sig.s)]),
  )
}

// Normalizes s to the low half of the curve (EIP-2: high-s signatures are
// rejected) and flips the recovery id accordingly.
function lowS(sig: ChainSignature & { scheme: 'secp256k1' }): Eip1559Signature {
  let s = BigInt('0x' + sig.s)
  let yParity = sig.recoveryId
  if (s > SECP256K1_N_DIV_2) {
    s = SECP256K1_N - s
    yParity = yParity === 0 ? 1 : 0
  }
  return { r: BigInt('0x' + sig.r), s, yParity }
}

// Builds, signs (via NEAR chain signatures), and broadcasts an EIP-1559 transfer.
// Returns the EVM transaction hash and the derived sender address.
export async function sendEvmTransaction(params: EvmSendParams): Promise<{ hash: string; from: string }> {
  const net = EVM_NETWORKS[params.evmNetworkId]
  if (!net) throw new Error('Unknown EVM network')
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.to)) throw new Error('Invalid recipient address')

  const actualChainId = hexToBigInt(await evmRpc(net, 'eth_chainId', []))
  if (actualChainId !== BigInt(net.chainId)) {
    throw new Error(`RPC chainId ${actualChainId} does not match ${net.name} (${net.chainId})`)
  }

  const from = await getDerivedAddress(params.accountId, params.path, params.nearNetwork, 'ethereum')
  const data = params.data ?? '0x'
  const tx: Eip1559Tx = {
    chainId: actualChainId,
    nonce: hexToBigInt(await evmRpc(net, 'eth_getTransactionCount', [from, 'pending'])),
    maxPriorityFeePerGas: 0n,
    maxFeePerGas: 0n,
    gasLimit: await estimateGas(net, from, params.to, params.valueWei, data),
    to: hexStrToBytes(params.to),
    value: params.valueWei,
    data: hexStrToBytes(data),
  }
  const fees = await estimateFees(net)
  tx.maxPriorityFeePerGas = fees.maxPriorityFeePerGas
  tx.maxFeePerGas = fees.maxFeePerGas

  const sighash = eip1559Sighash(tx)
  const sig = (await signPayload(
    params.seedPhrase,
    params.accountId,
    sighash,
    params.path,
    params.nearNetwork,
    'secp256k1',
  )) as ChainSignature & { scheme: 'secp256k1' }

  const rawTx = '0x' + bytesToHex(encodeEip1559Signed(tx, lowS(sig)))
  const hash = (await evmRpc(net, 'eth_sendRawTransaction', [rawTx])) as string

  await recordTransaction(params.accountId, params.nearNetwork, {
    hash,
    type: `Send ${net.symbol} on ${net.name}`,
    from,
    to: params.to,
    amountNear: null,
    direction: 'out',
    success: true,
  })
  return { hash, from }
}

// --- amount formatting ---

const NATIVE_DECIMALS = 18n

// Parses a decimal native-token amount into wei (18 decimals). Throws on bad input.
export function parseNativeAmount(s: string): bigint {
  const t = s.trim()
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t)
  if (!m || (m[1] === '' && m[2] === undefined)) throw new Error('Invalid amount')
  const whole = m[1] === '' ? 0n : BigInt(m[1])
  const frac = (m[2] ?? '')
  if (frac.length > 18) throw new Error('Amount has more than 18 decimals')
  return whole * 10n ** NATIVE_DECIMALS + BigInt(frac.padEnd(18, '0'))
}

// Formats wei as a trimmed decimal string of the native token.
export function formatNativeAmount(wei: bigint): string {
  const unit = 10n ** NATIVE_DECIMALS
  const whole = wei / unit
  const frac = (wei % unit).toString().padStart(18, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}
