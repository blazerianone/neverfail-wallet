// src/lib/solana.ts

import { createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { getDbService } from '@workspace/background/services/db'

const FACILITATOR_URL = 'https://x402.neverfailwallet.com/rpc'
let isPremium = false

let customFetch: typeof fetch | undefined

export const setPremiumMode = (enabled: boolean, premiumUrl?: string) => {
  isPremium = enabled

  if (enabled && premiumUrl) {
    customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url
      if (!url.includes(FACILITATOR_URL)) return fetch(input, init)

      // First call → gets 402
      const resp = await fetch(input, init)
      if (resp.status !== 402) return resp

      const data = await resp.json()
      const req = data.paymentRequirements

      console.log('X402: Paying 0.0001 USDC to unlock premium RPC...')

      // Build USDC transfer
      const activeAccount = await getDbService().account.active()
      if (!activeAccount?.walletId) throw new Error('No active wallet')
      const wallet = await getDbService().wallet.get(activeAccount.walletId)
      if (!wallet?.publicKey) throw new Error('No wallet public key')

      const tx = new Transaction()
      const usdcMint = new PublicKey(req.token)
      const recipient = new PublicKey(req.recipient)
      const amount = BigInt(req.maxAmountRequired)

      const senderATA = await getAssociatedTokenAddress(usdcMint, new PublicKey(wallet.publicKey))
      const recipientATA = await getAssociatedTokenAddress(usdcMint, recipient)

      tx.add(createTransferInstruction(senderATA, recipientATA, new PublicKey(wallet.publicKey), amount))

      // Sign with wallet
      const signedTx = await wallet.signTransaction(tx)
      const serialized = signedTx.serialize()

      // Retry with X-Payment header
      return fetch(input, {
        ...init,
        headers: {
          ...init?.headers,
          'X-Payment': JSON.stringify({
            payload: { serializedTransaction: serialized.toString('base64') },
            version: 1,
          }),
        },
      })
    }
  } else {
    customFetch = fetch
  }
}

export const getConnection = (): Connection => {
  return new Connection(isPremium ? FACILITATOR_URL : 'https://api.devnet.solana.com', 'confirmed', {
    fetch: customFetch,
  })
}
