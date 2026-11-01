import { JsonRpcProvider } from 'near-api-js'
import { NETWORKS, type Network } from './constants'

// Shared, cached NEAR JSON-RPC providers. A JsonRpcProvider is stateless over
// network requests, so one instance per network is reused instead of allocating
// a new one per call (which several balance/token/chain-signature helpers did).
const providers = new Map<Network, JsonRpcProvider>()

export function getNearProvider(network: Network): JsonRpcProvider {
  let provider = providers.get(network)
  if (!provider) {
    provider = new JsonRpcProvider({ url: NETWORKS[network].rpcUrl })
    providers.set(network, provider)
  }
  return provider
}
