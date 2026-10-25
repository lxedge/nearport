import { JsonRpcProvider } from 'near-api-js'
import { NETWORKS, type Network } from './constants'

// True when an RPC error means the account does not exist (yet).
export function isUnknownAccount(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /does not exist|UNKNOWN_ACCOUNT/i.test(msg)
}

// Returns the public keys registered on an account, or [] if it doesn't exist.
export async function listAccessKeys(accountId: string, network: Network): Promise<string[]> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  try {
    const result = await provider.query<{ keys: Array<{ public_key: string }> }>({
      request_type: 'view_access_key_list',
      account_id: accountId,
      finality: 'optimistic',
    })
    return result.keys.map((k) => k.public_key)
  } catch (err) {
    if (isUnknownAccount(err)) return []
    throw err
  }
}
