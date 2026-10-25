import { parseSeedPhrase } from 'near-api-js/seed-phrase'
import { TESTNET_FAUCET_URL } from './constants'
import { listAccessKeys } from './rpc'
import { recordTransaction } from './history'

// Creates a named `.testnet` account via the NEAR testnet faucet, which funds it
// with free test NEAR. Returns the new account id. Throws if the name is taken
// or the faucet fails.
export async function createFaucetAccount(seedPhrase: string, name: string): Promise<string> {
  const accountId = `${name}.testnet`
  const publicKey = parseSeedPhrase(seedPhrase).getPublicKey().toString()

  if ((await listAccessKeys(accountId, 'testnet')).length > 0) {
    throw new Error('That account name is already taken.')
  }

  const res = await fetch(TESTNET_FAUCET_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
  })
  if (!res.ok) {
    const body = (await res.text()).trim()
    throw new Error(`Faucet request failed (${res.status})${body ? `: ${body.slice(0, 160)}` : ''}`)
  }

  // The faucet returns 200 even when its on-chain CreateAccount action failed
  // (e.g. a name taken between our check and its transaction); verify our key.
  const keys = await listAccessKeys(accountId, 'testnet')
  if (!keys.includes(publicKey)) {
    throw new Error('Account creation failed; the name may have just been taken.')
  }

  await recordTransaction(accountId, 'testnet', {
    type: 'Claim test tokens',
    counterparty: 'faucet',
    amountNear: null,
    direction: 'in',
    success: true,
  })
  return accountId
}
