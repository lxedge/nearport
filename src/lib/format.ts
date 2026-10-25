import { nearToYocto, yoctoToNear } from 'near-api-js'
import { BALANCE_DECIMALS } from './constants'

// One dot-separated segment of a NEAR named account: lowercase alphanumerics
// with `-`/`_` only between alphanumeric runs.
export function isValidAccountName(name: string): boolean {
  return /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(name)
}

// A full NEAR account id: a 2-64 char named account or a 64-hex implicit address.
export function isValidAccountId(id: string): boolean {
  if (id.length < 2 || id.length > 64) return false
  if (/^[0-9a-f]{64}$/.test(id)) return true
  return id.split('.').every((seg) => /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(seg))
}

// Formats a yoctoNEAR amount with the wallet's display precision.
export function formatNear(yocto: bigint): string {
  return yoctoToNear(yocto, BALANCE_DECIMALS)
}

// Parses a decimal NEAR string into yoctoNEAR. Throws on malformed input.
export function parseNear(amountNear: string): bigint {
  return nearToYocto(amountNear as `${number}`)
}

// Normalizes a seed phrase: lowercase and collapse whitespace.
export function normalizeSeedPhrase(seedPhrase: string): string {
  return seedPhrase.trim().toLowerCase().split(/\s+/).join(' ')
}
