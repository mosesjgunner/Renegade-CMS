'use client'

import { useEffect, useState } from 'react'

type Status = {
  checkout: { state: string }
  payment: { state: string; amountMinor: string; currency: string } | null
  order: { orderNumber: string; state: string; receiptNumber: string | null } | null
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
      const response = await fetch(
        `/api/commerce/checkout/status?session=${encodeURIComponent(sessionId)}`,
        { cache: 'no-store', credentials: 'same-origin' },
      )
      const body = await response.json()
      if (!active) return
      if (!response.ok) return setError(body.error ?? 'Checkout status is unavailable.')
      setStatus(body)
      if (['processing', 'unknown', 'action-required', 'initiated'].includes(body.payment?.state))
        timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [sessionId])
  if (error) return <p role="alert">{error}</p>
  if (!status) return <p role="status">Checking secure payment status…</p>
  const paid = status.payment?.state === 'succeeded' && status.order
  return (
    <section aria-live="polite">
      <h1>
        {paid ? 'Payment confirmed' : cancelled ? 'Checkout return received' : 'Payment pending'}
      </h1>
      {paid ? (
        <>
          <p>Order {status.order?.orderNumber} is paid.</p>
          <p>Receipt {status.order?.receiptNumber ?? 'is being prepared'}.</p>
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
