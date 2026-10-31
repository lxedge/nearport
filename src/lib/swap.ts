import { Account } from 'near-api-js'
import { parseSeedPhrase } from 'near-api-js/seed-phrase'
import { NETWORKS, type Network } from './constants'
import { formatNear } from './format'
import { recordTransaction } from './history'

// On-chain deposit transaction builder for a NEAR Intents swap/bridge. The
// source chain is NEAR; the API returns a `depositAddress` (a 64-hex implicit
// account) that we fund with a plain native NEAR transfer. Native transfers
// create the implicit account on-chain, so no token-contract registration is
// needed (unlike a NEP-141 `ft_transfer`, which panics for an unregistered
// receiver).

// Sends `amountIn` yoctoNEAR from the wallet's account to `depositAddress`.
// Returns the transaction hash. `amountIn` comes from the quote's `amountIn`
// field (wNEAR has 24 decimals, i.e. yoctoNEAR, 1:1 with native NEAR).
export async function sendNativeNearDeposit(params: {
  seedPhrase: string
  accountId: string
  network: Network
  depositAddress: string
  amountIn: string
}): Promise<string> {
  const { seedPhrase, accountId, network, depositAddress, amountIn } = params
  const amountYocto = BigInt(amountIn)
  const keyPair = parseSeedPhrase(seedPhrase)
  const account = new Account(accountId, NETWORKS[network].rpcUrl, keyPair.toString())
  const result = await account.transfer({ receiverId: depositAddress, amount: amountYocto })
  const hash = result.transaction_outcome.id
  await recordTransaction(accountId, network, {
    hash,
    type: 'Swap deposit',
    from: accountId,
    to: depositAddress,
    amountNear: formatNear(amountYocto),
    direction: 'out',
    success: true,
  })
  return hash
}
