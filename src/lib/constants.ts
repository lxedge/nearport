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

// Public NearBlocks block explorer (used for transaction links in history detail).
export const NEARBLOCKS_EXPLORER: Record<Network, string> = {
  mainnet: 'https://nearblocks.io',
  testnet: 'https://testnet.nearblocks.io',
}

// Public FastNear indexer (used for fungible-token balances).
export const FASTNEAR_API: Record<Network, string> = {
  mainnet: 'https://api.fastnear.com',
  testnet: 'https://api-testnet.fastnear.com',
}

export const TESTNET_FAUCET_URL = 'https://helper.nearprotocol.com/account'
