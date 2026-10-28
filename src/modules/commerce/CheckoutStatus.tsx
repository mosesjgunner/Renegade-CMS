'use client'

import { useEffect, useState } from 'react'

type OrderItemView = {
  productId: string
  variantSku: string
  title: string
  quantity: number
  unitAmountMinor: string
  lineAmountMinor: string
  currency: string
}

type Status = {
  downloads?: Array<{ path: string; label: string }>
  checkout: { state: string }
  payment: { state: string; amountMinor: string; currency: string } | null
  order: {
    orderNumber: string
    state: string
    amountMinor?: string
    currency?: string
    receiptNumber: string | null
    history?: Array<{ kind: string; at: string; amountMinor: string | null }>
    refund?: { state: string; amountMinor: string } | null
    items?: OrderItemView[]
    totalsSnapshot?: {
      subtotalMinor: string
      adjustmentsTotalMinor: string
      netShippingMinor: string
      taxTotalMinor: string
      grandTotalMinor: string
      currency: string
    } | null
  } | null
}

export function CheckoutStatus({
  sessionId,
  cancelled = false,
}: {
  sessionId: string
  cancelled?: boolean
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/commerce/checkout/status?session=${encodeURIComponent(sessionId)}`,
          { cache: 'no-store', credentials: 'same-origin' },
        )
        const body = await response.json()
        if (!active) return
        if (!response.ok) {
          setError(body.error ?? 'Checkout status is unavailable.')
          if (response.status >= 500) timer = setTimeout(poll, 2000)
          return
        }
        setError('')
        setStatus(body)
        if (
          ['processing', 'unknown', 'action-required', 'initiated'].includes(body.payment?.state) ||
          (body.payment?.state === 'succeeded' && !body.order?.receiptNumber)
        )
          timer = setTimeout(poll, 2000)
      } catch {
        if (!active) return
        setError('Checkout status could not be loaded. Retrying.')
        timer = setTimeout(poll, 2000)
      }
    }
    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [sessionId])
  if (error) return <p role="alert">{error}</p>
  if (!status) return <p role="status">Checking secure payment status…</p>
  const paid = Boolean(status.order?.receiptNumber)
  return (
    <section aria-live="polite">
      <h1>
        {paid ? 'Payment confirmed' : cancelled ? 'Checkout return received' : 'Payment pending'}
      </h1>
      {paid ? (
        <>
          <p>Order {status.order?.orderNumber} is {status.order?.state}.</p>
          {status.order?.refund && <p>Refund: {status.order.refund.amountMinor} {status.order.currency} minor units ({status.order.refund.state}).</p>}
          <ul aria-label="Order history">
            {(status.order?.history ?? []).map((entry, index) => <li key={index}>{entry.kind}{entry.at ? ` ? ${entry.at}` : ''}</li>)}
          </ul>
          <p>Receipt {status.order?.receiptNumber ?? 'is being prepared'}.</p>
          {status.order?.amountMinor && status.order?.currency && (
            <p>
              Settled total: {status.order.amountMinor} {status.order.currency} minor units
            </p>
          )}
          {(status.order?.items?.length ?? 0) > 0 && (
            <ul aria-label="Order items">
              {status.order!.items!.map((item) => (
                <li key={`${item.productId}-${item.variantSku}`}>
                  {item.title} ({item.variantSku}) × {item.quantity} — {item.lineAmountMinor}{' '}
                  {item.currency} minor units
                </li>
              ))}
            </ul>
          )}
          {(status.downloads ?? []).map((file) => (
            <p key={file.path}>
              <a href={file.path}>{file.label}</a>
            </p>
          ))}
        </>
      ) : (
        <>
          <p>Server status: {status.payment?.state ?? status.checkout.state}.</p>
          <p>
            A redirect or cancel click does not change payment truth. This page will update after
            verified provider evidence arrives.
          </p>
        </>
      )}
    </section>
  )
}
