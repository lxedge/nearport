import { Account } from 'near-api-js'
import { parseSeedPhrase } from 'near-api-js/seed-phrase'
import { NETWORKS, type Network } from './constants'
import { formatNear, parseNear } from './format'
import { recordTransaction } from './history'

// Sends NEAR from the wallet's account to `receiverId`, signing the transaction
// with the key derived from the stored seed phrase. Returns the transaction hash.
// `amountNear` must already be a valid, positive decimal NEAR amount (the caller
// validates it); parseNear throws on malformed input.
export async function sendNear(
  seedPhrase: string,
  accountId: string,
  receiverId: string,
  amountNear: string,
  network: Network,
): Promise<string> {
  const keyPair = parseSeedPhrase(seedPhrase)
  const account = new Account(accountId, NETWORKS[network].rpcUrl, keyPair.toString())
  const amountYocto = parseNear(amountNear)
  const result = await account.transfer({ receiverId, amount: amountYocto })
  const hash = result.transaction_outcome.id
  await recordTransaction(accountId, network, {
    hash,
    type: 'Transfer',
    counterparty: receiverId,
    amountNear: formatNear(amountYocto),
    direction: 'out',
    success: true,
  })
  return hash
}
