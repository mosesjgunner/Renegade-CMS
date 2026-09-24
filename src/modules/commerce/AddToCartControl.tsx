'use client'

import React, { useState } from 'react'
import Link from 'next/link'

export type AddToCartVariant = {
  sku: string
  title: string
  status?: string
  inventoryPolicy?: string
  inventoryQuantity?: number
  priceMinor: string
  currency: string
  unavailable?: boolean
}

export function AddToCartControl({
  productId,
  productName,
  variants,
  isDonation,
  donationMinimumMinor,
}: {
  productId: string
  productName: string
  variants: AddToCartVariant[]
  isDonation?: boolean
  donationMinimumMinor?: string
}) {
  const availableVariants = variants.filter((v) => !v.unavailable)
  const [selectedSku, setSelectedSku] = useState<string>(
    availableVariants[0]?.sku ?? variants[0]?.sku ?? '',
  )
  const [quantity, setQuantity] = useState<number>(1)
  const [donationAmount, setDonationAmount] = useState<string>(
    donationMinimumMinor ? (Number(donationMinimumMinor) / 100).toFixed(2) : '5.00',
  )
  const [loading, setLoading] = useState(false)
  const [announcement, setAnnouncement] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [added, setAdded] = useState(false)

  const selectedVariant = variants.find((v) => v.sku === selectedSku)
  const isOutOfStock =
    !selectedVariant ||
    selectedVariant.unavailable ||
    (selectedVariant.inventoryPolicy === 'tracked' && (selectedVariant.inventoryQuantity ?? 0) <= 0)

  async function handleAddToCart(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedVariant || isOutOfStock) return

    setLoading(true)
    setError('')
    setAnnouncement('')

    try {
      const payload: Record<string, unknown> = {
        productId,
        variantSku: selectedVariant.sku,
        quantity: isDonation ? 1 : quantity,
      }

      if (isDonation) {
        const donationMinor = Math.round(parseFloat(donationAmount) * 100).toString()
        payload.donationAmountMinor = donationMinor
      }

      const res = await fetch('/api/commerce/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add item to cart.')
      }

      setAdded(true)
      const successMsg = `Added ${selectedVariant.title || productName} to your cart.`
      setAnnouncement(successMsg)
    } catch (err: any) {
      const errMsg = err.message || 'Error adding item to cart.'
      setError(errMsg)
      setAnnouncement(errMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-surface dark:bg-zinc-900">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <form onSubmit={handleAddToCart} className="space-y-3">
        {variants.length > 1 && (
          <div>
            <label htmlFor="variant-select" className="block text-sm font-semibold mb-1">
              Select Option
            </label>
            <select
              id="variant-select"
              value={selectedSku}
              onChange={(e) => {
                setSelectedSku(e.target.value)
                setAdded(false)
                setError('')
              }}
              className="w-full rounded border p-2 bg-transparent"
              disabled={loading}
            >
              {variants.map((v) => (
                <option key={v.sku} value={v.sku} disabled={v.unavailable}>
                  {v.title} ({v.sku}) - ${(Number(v.priceMinor) / 100).toFixed(2)} {v.currency}
                  {v.unavailable ? ' [Unavailable]' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {isDonation ? (
          <div>
            <label htmlFor="donation-amount" className="block text-sm font-semibold mb-1">
              Donation Amount ({selectedVariant?.currency ?? 'USD'})
            </label>
            <input
              id="donation-amount"
              type="number"
              step="1.00"
              min={donationMinimumMinor ? (Number(donationMinimumMinor) / 100).toFixed(2) : '1.00'}
              value={donationAmount}
              onChange={(e) => setDonationAmount(e.target.value)}
              className="w-full rounded border p-2 bg-transparent"
              disabled={loading}
              required
            />
          </div>
        ) : (
          <div>
            <label htmlFor="quantity-input" className="block text-sm font-semibold mb-1">
              Quantity
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label={`Decrease quantity of ${productName}`}
                className="rounded border px-3 py-1 font-bold"
                disabled={loading || quantity <= 1}
              >
                -
              </button>
              <input
                id="quantity-input"
                type="number"
                min={1}
                max={9999}
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  if (!isNaN(val) && val >= 1) setQuantity(val)
                }}
                className="w-20 text-center rounded border p-1 bg-transparent"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(9999, q + 1))}
                aria-label={`Increase quantity of ${productName}`}
                className="rounded border px-3 py-1 font-bold"
                disabled={loading}
              >
                +
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-red-500 text-sm font-medium">
            {error}
          </p>
        )}

        {added && (
          <div
            role="status"
            className="text-green-600 text-sm font-semibold flex items-center justify-between"
          >
            <span>✓ Added to cart</span>
            <Link href="/cart" className="underline font-bold text-primary">
              View Cart →
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || isOutOfStock}
          className={`w-full py-2.5 px-4 rounded font-bold transition-colors ${
            isOutOfStock
              ? 'bg-zinc-300 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:opacity-90'
          }`}
          aria-label={
            isOutOfStock ? `${productName} is currently unavailable` : `Add ${productName} to cart`
          }
        >
          {loading ? 'Adding...' : isOutOfStock ? 'Unavailable' : 'Add to Cart'}
        </button>
      </form>
    </div>
  )
}
