import { baseEncode } from 'near-api-js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { Chain } from './chainsig'

// Encodes a raw derived public key (64-byte X||Y for secp256k1, 32 bytes for
// ed25519) into the address string of a given chain. Pure functions, no I/O.

export function rawToAddress(chain: Chain, raw: Uint8Array): string {
  switch (chain) {
    case 'ethereum':
      return secp256k1ToEvmAddress(raw)
    case 'bitcoin':
      return secp256k1ToP2pkhAddress(raw, 0x00)
    case 'bitcoincash':
      return secp256k1ToP2pkhAddress(raw, 0x00) // legacy P2PKH, same prefix as Bitcoin
    case 'litecoin':
      return secp256k1ToP2pkhAddress(raw, 0x30)
    case 'dogecoin':
      return secp256k1ToP2pkhAddress(raw, 0x1e)
    case 'dash':
      return secp256k1ToP2pkhAddress(raw, 0x4c)
    case 'zcash':
      return secp256k1ToZcashAddress(raw)
    case 'tron':
      return secp256k1ToTronAddress(raw)
    case 'solana':
      return bytesToBase58(raw)
    case 'sui':
      return ed25519ToSuiAddress(raw)
    case 'aptos':
      return ed25519ToAptosAddress(raw)
    case 'stellar':
      return ed25519ToStellarAddress(raw)
    case 'ton':
      return ed25519ToTonAddress(raw)
  }
}

function bytesToBase58(bytes: Uint8Array): string {
  return baseEncode(bytes)
}

function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4)
  const full = new Uint8Array(payload.length + 4)
  full.set(payload, 0)
  full.set(checksum, payload.length)
  return bytesToBase58(full)
}

function secp256k1ToEvmAddress(raw: Uint8Array): string {
  // `raw` is the 64-byte X||Y point; keccak256 over those 64 bytes (no 0x04
  // prefix), last 20 bytes. Matches the official chainsig-lib.
  return '0x' + bytesToHex(keccak_256(raw).slice(-20))
}

// Bitcoin-family legacy P2PKH address: base58check of a one-byte version prefix +
// hash160 of the uncompressed secp256k1 pubkey (0x04 || X || Y, 65 bytes).
// Bitcoin, Bitcoin Cash (legacy), Litecoin, Dogecoin, and Dash differ only in the
// prefix byte.
function secp256k1ToP2pkhAddress(raw: Uint8Array, versionByte: number): string {
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 4
  uncompressed.set(raw, 1)
  const hash = ripemd160(sha256(uncompressed))
  const payload = new Uint8Array(21)
  payload[0] = versionByte
  payload.set(hash, 1)
  return base58CheckEncode(payload)
}

// Tron address ("T…"): base58check of the 0x41 prefix + the last 20 bytes of
// keccak256 over the 64-byte secp256k1 pubkey (no 0x04 prefix).
function secp256k1ToTronAddress(raw: Uint8Array): string {
  const hash = keccak_256(raw).slice(-20)
  const payload = new Uint8Array(21)
  payload[0] = 0x41
  payload.set(hash, 1)
  return base58CheckEncode(payload)
}

// Zcash mainnet transparent P2PKH address ("t1…"): base58check of the two-byte
// version prefix 0x1CB8 (Zcash Protocol Spec §5.6.1.1) followed by hash160 of the
// uncompressed secp256k1 pubkey. Shielded ("z…") addresses are out of scope — they
// require zk-SNARK proving, not a signature.
function secp256k1ToZcashAddress(raw: Uint8Array): string {
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 4
  uncompressed.set(raw, 1)
  const hash = ripemd160(sha256(uncompressed))
  const payload = new Uint8Array(22)
  payload[0] = 0x1c // mainnet transparent P2PKH prefix (t1)
  payload[1] = 0xb8
  payload.set(hash, 2)
  return base58CheckEncode(payload)
}

function ed25519ToSuiAddress(raw: Uint8Array): string {
  const data = new Uint8Array(raw.length + 1)
  data[0] = 0 // ed25519 signature-scheme flag byte
  data.set(raw, 1)
  return '0x' + bytesToHex(blake2b(data, { dkLen: 32 }))
}

// Aptos address ("0x…" 64 hex chars): the 32-byte ed25519 pubkey, hex-encoded,
// with a 0x prefix and no hashing.
function ed25519ToAptosAddress(raw: Uint8Array): string {
  return '0x' + bytesToHex(raw)
}

// RFC 4648 base32, uppercase, no padding — Stellar's StrKey alphabet.
function bytesToBase32(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let out = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31]
  return out
}

// Stellar address ("G…", 56 chars): base32 of the 0x30 version byte (ed25519
// public-key type) + the 32-byte pubkey + CRC16-XMODEM (little-endian).
function ed25519ToStellarAddress(raw: Uint8Array): string {
  const body = new Uint8Array(33)
  body[0] = 0x30 // version byte: 6 << 3 = ed25519 public key
  body.set(raw, 1)
  const crc = crc16Xmodem(body)
  const payload = new Uint8Array(35)
  payload.set(body, 0)
  payload[33] = crc & 0xff
  payload[34] = crc >> 8
  return bytesToBase32(payload)
}

// CRC16-XMODEM (poly 0x1021), the checksum TON embeds in friendly addresses.
function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0x0000
  for (const byte of bytes) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc
}

// Base64url (RFC 4648 §5, unpadded) — the alphabet of TON friendly addresses.
function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// TON user-friendly (non-bounceable) address: tag 0x51 + workchain 0 + the 32-byte
// key as the account id + CRC16, base64url-encoded ("UQ…").
function ed25519ToTonAddress(raw: Uint8Array): string {
  const buf = new Uint8Array(36)
  buf[0] = 0x51 // non-bounceable
  buf[1] = 0x00 // basechain (workchain 0)
  buf.set(raw, 2)
  const crc = crc16Xmodem(buf.subarray(0, 34))
  buf[34] = crc >> 8
  buf[35] = crc & 0xff
  return bytesToBase64Url(buf)
}
