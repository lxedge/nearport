import { yoctoToNear } from 'near-api-js'
import type { Network } from './near'

// Transaction history comes from the NearBlocks public indexer API.
const API: Record<Network, string> = {
  mainnet: 'https://api.nearblocks.io',
  testnet: 'https://api-testnet.nearblocks.io',
}

export interface HistoryTransaction {
  hash: string
  timestamp: number // ms since epoch
  type: string
  counterparty: string
  amountNear: string | null
  direction: 'in' | 'out'
  success: boolean
}

interface RawTxn {
  transaction_hash: string
  block_timestamp: string // nanoseconds since epoch
  predecessor_account_id: string
  receiver_account_id: string
  receipt_outcome?: { status: boolean }
  actions?: Array<{ action: string; method?: string; deposit?: string }>
}

export async function fetchTransactions(
  accountId: string,
  network: Network,
): Promise<HistoryTransaction[]> {
  const res = await fetch(`${API[network]}/v1/account/${accountId}/txns?per_page=20`)
  if (!res.ok) throw new Error(`History unavailable (${res.status})`)
  const data = (await res.json()) as { txns: RawTxn[] }
  return data.txns.map((t) => mapTxn(t, accountId))
}

function mapTxn(t: RawTxn, accountId: string): HistoryTransaction {
  const outgoing = t.predecessor_account_id === accountId
  const transfer = t.actions?.find((a) => a.action === 'TRANSFER')
  return {
    hash: t.transaction_hash,
    timestamp: Math.floor(Number(t.block_timestamp) / 1_000_000),
    type: transfer ? 'Transfer' : actionLabel(t.actions?.[0]?.action, t.actions?.[0]?.method),
    counterparty: outgoing ? t.receiver_account_id : t.predecessor_account_id,
    amountNear: transfer?.deposit ? yoctoToNear(BigInt(transfer.deposit), 6) : null,
    direction: outgoing ? 'out' : 'in',
    success: t.receipt_outcome?.status ?? true,
  }
}

function actionLabel(action?: string, method?: string): string {
  switch (action) {
    case 'TRANSFER':
      return 'Transfer'
    case 'FUNCTION_CALL':
      return method || 'Function call'
    case 'CREATE_ACCOUNT':
      return 'Create account'
    case 'ADD_KEY':
      return 'Add key'
    case 'DELETE_KEY':
      return 'Delete key'
    case 'DEPLOY_CONTRACT':
      return 'Deploy contract'
    case 'STAKE':
      return 'Stake'
    default:
      return action || 'Transaction'
  }
}
