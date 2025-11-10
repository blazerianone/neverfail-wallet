### `README.md` (Wallet repo)

````markdown
# Solana × x402 Auto-Pay Wallet (Pay-per-RPC)

A developer-friendly Solana wallet that adds **x402 Pay-per-RPC** to a modern open-source wallet UI.  
Solve failed transactions during congestion by letting users **buy premium RPC access only when they need it**—no monthly plans required.

> **Live facilitator (devnet):** `https://x402-neverfail.blockforge.live/rpc`

<p align="center">
  <a href="https://solana.com/x402/hackathon#resources">
    <picture>
      <source srcset="logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="logo-light.svg" alt="Project logo" height="84">
    </picture>
  </a>
</p>

<p align="center">Pay-per-RPC wallet for the Solana x402 Hackathon</p>

<p align="center">
  <a href="https://solana.com/x402/hackathon#resources">
    <img alt="Hackathon" src="https://img.shields.io/badge/Solana-x402%20Hackathon-9945FF?style=flat-square" />
  </a>
  <a href="https://github.com/your-org/your-repo/actions/workflows/ci.yaml">
    <img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/your-org/your-repo/ci.yaml?style=flat-square&branch=main" />
  </a>
</p>

[![Wallet UI](demo.gif)](#)

---

## Why (Pain Points)

- During **network congestion**, transactions sent over **public RPC** often fail or time out.  
- Most retail users **don’t want a monthly private RPC plan** just to be safe a few times per month.  
- We add a **one-click, pay-per-use** option directly inside the wallet using **x402**.

**Flow:** User toggles **Premium RPC**, pays once via on-chain USDC (devnet) when challenged, enjoys low-latency RPC for the next important action (mint/sale/transfer), then the wallet **auto-resets to public RPC**.

---

## Features

- 🔁 **x402 Pay-per-RPC**: challenge–response payments in **USDC (devnet)** to unlock premium RPC.
- ⚙️ **Auto-pay wrapper**: detects HTTP **402**, builds & signs the exact payment tx (from `accepts`), retries with `X-Payment`.
- 🔐 **Wallet-native signing**: uses the in-extension sign service; optional approval gates / caps.
- 🧰 Built on a modern, open-source Solana wallet codebase (see **Credits**).

---

## Requirements

- **Node** (LTS) with **FNM** or **NVM**
- **Bun** (for workspace scripts)
- Chrome/Chromium (load the extension in dev mode)

---

## Quick Start (Dev)

```bash
git clone https://github.com/blazerianone/neverfail-wallet.git
cd neverfail-wallet
fnm use        # or: nvm use
bun install

# run the web/extension app in dev
bun dev        # or: bun --filter=<app-name> dev
````

Load the extension/build per the original wallet instructions.

---

## Configuration

Point the wallet to your **x402 facilitator**:

```ts
// src/lib/solana.ts
export const FACILITATOR_URL = 'https://x402-neverfail.blockforge.live/rpc'
```

The wallet uses:

* **Public devnet RPC** by default
* **Premium RPC** (facilitator URL) when users **Enable Premium**

When the facilitator responds with **HTTP 402**, the wallet:

1. Parses the **`accepts`** object (USDC mint, amount, receiver).
2. Builds the exact **USDC transfer** transaction.
3. **Signs** it in-wallet.
4. Retries the RPC with an **`X-Payment`** header containing the signed payment bytes.

If the facilitator returns a serialized challenge tx, the wallet signs it verbatim.

---

## Usage (Demo Buttons)

Inside the side panel:

* **Enable Boost My Transaction** – triggers a probe; facilitator replies **402** with `accepts`; wallet auto-builds the USDC payment & retries, activating premium access.

> This project targets **devnet**. Airdrop SOL for fees and fund USDC for testing.

---

## How x402 Works (High-Level)

```
Wallet → POST /rpc
         ← 402 { accepts: [{ asset: <USDC mint>, payTo, maxAmountRequired, ... }] }

Wallet builds USDC transfer (exact recipe)
Wallet signs → adds X-Payment: base64(JSON{ x402Version, payload: { serializedTransaction } })
             → Facilitator verifies on-chain payment
             → Proxies original RPC to premium upstream
             ← RPC JSON (success) (+ optional paymentSignature)
```

---
 a **tiny architecture diagram** (SVG) and a **CI YAML** for lint/build so the badges work out-of-the-box?
```
