import { NEARBLOCKS_API, type Network } from './constants'
import { formatNear } from './format'

// Transaction history has two sources:
// 1. A local log of every transaction this wallet sends (works on both networks).
// 2. The NearBlocks public indexer (mainnet only; its testnet indexing is stale).

const HISTORY_KEY = 'txnHistory'

export interface HistoryTransaction {
  hash: string // on-chain tx hash, or a local id
  timestamp: number // ms since epoch
  type: string
  counterparty: string
  amountNear: string | null
  direction: 'in' | 'out'
  success: boolean
}

type StoredTxn = HistoryTransaction & { accountId: string; network: Network }

interface RawTxn {
  transaction_hash: string
  block_timestamp: string
  predecessor_account_id: string
  receiver_account_id: string
  receipt_outcome?: { status: boolean }
  actions?: Array<{ action: string; method?: string; deposit?: string }>
}

// Records a locally-sent transaction, so history works without an indexer.
export async function recordTransaction(
  accountId: string,
  network: Network,
  entry: Omit<HistoryTransaction, 'hash' | 'timestamp'> & { hash?: string },
): Promise<void> {
  const stored: StoredTxn = {
    ...entry,
    hash: entry.hash ?? crypto.randomUUID(),
    timestamp: Date.now(),
    accountId,
    network,
  }
  const data = await chrome.storage.local.get(HISTORY_KEY)
  const list: StoredTxn[] = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : []
  list.unshift(stored)
  await chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, 200) })
}

// Merges local transactions with the indexer (when available), newest first.
export async function getHistory(
  accountId: string,
  network: Network,
): Promise<HistoryTransaction[]> {
  const data = await chrome.storage.local.get(HISTORY_KEY)
  const list: StoredTxn[] = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : []
  const local = list.filter((t) => t.accountId === accountId && t.network === network)

  let indexer: HistoryTransaction[] = []
  try {
    indexer = await fetchTransactions(accountId, network)
  } catch {
    // Indexer unavailable; local history still works.
  }

  const localHashes = new Set(local.map((t) => t.hash))
  const merged = [...local, ...indexer.filter((t) => !localHashes.has(t.hash))]
  return merged.sort((a, b) => b.timestamp - a.timestamp)
}

async function fetchTransactions(
  accountId: string,
  network: Network,
): Promise<HistoryTransaction[]> {
  const res = await fetch(`${NEARBLOCKS_API[network]}/v1/account/${accountId}/txns?per_page=20`)
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
    amountNear: transfer?.deposit ? formatNear(BigInt(transfer.deposit)) : null,
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
