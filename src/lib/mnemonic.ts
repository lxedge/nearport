import { sha256 } from '@noble/hashes/sha2.js'
import englishWordlist from 'bip39-light/wordlists/english.json'

// Checks that a 12-word phrase is a valid BIP39 mnemonic: every word is in the
// English wordlist and the embedded checksum matches. `parseSeedPhrase` does not
// validate the checksum, so this guards against typos deriving a wrong key.
export function isValidMnemonic(mnemonic: string): boolean {
  const words = mnemonic.split(' ')
  if (words.length !== 12) return false
  const indices: number[] = []
  for (const word of words) {
    const index = englishWordlist.indexOf(word)
    if (index === -1) return false
    indices.push(index)
  }
  // 12 words -> 132 bits: 128-bit entropy + 4-bit checksum.
  let bits = ''
  for (const i of indices) bits += i.toString(2).padStart(11, '0')
  const entropyBytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    entropyBytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }
  const hashBits = Array.from(sha256(entropyBytes))
    .map((b) => b.toString(2).padStart(8, '0'))
    .join('')
  return hashBits.slice(0, 4) === bits.slice(128)
}
