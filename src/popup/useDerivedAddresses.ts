import { useEffect, useState } from 'react'
import { CHAIN_ORDER, getDerivedAddress, type Chain, type ChainPaths } from '../lib/chainsig'
import type { Network } from '../lib/constants'

export type DerivedStatus = 'loading' | 'ready' | 'error'

// Derives the foreign-chain addresses for `accountId` via the MPC network
// (`derived_public_key` on-chain query). Each chain uses its own configured path.
export function useDerivedAddresses(
  accountId: string | null,
  chainPaths: ChainPaths,
  network: Network,
): { addresses: Partial<Record<Chain, string>>; status: DerivedStatus } {
  const [addresses, setAddresses] = useState<Partial<Record<Chain, string>>>({})
  const [status, setStatus] = useState<DerivedStatus>('loading')

  useEffect(() => {
    if (accountId === null) return
    let cancelled = false
    setStatus('loading')
    Promise.all(
      CHAIN_ORDER.map(
        async (chain) =>
          [chain, await getDerivedAddress(accountId, chainPaths[chain], network, chain)] as const,
      ),
    )
      .then((rows) => {
        if (cancelled) return
        setAddresses(Object.fromEntries(rows) as Partial<Record<Chain, string>>)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [accountId, chainPaths, network])

  return { addresses, status }
}
