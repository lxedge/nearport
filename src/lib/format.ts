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

// Parses a decimal string into integer units at `decimals` precision. Throws on
// malformed input or too many fractional digits.
export function parseUnits(value: string, decimals: number): bigint {
  const t = value.trim()
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t)
  if (!m || (m[1] === '' && m[2] === undefined)) throw new Error('Invalid amount')
  const whole = m[1] === '' ? 0n : BigInt(m[1])
  const frac = m[2] ?? ''
  if (frac.length > decimals) throw new Error(`Amount has more than ${decimals} decimals`)
  return whole * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0'))
}

// Formats integer units as a trimmed decimal string at `decimals` precision.
export function formatUnits(units: bigint | string, decimals: number): string {
  const value = typeof units === 'string' ? BigInt(units) : units
  const unit = 10n ** BigInt(decimals)
  const whole = value / unit
  const frac = (value % unit).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

// Normalizes a seed phrase: lowercase and collapse whitespace.
export function normalizeSeedPhrase(seedPhrase: string): string {
  return seedPhrase.trim().toLowerCase().split(/\s+/).join(' ')
}
