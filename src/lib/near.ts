import { generateSeedPhrase } from 'near-api-js/seed-phrase'
import { keyToImplicitAddress, JsonRpcProvider, yoctoToNear } from 'near-api-js'

export type Network = 'mainnet' | 'testnet'

export const NETWORKS: Record<Network, { label: string; rpcUrl: string }> = {
  mainnet: { label: 'Mainnet', rpcUrl: 'https://rpc.mainnet.near.org' },
  testnet: { label: 'Testnet', rpcUrl: 'https://rpc.testnet.near.org' },
}

export interface CreatedAccount {
  seedPhrase: string
  accountId: string
}

// Creates a fresh NEAR account: a 12-word mnemonic plus the implicit account id
// derived from its public key (64 hex chars). Implicit accounts need no on-chain
// registration to receive funds; named accounts (e.g. foo.testnet) come later.
export function createAccount(): CreatedAccount {
  const { seedPhrase, keyPair } = generateSeedPhrase()
  const accountId = keyToImplicitAddress(keyPair.getPublicKey())
  return { seedPhrase, accountId }
}

// Queries the account balance (in NEAR) from the given network's RPC node.
// Returns "0" for an account that hasn't been funded yet (doesn't exist on chain).
export async function getBalance(accountId: string, network: Network): Promise<string> {
  const provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
  try {
    const result = await provider.query<{ amount: string }>({
      request_type: 'view_account',
      account_id: accountId,
      finality: 'final',
    })
    return yoctoToNear(BigInt(result.amount))
  } catch (err) {
    if (isUnknownAccount(err)) return '0'
    throw err
  }
}

function isUnknownAccount(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /does not exist|UNKNOWN_ACCOUNT/i.test(msg)
}
