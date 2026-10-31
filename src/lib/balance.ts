import { JsonRpcProvider } from 'near-api-js'
import { NETWORKS, type Network } from './constants'
import { formatNear } from './format'
import { isUnknownAccount } from './rpc'

// Queries the account balance (in NEAR) from the given network's RPC node.
// Returns "0" for an account that hasn't been funded yet (doesn't exist on chain).
export async function getBalance(accountId: string, network: Network): Promise<string> {
  return formatNear(await getRawBalance(accountId, network))
}

// Raw balance in yoctoNEAR, for computing max-spendable amounts where the
// formatted display string is too lossy.
export async function getRawBalance(accountId: string, network: Network): Promise<bigint> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  try {
    const result = await provider.query<{ amount: string }>({
      request_type: 'view_account',
      account_id: accountId,
      finality: 'final',
    })
    return BigInt(result.amount)
  } catch (err) {
    if (isUnknownAccount(err)) return 0n
    throw err
  }
}

export interface AccountBalances {
  accounts: Array<{ accountId: string; balance: string }>
  total: string
}

// Fetches the balance (in NEAR) of every account and their sum. Accounts that
// have never been funded (don't exist on chain) count as "0".
export async function getAccountBalances(
  accountIds: string[],
  network: Network,
): Promise<AccountBalances> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  const rows = await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        const result = await provider.query<{ amount: string }>({
          request_type: 'view_account',
          account_id: accountId,
          finality: 'final',
        })
        return { accountId, yocto: BigInt(result.amount) }
      } catch (err) {
        if (isUnknownAccount(err)) return { accountId, yocto: 0n }
        throw err
      }
    }),
  )
  const total = rows.reduce((sum, row) => sum + row.yocto, 0n)
  return {
    accounts: rows.map((row) => ({ accountId: row.accountId, balance: formatNear(row.yocto) })),
    total: formatNear(total),
  }
}
