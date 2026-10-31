// NEAR Intents 1Click API client. Cross-chain swap/bridge: fetch supported
// tokens, request a quote (dry = preview, wet = deposit address), deposit the
// source asset on-chain, then poll /v0/status until the swap settles.
//
// Chain-to-chain is the default: `depositType`/`recipientType`/`refundType` are
// ORIGIN_CHAIN/DESTINATION_CHAIN/ORIGIN_CHAIN. There is no testnet endpoint.

export const INTENTS_API = 'https://1click.chaindefuser.com'

// Cache the token list; it changes infrequently.
const TOKEN_CACHE_MS = 5 * 60 * 1000
let tokenCache: { at: number; tokens: SwapToken[] } | null = null

export interface SwapToken {
  assetId: string // use this verbatim as originAsset/destinationAsset
  decimals: number
  blockchain: string
  symbol: string
  contractAddress?: string
  name?: string
  icon?: string | null
  price?: string
}

export interface SwapQuote {
  amountIn: string // expected deposit, smallest unit
  amountInFormatted: string
  amountOut: string
  amountOutFormatted: string
  minAmountOut?: string
  depositAddress?: string // present only when the quote is committed (dry: false)
  depositMemo?: string | null
  deadline?: string
  timeEstimate?: number
}

export interface QuoteResponse {
  correlationId: string
  quote: SwapQuote
}

export type SwapStatus =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REFUNDED'
  | 'INCOMPLETE_DEPOSIT'

export interface StatusResponse {
  correlationId: string
  status: SwapStatus
  updatedAt?: string
  swapDetails?: {
    amountOut?: string
    destinationChainTxHashes?: Array<{ hash: string; explorerUrl: string }>
    refundReason?: string
  }
}

const TERMINAL: SwapStatus[] = ['SUCCESS', 'FAILED', 'REFUNDED', 'INCOMPLETE_DEPOSIT']

export function isTerminal(status: SwapStatus): boolean {
  return TERMINAL.includes(status)
}

export async function fetchSwapTokens(): Promise<SwapToken[]> {
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_CACHE_MS) return tokenCache.tokens
  const res = await fetch(`${INTENTS_API}/v0/tokens`)
  if (!res.ok) throw new Error(`Token list unavailable (${res.status})`)
  const tokens = (await res.json()) as SwapToken[]
  tokenCache = { at: Date.now(), tokens }
  return tokens
}

export interface QuoteParams {
  originAsset: string
  destinationAsset: string
  amount: string // smallest unit, per swapType
  recipient: string
  refundTo: string
  slippageTolerance?: number // basis points, 100 = 1%
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${INTENTS_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = (await res.json()) as { message?: string }
      if (data.message) message = data.message
    } catch {
      // Non-JSON error body; keep the status-based message.
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

// Requests a quote. `dry: true` is a preview; `dry: false` returns a
// depositAddress valid ~10 minutes and commits the quote.
export async function getQuote(params: QuoteParams, dry: boolean): Promise<QuoteResponse> {
  return postJson<QuoteResponse>('/v0/quote', {
    dry,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100, // 1%
    deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    // The live API rejects requests where these are absent, so set them
    // explicitly to the chain-to-chain defaults (deposit on the source chain,
    // receive on the destination chain, refund to the source chain).
    depositType: 'ORIGIN_CHAIN',
    recipientType: 'DESTINATION_CHAIN',
    refundType: 'ORIGIN_CHAIN',
    ...params,
  })
}

// Notifies the API of the deposit transaction to speed up processing.
// Non-critical: failures are swallowed by the caller.
export async function submitDeposit(params: {
  txHash: string
  depositAddress: string
  nearSenderAccount?: string
}): Promise<void> {
  await postJson('/v0/deposit/submit', params)
}

export async function getStatus(depositAddress: string): Promise<StatusResponse> {
  const res = await fetch(`${INTENTS_API}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`)
  if (!res.ok) throw new Error(`Status unavailable (${res.status})`)
  return (await res.json()) as StatusResponse
}

// Polls /v0/status every `intervalMs` until a terminal state, invoking
// `onUpdate` after each poll. Resolves with the terminal status.
export async function pollStatus(
  depositAddress: string,
  onUpdate: (status: StatusResponse) => void,
  intervalMs = 2000,
): Promise<StatusResponse> {
  for (;;) {
    const status = await getStatus(depositAddress)
    onUpdate(status)
    if (isTerminal(status.status)) return status
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, intervalMs)
    await promise
  }
}
