'use client'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export function PosQr({ uri }: { uri: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg)
  }, [uri])
  return (
    <div
      aria-label="Crypto payment QR code"
      className="bg-white p-3 rounded"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
export default function POS() {
  const [note, setNote] = useState('')
  const [tip, setTip] = useState('0')
  const [status, setStatus] = useState('awaiting_payment')
  return (
    <main className="mx-auto max-w-md min-h-dvh p-4 space-y-4">
      <header>
        <h1 className="text-2xl font-black">Point of sale</h1>
        <p className="text-sm">
          Choose products, then generate a payment-intent-bound crypto invoice.
        </p>
      </header>
      <section className="grid grid-cols-2 gap-2">
        <button className="surface-card p-4 text-left">Products</button>
        <button className="surface-card p-4 text-left">Categories</button>
      </section>
      <section className="surface-card p-4 space-y-3">
        <label className="block">
          Customer note
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border rounded p-2"
          />
        </label>
        <label className="block">
          Tip
          <input
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            inputMode="decimal"
            className="w-full border rounded p-2"
          />
        </label>
        <p className="text-sm">
          Status: <strong>{status}</strong>
        </p>
        <button onClick={() => setStatus('awaiting_payment')} className="btn">
          Generate crypto invoice
        </button>
        <button onClick={() => setStatus('cancelled')} className="btn">
          Cancel before payment
        </button>
      </section>
    </main>
  )
}
