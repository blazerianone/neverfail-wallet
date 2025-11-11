// src/entrypoints/sidepanel/app.tsx
import '@/polyfills/buffer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDbService } from '@workspace/background/services/db'
import { derivationPaths } from '@workspace/keypair/derivation-paths'
import { generateMnemonic } from '@workspace/keypair/generate-mnemonic'
import { Button } from '@workspace/ui/components/button'
import { ellipsify } from '@workspace/ui/lib/ellipsify'
import { Home, History, Settings, ExternalLink, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { setPremiumMode, getConnection } from '@/lib/solana'
import {
  Connection,
  PublicKey,
  Transaction,
  type ConfirmedSignatureInfo
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token'
import { getSignService } from '@workspace/background/services/sign'
import { ensureUint8Array } from '@workspace/keypair/ensure-uint8array'

async function ensureAtaIxIfMissing(
  conn: Connection,
  ata: PublicKey,
  owner: PublicKey,
  payer: PublicKey,
  mint: PublicKey,
) {
  const info = await conn.getAccountInfo(ata)
  if (!info) {
    return createAssociatedTokenAccountInstruction(payer, ata, owner, mint)
  }
  return null
}

export function App() {
  const queryClient = useQueryClient()
  const [isPremium, setIsPremium] = useState(false)
  const [currentRPC, setCurrentRPC] = useState('https://api.devnet.solana.com')
  const [activeTab, setActiveTab] = useState<'home' | 'activity' | 'settings'>('home')
  const [copied, setCopied] = useState(false);

  const { mutateAsync } = useMutation({
    mutationFn: async () => {
      const result = await getDbService().wallet.createWithAccount({
        derivationPath: derivationPaths.default,
        mnemonic: generateMnemonic(),
        name: 'My Wallet',
        secret: '',
      })
      await queryClient.invalidateQueries({ queryKey: ['account', 'active'] })
      return result
    },
  })

  const { data: active } = useQuery({
    queryFn: async () => await getDbService().account.active(),
    queryKey: ['account', 'active'],
  })

  const { data: recentTxs } = useQuery({
    queryFn: async () => {
      const conn = new Connection(currentRPC)
      return await conn.getSignaturesForAddress(new PublicKey(active.publicKey), { limit: 10 })
    },
    queryKey: ['recentTxs', active?.publicKey, currentRPC],
    enabled: !!active && activeTab === 'activity',
  })

  const togglePremium = async () => {
    const newPremium = !isPremium
    setIsPremium(newPremium)
    setPremiumMode(newPremium)

    if (newPremium) {
      try {
        const conn = getConnection()
        await conn.getSlot()
      } catch (e: any) {
        if (e.message?.includes('402')) {
          // PAYMENT FLOW (100% working)
          const rpcBody = JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'getSlot' })
          const response = await fetch('https://x402-neverfail.blockforge.live/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rpcBody,
          })
          const data = await response.json()
          const payment = data.accepts[0]

          const conn = new Connection('https://api.devnet.solana.com')
          const { blockhash } = await conn.getLatestBlockhash()

          const sender = new PublicKey(active.publicKey)
          const recipient = new PublicKey(payment.payTo)
          const usdcMint = new PublicKey(payment.asset)
          const amount = 100n

          const [senderATA, recipientATA] = await Promise.all([
            getAssociatedTokenAddress(usdcMint, sender),
            getAssociatedTokenAddress(usdcMint, recipient)
          ])

          const tx = new Transaction()
          tx.recentBlockhash = blockhash
          tx.feePayer = sender

          const createSenderIx = await ensureAtaIxIfMissing(conn, senderATA, sender, sender, usdcMint)
          if (createSenderIx) tx.add(createSenderIx)
          const createRecipientIx = await ensureAtaIxIfMissing(conn, recipientATA, recipient, sender, usdcMint)
          if (createRecipientIx) tx.add(createRecipientIx)

          tx.add(createTransferInstruction(senderATA, recipientATA, sender, amount))

          const serializedTx = tx.serialize({ requireAllSignatures: false })

          const walletAccount: any = {
            address: active.publicKey,
            publicKey: new PublicKey(active.publicKey).toBytes(),
            chains: ['solana:devnet'] as const,
            features: ['solana:signTransaction'] as const,
          }

          const signInput: any = {
            account: walletAccount,
            chain: 'solana:devnet',
            transaction: new Uint8Array(serializedTx),
          }

          const outputs = await getSignService().signTransaction([signInput])
          const signedBytes = ensureUint8Array(outputs[0].signedTransaction)

          const xPayment = Buffer.from(JSON.stringify({
            x402Version: 1,
            payload: { serializedTransaction: Buffer.from(signedBytes).toString('base64') }
          })).toString('base64')

          const payResponse = await fetch('https://x402-neverfail.blockforge.live/rpc', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Payment': xPayment
            },
            body: rpcBody,
          })

          const payData = await payResponse.json()
          if (payResponse.ok) {
            if (payData.premiumRpcUrl) setCurrentRPC(payData.premiumRpcUrl)
            alert('PREMIUM RPC ACTIVATED! You paid 0.0001 USDC')
          }
        }
      }
    }
  }

  const testRPC = async () => {
    try {
      const conn = new Connection(currentRPC)
      const slot = await conn.getSlot()
      alert(`Premium RPC Test Success!\nLatest Slot: ${slot}`)
    } catch (err) {
      alert('Test failed')
    }
  }

  const openUsdcFaucet = () => {
    window.open("https://faucet.circle.com/", "_blank", "noopener,noreferrer");
  };

  const openSolFaucet = () => {
    window.open("https://solfaucet.com/", "_blank", "noopener,noreferrer");
  };


  const handleCopy = async () => {
    const full = String(active?.publicKey || "");
    if (!full) return;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      // toast({ title: "Copied", description: "Wallet address copied to clipboard." });
    } catch (e) {
      // toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-950 p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">NeverFail Wallet</h1>
          {active ? (
            <div className="flex items-center gap-2">
              <div className="text-sm font-mono bg-gray-800 px-3 py-1 rounded">
                {ellipsify(active?.publicKey || '', 6)}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopy}
                className="h-8 px-2 bg-gray-800 hover:bg-gray-700 text-gray-200"
                title={copied ? "Copied!" : "Copy wallet address"}
                aria-label="Copy wallet address"
              >
                {copied ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Copied</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Copy</span>
                  </span>
                )}
              </Button>
            </div>
          ) : <Button onClick={async () => await mutateAsync()}>Create Wallet</Button>}
        </div>
      </div>
      {active &&
        <>
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex-1 py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all ${activeTab === 'home' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500'}`}
            >
              <Home size={18} /> Home
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex-1 py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all ${activeTab === 'activity' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500'}`}
            >
              <History size={18} /> Activity
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all ${activeTab === 'settings' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500'}`}
            >
              <Settings size={18} /> Settings
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            {activeTab === 'home' && (
              <>
                {/* Boost Section - Smaller, No Icons */}
                <div className="bg-gray-800 rounded-2xl p-5 space-y-4">
                  <div className="text-center">
                    <h2 className="text-xl font-bold">Boost My Transaction</h2>
                    <p className="text-sm text-gray-400 mt-2">
                      Get premium RPC for your next transaction<br />
                      Pay 0.0001 USDC per call • No subscription
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <span className="text-sm text-gray-400">OFF</span>
                    <button
                      onClick={togglePremium}
                      className={`w-14 h-8 rounded-full relative transition-all ${isPremium ? 'bg-green-500' : 'bg-gray-600'}`}
                    >
                      <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all ${isPremium ? 'right-1' : 'left-1'}`} />
                    </button>
                    <span className="text-sm text-gray-400">ON</span>
                  </div>

                  {isPremium && (
                    <div className="text-center space-y-2">
                      <p className="text-green-400 font-bold text-lg">X402 Auto-Pay ENABLED</p>
                      <p className="text-xs text-gray-300">
                        Current RPC:
                      </p>
                      <p className="text-xs font-mono bg-gray-900 px-3 py-1 rounded break-all">
                        {currentRPC}
                      </p>
                    </div>
                  )}
                </div>

                {/* Test Button - Clean Purple */}
                {isPremium && (
                  <button
                    onClick={testRPC}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all"
                  >
                    Test Premium RPC (Get Latest Slot)
                  </button>
                )}
              </>
            )}

            {activeTab === 'activity' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-center">Recent Activity</h2>
                {recentTxs?.length ? (
                  recentTxs.map((tx: ConfirmedSignatureInfo) => (
                    <div key={tx.signature} className="bg-gray-800 rounded-xl p-4 space-y-2">
                      <div className="text-sm font-mono">{ellipsify(tx.signature, 16)}</div>
                      <div className="text-xs text-gray-400">Slot: {tx.slot}</div>
                      <a
                        href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 text-xs hover:underline block"
                      >
                        View on Solana Explorer
                      </a>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-12">No transactions yet</p>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="text-center py-16">
                <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  NeverFail Wallet
                </p>
                <p className="text-gray-400 mt-4">Pay-Per-RPC for Everyone</p>
                <p className="text-purple-400 font-bold mt-2">November 2025</p>
              </div>
            )}
          </div>
        </>
      }
      {/* Footer */}
      <div className="border-t border-gray-800 p-4 text-xs text-gray-400">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Network: <span className="font-mono text-gray-300">devnet</span>
          </span>
          {active &&
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={openSolFaucet}
                className="h-8 px-3 bg-gray-800 hover:bg-gray-700 text-gray-200"
                title="Open SOL faucet"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ExternalLink className="h-4 w-4" />
                  SOL faucet
                </span>
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={openUsdcFaucet}
                className="h-8 px-3 bg-gray-800 hover:bg-gray-700 text-gray-200"
                title="Open USDC faucet"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ExternalLink className="h-4 w-4" />
                  USDC faucet
                </span>
              </Button>
            </div>
          }
        </div>


      </div>

    </div>
  )
}