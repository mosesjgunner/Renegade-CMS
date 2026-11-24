'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatMinorMoney } from '@/modules/commerce/catalog'

type MemberOrder = {
  id: string
  orderNumber: string
  state: string
  amountMinor: string
  currency: string
  createdAt: string
  receiptNumber: string | null
  sessionId: string
  itemCount: number
}

export default function MemberOrdersPage() {
  const [orders, setOrders] = useState<MemberOrder[] | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void fetch('/api/commerce/orders')
      .then(async (response) => {
        if (response.status === 401) {
          setMessage('Sign in to see your orders.')
          setOrders([])
          return
        }
        if (!response.ok) throw new Error('Orders unavailable.')
        const data = await response.json()
        setOrders(data.orders ?? [])
      })
      .catch(() => {
        setMessage('Your orders could not be loaded.')
        setOrders([])
      })
  }, [])

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-black">Your orders</h1>
      {message ? <p role="alert">{message}</p> : null}
      {orders === null ? (
        <p role="status">Loading your orders…</p>
      ) : orders.length === 0 ? (
        <p>
          No orders yet.{' '}
          <Link href="/store" className="underline font-semibold">
            Browse the store →
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="rounded border p-4 flex justify-between gap-4">
              <div>
                <p className="font-bold">
                  <Link
                    className="underline"
                    href={`/checkout/return?session=${encodeURIComponent(order.sessionId)}`}
                  >
                    Order {order.orderNumber}
                  </Link>
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString()} · {order.itemCount}{' '}
                  {order.itemCount === 1 ? 'item' : 'items'} · {order.state}
                  {order.receiptNumber ? ` · Receipt ${order.receiptNumber}` : ''}
                </p>
              </div>
              <p className="font-semibold">{formatMinorMoney(order.amountMinor, order.currency)}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
