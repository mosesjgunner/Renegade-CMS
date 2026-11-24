'use client'

import { useEffect, useState } from 'react'
import { formatMinorMoney } from './catalog'

/** Buyer-readable money: never show raw minor units to a customer. */
function money(amountMinor: string | undefined, currency: string | undefined): string {
  if (!amountMinor || !currency || !/^[A-Z]{3}$/.test(currency)) return ''
  try {
    return formatMinorMoney(amountMinor, currency)
  } catch {
    return ''
  }
}

const PAYMENT_STATE_LABELS: Record<string, string> = {
  initiated: 'started',
  'action-required': 'waiting for you to complete payment',
  processing: 'processing',
  unknown: 'being confirmed',
  succeeded: 'confirmed',
  failed: 'failed',
  cancelled: 'cancelled',
}

type OrderItemView = {
  productId: string
  variantSku: string
  title: string
  quantity: number
  unitAmountMinor: string
  lineAmountMinor: string
  currency: string
}

const SHIPMENT_STATE_LABELS: Record<string, string> = {
  pending_acknowledgement: 'being prepared',
  acknowledged: 'being prepared',
  in_production: 'in production',
  production: 'in production',
  submitted: 'submitted to the maker',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  failed: 'needs attention',
}

const GROUP_LABELS: Record<string, string> = {
  physical: 'Parcel delivery',
  digital: 'Digital delivery',
  pod: 'Made to order',
  dropship: 'Shipped by the supplier',
  referral: 'Bought at the seller’s site',
}

const humanizeKind = (kind: string) => kind.replace(/^(order|payment)-/, '').replace(/[-_]/g, ' ')

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
    fulfillment?: {
      groups: Array<{ kind: string; itemCount: number; state: string | null }>
      shipments: Array<{
        label: string
        status: string
        carrier: string | null
        trackingNumber: string | null
        trackingUrl: string | null
        shippedAt: string | null
      }>
    } | null
  } | null
}

type PolicyLink = { type: string; title: string; href: string }

export function CheckoutStatus({
  sessionId,
  cancelled = false,
}: {
  sessionId: string
  cancelled?: boolean
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [policies, setPolicies] = useState<PolicyLink[]>([])
  useEffect(() => {
    fetch('/api/commerce/policies')
      .then(async (response) => {
        if (response.ok) setPolicies((await response.json()).policies ?? [])
      })
      .catch(() => undefined)
  }, [])
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
          <p>
            Order {status.order?.orderNumber} is {status.order?.state}.
          </p>
          {status.order?.refund && (
            <p>
              Refund: {money(status.order.refund.amountMinor, status.order.currency)} (
              {status.order.refund.state}).
            </p>
          )}
          <h2>Order timeline</h2>
          <ul aria-label="Order history">
            {(status.order?.history ?? []).map((entry, index) => (
              <li key={index}>
                {humanizeKind(entry.kind)}
                {entry.at ? ` · ${new Date(entry.at).toLocaleString()}` : ''}
              </li>
            ))}
          </ul>
          <p>Receipt {status.order?.receiptNumber ?? 'is being prepared'}.</p>
          {status.order?.totalsSnapshot ? (
            <>
              <h2>Receipt</h2>
              <dl aria-label="Itemized totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>
                    {money(
                      status.order.totalsSnapshot.subtotalMinor,
                      status.order.totalsSnapshot.currency,
                    )}
                  </dd>
                </div>
                {BigInt(status.order.totalsSnapshot.adjustmentsTotalMinor) > 0n && (
                  <div>
                    <dt>Discounts</dt>
                    <dd>
                      −
                      {money(
                        status.order.totalsSnapshot.adjustmentsTotalMinor,
                        status.order.totalsSnapshot.currency,
                      )}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Shipping</dt>
                  <dd>
                    {money(
                      status.order.totalsSnapshot.netShippingMinor,
                      status.order.totalsSnapshot.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>
                    {money(
                      status.order.totalsSnapshot.taxTotalMinor,
                      status.order.totalsSnapshot.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Total paid</dt>
                  <dd>
                    {money(
                      status.order.totalsSnapshot.grandTotalMinor,
                      status.order.totalsSnapshot.currency,
                    )}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            status.order?.amountMinor &&
            status.order?.currency && (
              <p>Total paid: {money(status.order.amountMinor, status.order.currency)}</p>
            )
          )}
          {(status.order?.items?.length ?? 0) > 0 && (
            <ul aria-label="Order items">
              {status.order!.items!.map((item) => (
                <li key={`${item.productId}-${item.variantSku}`}>
                  {item.title} ({item.variantSku}) × {item.quantity} —{' '}
                  {money(item.lineAmountMinor, item.currency)}
                </li>
              ))}
            </ul>
          )}
          {status.order?.fulfillment?.groups.length ||
          status.order?.fulfillment?.shipments.length ? (
            <>
              <h2>Delivery</h2>
              <ul aria-label="Fulfillment groups">
                {status.order.fulfillment.groups.map((group, index) => (
                  <li key={index}>
                    {GROUP_LABELS[group.kind] ?? group.kind} — {group.itemCount}{' '}
                    {group.itemCount === 1 ? 'item' : 'items'}
                    {group.state === 'referred' ? ' (completed at the seller’s site)' : ''}
                  </li>
                ))}
              </ul>
              {status.order.fulfillment.shipments.length ? (
                <ul aria-label="Shipments">
                  {status.order.fulfillment.shipments.map((shipment, index) => (
                    <li key={index}>
                      {shipment.label}: {SHIPMENT_STATE_LABELS[shipment.status] ?? shipment.status}
                      {shipment.trackingNumber ? (
                        <>
                          {' '}
                          · {shipment.carrier ? `${shipment.carrier} ` : ''}tracking{' '}
                          {shipment.trackingUrl ? (
                            <a href={shipment.trackingUrl}>{shipment.trackingNumber}</a>
                          ) : (
                            shipment.trackingNumber
                          )}
                        </>
                      ) : null}
                      {shipment.shippedAt
                        ? ` · shipped ${new Date(shipment.shippedAt).toLocaleDateString()}`
                        : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
          {(status.downloads ?? []).map((file) => (
            <p key={file.path}>
              <a href={file.path}>{file.label}</a>
            </p>
          ))}
          {policies.filter((policy) => ['returns', 'shipping'].includes(policy.type)).length ? (
            <>
              <h2>Help with this order</h2>
              <ul aria-label="Seller policies">
                {policies
                  .filter((policy) => ['returns', 'shipping'].includes(policy.type))
                  .map((policy) => (
                    <li key={policy.type}>
                      <a href={policy.href}>{policy.title}</a>
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <>
          <p>
            Payment status:{' '}
            {PAYMENT_STATE_LABELS[status.payment?.state ?? status.checkout.state] ??
              status.payment?.state ??
              status.checkout.state}
            .
          </p>
          <p>
            If you have completed payment, this page updates automatically once your payment is
            confirmed.
          </p>
        </>
      )}
    </section>
  )
}
