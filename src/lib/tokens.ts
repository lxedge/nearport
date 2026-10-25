import { JsonRpcProvider } from 'near-api-js'
import { FASTNEAR_API, NETWORKS, type Network } from './constants'

// NEP-141 fungible tokens held by an account. Balances come from the FastNear
// indexer; per-token metadata (symbol, decimals, icon) is read from each token
// contract's `ft_metadata` view method.

export interface TokenBalance {
  contractId: string
  symbol: string
  name: string
  icon: string | null
  decimals: number
  amount: string // raw integer string
  formatted: string // human-readable, trimmed
}

interface FastNearFtResponse {
  account_id: string
  tokens: Array<{ contract_id: string; balance: string }>
}

interface FtMetadata {
  name?: string
  symbol?: string
  icon?: string | null
  decimals?: number
}

// Bound on metadata RPC calls: an account can hold hundreds of tokens.
const MAX_TOKENS = 20
// Concurrency cap for `ft_metadata` RPC calls; the public endpoint rate-limits
// bursts of parallel requests.
const METADATA_CONCURRENCY = 4

// Returns the account's non-zero token balances, sorted by symbol. Metadata
// failures degrade to a contractId label with zero decimals rather than erroring.
export async function getTokenBalances(accountId: string, network: Network): Promise<TokenBalance[]> {
  const res = await fetch(`${FASTNEAR_API[network]}/v1/account/${accountId}/ft`)
  if (!res.ok) throw new Error(`Tokens unavailable (${res.status})`)
  const data = (await res.json()) as FastNearFtResponse
  const tokens = data.tokens.filter((t) => t.balance && t.balance !== '0').slice(0, MAX_TOKENS)

  const rows: TokenBalance[] = []
  for (let i = 0; i < tokens.length; i += METADATA_CONCURRENCY) {
    const chunk = tokens.slice(i, i + METADATA_CONCURRENCY)
    rows.push(...(await Promise.all(chunk.map((t) => buildTokenBalance(t, network)))))
  }
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

async function buildTokenBalance(
  token: { contract_id: string; balance: string },
  network: Network,
): Promise<TokenBalance> {
  const meta = await getFtMetadata(token.contract_id, network)
  const decimals = clampDecimals(meta?.decimals)
  return {
    contractId: token.contract_id,
    symbol: meta?.symbol || fallbackSymbol(token.contract_id),
    name: meta?.name || token.contract_id,
    icon: meta?.icon ?? null,
    decimals,
    amount: token.balance,
    formatted: formatTokenAmount(token.balance, decimals),
  }
}

// A short label for a token whose `ft_metadata` is unavailable (e.g. an
// unindexed bridge token): strip the `.near` suffix and truncate long ids.
function fallbackSymbol(contractId: string): string {
  const head = contractId.split('.')[0]
  return head.length > 16 ? `${head.slice(0, 15)}…` : head
}

async function getFtMetadata(contractId: string, network: Network): Promise<FtMetadata | null> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  try {
    const result = await provider.query<{ result: number[] }>({
      request_type: 'call_function',
      account_id: contractId,
      method_name: 'ft_metadata',
      args_base64: 'e30=', // {}
      finality: 'final',
    })
    const json = new TextDecoder().decode(Uint8Array.from(result.result))
    return JSON.parse(json) as FtMetadata
  } catch {
    return null
  }
}

function clampDecimals(decimals?: number): number {
  const n = Number(decimals ?? 0)
  if (!Number.isFinite(n) || n < 0 || n > 255) return 0
  return n
}

// raw / 10^decimals, fractional part capped at 6 digits with trailing zeros trimmed.
function formatTokenAmount(amount: string, decimals: number): string {
  const raw = BigInt(amount)
  const scale = 10n ** BigInt(decimals)
  const whole = raw / scale
  const frac = (raw % scale)
    .toString()
    .padStart(decimals, '0')
    .slice(0, 6)
    .replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}
