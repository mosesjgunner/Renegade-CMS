'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { parseMoneyToMinor } from './catalog'

/**
 * RC3-20 SHOP-UX Pass 07 — commerce blocks for the page builder.
 *
 * Every block references canonical catalog records by ID (or a category /
 * collection reference) and reads live price and availability from
 * /api/catalog at render time. Layout JSON stores ONLY the reference and
 * display options — never a price, never inventory — so a theme switch or
 * a price change can never leave a stale authoritative value in a layout.
 */

export type BlockProduct = {
  id: string
  name: string
  path: string
  kind: string
  summary: string | null
  currency: string
  featured: boolean
  price: string
  priceMinor: string | null
  available: boolean
  defaultVariantSku: string | null
  recurring: { interval: string; intervalCount: number } | null
  donationMinimumMinor: string | null
}

function useCatalog(query: string) {
  const [products, setProducts] = useState<BlockProduct[]>([])
  const [message, setMessage] = useState('Loading…')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/catalog?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Catalog unavailable.')
        const body = await response.json()
        setProducts(body.products ?? [])
        setMessage(body.products?.length ? '' : 'Nothing to show yet.')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setMessage('Catalog unavailable.')
      })
    return () => controller.abort()
  }, [query])
  return { products, message }
}

function BlockCard({ product, children }: { product: BlockProduct; children?: React.ReactNode }) {
  return (
    <article className="rounded border p-4 space-y-2">
      <h4 className="font-bold">
        <Link href={product.path}>{product.name}</Link>
      </h4>
      {product.summary ? <p className="text-sm">{product.summary}</p> : null}
      <p className="font-semibold">
        {product.price}
        {product.recurring
          ? ` · renews every ${product.recurring.intervalCount} ${product.recurring.interval}${product.recurring.intervalCount === 1 ? '' : 's'}`
          : ''}
      </p>
      <p className="text-sm">{product.available ? 'Available' : 'Unavailable'}</p>
      {children}
    </article>
  )
}

export function CommerceProductCardBlock({ productId }: { productId: string }) {
  const { products, message } = useCatalog(`id=${encodeURIComponent(productId)}`)
  const product = products[0]
  return (
    <div aria-live="polite">{product ? <BlockCard product={product} /> : <p>{message}</p>}</div>
  )
}

export function CommerceFeaturedProductBlock({ productId }: { productId: string }) {
  const { products, message } = useCatalog(`id=${encodeURIComponent(productId)}`)
  const product = products[0]
  return (
    <div aria-live="polite">
      {product ? (
        <div className="rounded border-2 border-primary p-4">
          <p className="text-xs font-bold uppercase tracking-wide">Featured</p>
          <BlockCard product={product}>
            <Link href={product.path} className="underline font-semibold text-sm">
              View product →
            </Link>
          </BlockCard>
        </div>
      ) : (
        <p>{message}</p>
      )}
    </div>
  )
}

export function CommerceProductGridBlock({
  category,
  limit,
  featuredOnly,
}: {
  category?: string
  limit?: number
  featuredOnly?: boolean
}) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (limit) params.set('limit', String(limit))
  if (featuredOnly) params.set('featured', '1')
  const { products, message } = useCatalog(params.toString())
  return (
    <div aria-live="polite">
      {message ? <p>{message}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {products.map((product) => (
          <BlockCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}

export function CommerceCollectionGridBlock({ collectionId }: { collectionId: string }) {
  const { products, message } = useCatalog(`collection=${encodeURIComponent(collectionId)}`)
  return (
    <div aria-live="polite">
      {message ? <p>{message}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {products.map((product) => (
          <BlockCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}

export function CommerceBuyButtonBlock({
  productId,
  label,
}: {
  productId: string
  label?: string
}) {
  const { products, message } = useCatalog(`id=${encodeURIComponent(productId)}`)
  const [state, setState] = useState('')
  const product = products[0]
  if (!product) return <p aria-live="polite">{message}</p>
  const buttonLabel = label || `Buy ${product.name}`
  // Donation and affiliate products need their own product-page flow
  // (amount choice / seller handoff); the button links there instead of
  // pretending a one-click add is correct for them.
  if (!product.defaultVariantSku || ['donation', 'affiliate'].includes(product.kind)) {
    return (
      <Link
        href={product.path}
        className="inline-block px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded"
      >
        {buttonLabel} — {product.price}
      </Link>
    )
  }
  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        disabled={!product.available}
        onClick={async () => {
          setState('Adding…')
          try {
            const response = await fetch('/api/commerce/cart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: product.id,
                variantSku: product.defaultVariantSku,
                quantity: 1,
              }),
            })
            if (!response.ok) throw new Error('Could not add to cart.')
            setState('Added to cart.')
          } catch {
            setState('Could not add to cart.')
          }
        }}
        className="px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded disabled:opacity-50"
      >
        {buttonLabel} — {product.price}
      </button>
      <span role="status" className="text-sm">
        {state}
      </span>
    </span>
  )
}

export function CommerceCartIndicatorBlock() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/commerce/cart', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return
        const body = await response.json()
        const items = body.cart?.items ?? []
        setCount(items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0))
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])
  return (
    <Link href="/cart" className="font-semibold underline" aria-label={`Cart, ${count ?? 0} items`}>
      Cart{count !== null ? ` (${count})` : ''}
    </Link>
  )
}

export function CommerceMembershipCardBlock({ productId }: { productId: string }) {
  const { products, message } = useCatalog(`id=${encodeURIComponent(productId)}`)
  const product = products[0]
  return (
    <div aria-live="polite">
      {product ? (
        <BlockCard product={product}>
          <Link href={product.path} className="underline font-semibold text-sm">
            See membership details →
          </Link>
        </BlockCard>
      ) : (
        <p>{message}</p>
      )}
    </div>
  )
}

export function CommerceDonationCardBlock({ productId }: { productId: string }) {
  const { products, message } = useCatalog(`id=${encodeURIComponent(productId)}`)
  const [amount, setAmount] = useState('10.00')
  const [state, setState] = useState('')
  const product = products[0]
  if (!product) return <p aria-live="polite">{message}</p>
  return (
    <div className="rounded border p-4 space-y-3">
      <h4 className="font-bold">{product.name}</h4>
      {product.summary ? <p className="text-sm">{product.summary}</p> : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!product.defaultVariantSku) {
            setState('Donations are not available for this item right now.')
            return
          }
          try {
            const donationAmountMinor = parseMoneyToMinor(amount, product.currency)
            const response = await fetch('/api/commerce/cart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: product.id,
                variantSku: product.defaultVariantSku,
                quantity: 1,
                donationAmountMinor,
              }),
            })
            if (!response.ok) throw new Error('Could not add donation.')
            setState('Added to your cart — complete your donation at checkout.')
          } catch (error) {
            setState(error instanceof Error ? error.message : 'Could not add donation.')
          }
        }}
      >
        <label className="text-sm font-semibold">
          Amount ({product.currency})
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="block rounded border p-2 mt-1 bg-transparent"
            required
          />
        </label>
        <button
          type="submit"
          className="px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded"
        >
          Donate
        </button>
      </form>
      {state ? (
        <p role="status" className="text-sm">
          {state}
        </p>
      ) : null}
    </div>
  )
}
