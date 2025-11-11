// apps/extension/src/polyfills/buffer.ts
import { Buffer } from 'buffer'

if (typeof globalThis.Buffer === 'undefined') {
  ;(globalThis as any).Buffer = Buffer
}

// Export so it runs on load
export {}