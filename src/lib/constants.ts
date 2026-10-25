export type Network = 'mainnet' | 'testnet'

export const NETWORKS: Record<Network, { label: string; rpcUrl: string }> = {
  mainnet: { label: 'Mainnet', rpcUrl: 'https://rpc.mainnet.near.org' },
  testnet: { label: 'Testnet', rpcUrl: 'https://rpc.testnet.fastnear.com' },
}

// Balances are displayed with at most this many decimal places.
export const BALANCE_DECIMALS = 6

// Public NearBlocks indexer API (used for history and key→account discovery).
export const NEARBLOCKS_API: Record<Network, string> = {
  mainnet: 'https://api.nearblocks.io',
  testnet: 'https://api-testnet.nearblocks.io',
}

export const TESTNET_FAUCET_URL = 'https://helper.nearprotocol.com/account'
