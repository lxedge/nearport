// Password-based encryption for the seed phrase at rest.
//
// The seed phrase is the only secret the wallet holds. It is never persisted in
// plaintext: it is wrapped with AES-256-GCM using a key derived from the user's
// password via PBKDF2 (SHA-256, 310k iterations). The persisted blob is
// `base64(salt || iv || ciphertext)` with a fresh random salt and IV per save.

const PBKDF2_ITERATIONS = 310_000
const SALT_BYTES = 16
const IV_BYTES = 12

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptSeedPhrase(seedPhrase: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(seedPhrase)),
  )

  const blob = new Uint8Array(salt.length + iv.length + ciphertext.length)
  blob.set(salt, 0)
  blob.set(iv, salt.length)
  blob.set(ciphertext, salt.length + iv.length)
  return bytesToBase64(blob)
}

// Throws if the password is wrong (AES-GCM authentication fails).
export async function decryptSeedPhrase(blob: string, password: string): Promise<string> {
  const bytes = base64ToBytes(blob)
  const salt = bytes.slice(0, SALT_BYTES)
  const iv = bytes.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const ciphertext = bytes.slice(SALT_BYTES + IV_BYTES)
  const key = await deriveKey(password, salt)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return decoder.decode(plaintext)
}
