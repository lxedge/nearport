# NearPort

A NEAR wallet Chrome extension (Manifest V3). Seed phrases are encrypted locally and stored in `chrome.storage.local`. Supports mainnet/testnet accounts, NEAR and NEP-141 token balances, transfers, transaction history, and multi-chain address derivation, native-token transfers on EVM chains (Base / Arbitrum / BNB Chain), and message signing via NEAR Chain Signatures.

## Features

- **Wallet**: Create (12-word mnemonic) or import a seed phrase; encrypt it with a password into `chrome.storage.local`; unlock, auto-lock (3 min), export the seed phrase.
- **Accounts**: Mainnet / testnet switch; implicit accounts + named accounts (`.near` / `.testnet`); one-click testnet faucet for free test tokens; auto-discovers named accounts controlled by the seed on import.
- **Balances**: NEAR balances (aggregated across accounts), NEP-141 token balances (FastNear indexer + `ft_metadata`), and native-token balances on Base / Arbitrum / BNB Chain (one shared derived EVM address).
- **Transfers**: Unified Send — pick the asset and send NEAR or the native token on Base / Arbitrum / BNB Chain; receive NEAR with address + QR code.
- **History**: Merged local transaction log + NearBlocks indexer (mainnet).
- **Chain Signatures**: Derive foreign-chain addresses and sign arbitrary messages via the NEAR MPC network. Currently supported:

  | Chain | Signature scheme | Address format |
  |---|---|---|
  | Ethereum | secp256k1 | `0x…` |
  | Bitcoin | secp256k1 | P2PKH (`1…`) |
  | Zcash | secp256k1 | Transparent P2PKH (`t1…`) |
  | Solana | ed25519 | base58 |
  | Sui | ed25519 | `0x…` |
  | TON | ed25519 | Non-bounceable friendly (`UQ…`) |

  > Chain signatures implement **address derivation + message signing** on all listed chains, plus **real transaction signing/broadcasting on EVM chains** (Base / Arbitrum / BNB Chain, EIP-1559). Transaction construction for the non-EVM chains is still pending (see Roadmap).

## Quick start

### Development

Requires Node 18+.

```bash
npm install
npm run dev      # vite build --watch, keeps rebuilding into dist/
```

### Build

```bash
npm run build     # tsc --noEmit && vite build, output in dist/
npm run typecheck # type check only
```

### Load in Chrome

1. Open `chrome://extensions` and enable "Developer mode" in the top right.
2. Click "Load unpacked" and select this repo's `dist/` directory.
3. Click the NearPort icon in the toolbar to open the popup.

### Usage

First run → create or import a seed phrase → set a password → on the home screen, view balances, receive, send, and browse history. Under Settings you can switch networks, edit per-chain derivation paths, claim testnet tokens, open the side panel, and export the seed phrase. "Chain signatures" shows the derived multi-chain addresses and lets you sign a message.

## Project structure

```
src/
  background/index.ts          # MV3 service worker
  lib/
    account.ts                 # Account creation, implicit address, named-account discovery
    balance.ts                 # NEAR balance queries
    chainsig.ts                # Chain signatures: address derivation + message signing
    constants.ts               # Network / RPC / indexer API constants
    crypto.ts                  # Seed phrase encryption / decryption
    evm.ts                     # EVM networks + EIP-1559 send/sign/broadcast
    format.ts                  # NEAR amount formatting and parsing
    history.ts                 # Transaction history (local + indexer)
    mnemonic.ts                # Mnemonic generation and validation
    named-account.ts           # Testnet faucet named-account creation
    rpc.ts                     # JSON-RPC wrapper
    tokens.ts                  # NEP-141 token balances
    transfer.ts                # NEAR transfers
  popup/
    main.tsx / App.tsx         # Popup entry and screen routing
    useWallet.ts               # Wallet state hook (keys / accounts / network / chain paths)
    useDerivedAddresses.ts     # Chain-signature address derivation hook
    screens/                   # Welcome/Create/Import/SetPassword/Unlock/Home/
                               # Receive/Send/History/Addresses/ChainSignatures/
                               # ExportWallet/Settings
    styles/                    # Theme and form styles
public/
  manifest.json                # MV3 manifest
  icons/                       # Extension icons
scripts/generate-icons.mjs     # Icon generation script
vite.config.ts                 # Three entry points: popup / sidepanel / background
```

## Roadmap

- [x] Wallet create / import / password encryption / unlock
- [x] NEAR transfer, receive, balances, transaction history
- [x] Testnet named accounts and faucet
- [x] Multi-chain address derivation and message signing (Ethereum / Bitcoin / Zcash / Solana / Sui / TON)
- [x] Zcash transparent address (`t1`) derivation
- [x] EVM native-token transfers (Base / Arbitrum / BNB Chain, EIP-1559)
- [ ] Chain-signature transactions for the remaining chains (Bitcoin / Zcash / Solana / Sui / TON)
- [ ] Zcash transparent transactions (Zcash-specific sighash, `t1`/`t3` encoding, Zcash RPC)
- [ ] Mainnet named-account creation (fund a new `.near` account with existing NEAR)
- [ ] More chains and assets (`omni-transaction-rs` or an equivalent transaction builder)
- [ ] Shielded (`z` addresses) — not feasible: requires zk-SNARK proofs, while chain signatures can only produce ECDSA/EdDSA signatures
