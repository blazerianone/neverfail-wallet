// src/lib/solana.ts
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getDbService } from '@workspace/background/services/db'

const FACILITATOR_URL = 'https://x402-neverfail.blockforge.live/rpc'
let isPremium = false

let customFetch: typeof fetch = fetch

export const setPremiumMode = (enabled: boolean, premiumUrl?: string) => {
  isPremium = enabled

  if (enabled && premiumUrl) {
    customFetch = async (input: any, init?: any) => {
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
      const wallet = await getDbService().wallet.get(activeAccount!.walletId)

      const tx = new Transaction()
      const usdcMint = new PublicKey(req.token)
      const recipient = new PublicKey(req.recipient)
      const amount = BigInt(req.maxAmountRequired)

      const senderATA = await getAssociatedTokenAddress(usdcMint, wallet.publicKey!)
      const recipientATA = await getAssociatedTokenAddress(usdcMint, recipient)

      tx.add(
        createTransferInstruction(
          senderATA,
          recipientATA,
          wallet.publicKey!,
          amount
        )
      )

      // Sign with wallet
      const signedTx = await wallet.signTransaction(tx)
      const serialized = signedTx.serialize()

      // Retry with X-Payment header
      return fetch(input, {
        ...init,
        headers: {
          ...init?.headers,
          'X-Payment': JSON.stringify({
            version: 1,
            payload: {
              serializedTransaction: serialized.toString('base64')
            }
          })
        }
      })
    }
  } else {
    customFetch = fetch
  }
}

export const getConnection = (): Connection => {
  return new Connection(
    isPremium ? FACILITATOR_URL : 'https://api.devnet.solana.com',
    'confirmed',
    { fetch: customFetch }
  )
}
