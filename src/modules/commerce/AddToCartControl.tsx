'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatMinorMoney, minorMoneyDecimal, parseMoneyToMinor } from './catalog'

export type AddToCartVariant = {
  sku: string
  title: string
  status?: string
  inventoryPolicy?: string
  inventoryQuantity?: number
  priceMinor: string
  currency: string
  unavailable?: boolean
  optionValues?: Record<string, string>
}

export type AddToCartDimension = { key: string; label: string; values: readonly string[] }

export function AddToCartControl({
  productId,
  productName,
  variants,
  optionDimensions,
  isDonation,
  donationMinimumMinor,
}: {
  productId: string
  productName: string
  variants: AddToCartVariant[]
  optionDimensions?: readonly AddToCartDimension[]
  isDonation?: boolean
  donationMinimumMinor?: string
}) {
  const availableVariants = variants.filter((v) => !v.unavailable)
  const dimensions = useMemo(
    () =>
      (optionDimensions ?? []).filter(
        (dimension) =>
          dimension.values?.length && variants.some((v) => v.optionValues?.[dimension.key]),
      ),
    [optionDimensions, variants],
  )
  const useDimensions = dimensions.length > 0
  const [selectedSku, setSelectedSku] = useState<string>(
    availableVariants[0]?.sku ?? variants[0]?.sku ?? '',
  )
  const [optionSelection, setOptionSelection] = useState<Record<string, string>>(() => {
    const first = availableVariants[0] ?? variants[0]
    const initial: Record<string, string> = {}
    for (const dimension of dimensions)
      if (first?.optionValues?.[dimension.key])
        initial[dimension.key] = first.optionValues[dimension.key]
    return initial
  })
  const dimensionVariant = useDimensions
    ? variants.find((v) =>
        dimensions.every(
          (dimension) => v.optionValues?.[dimension.key] === optionSelection[dimension.key],
        ),
      )
    : undefined
  const selectedVariant = useDimensions
    ? dimensionVariant
    : variants.find((v) => v.sku === selectedSku)
  const [quantity, setQuantity] = useState<number>(1)
  const donationCurrency = selectedVariant?.currency ?? variants[0]?.currency ?? 'USD'
  const [donationAmount, setDonationAmount] = useState<string>(
    donationMinimumMinor ? minorMoneyDecimal(donationMinimumMinor, donationCurrency) : '5.00',
  )
  const [loading, setLoading] = useState(false)
  const [announcement, setAnnouncement] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [added, setAdded] = useState(false)

  const isOutOfStock =
    !selectedVariant ||
    selectedVariant.unavailable ||
    (selectedVariant.inventoryPolicy === 'tracked' && (selectedVariant.inventoryQuantity ?? 0) <= 0)

  /** A dimension value is selectable when at least one variant matching the
   * rest of the current selection carries it. */
  const dimensionValueEnabled = (dimension: AddToCartDimension, value: string) =>
    variants.some(
      (v) =>
        v.optionValues?.[dimension.key] === value &&
        dimensions.every(
          (other) =>
            other.key === dimension.key ||
            !optionSelection[other.key] ||
            v.optionValues?.[other.key] === optionSelection[other.key],
        ),
    )

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
        // Currency-exponent-aware conversion — never a hardcoded /100.
        payload.donationAmountMinor = parseMoneyToMinor(donationAmount, donationCurrency)
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
        {useDimensions ? (
          <div className="space-y-3">
            {dimensions.map((dimension) => (
              <div key={dimension.key}>
                <label
                  htmlFor={`option-${dimension.key}`}
                  className="block text-sm font-semibold mb-1"
                >
                  {dimension.label}
                </label>
                <select
                  id={`option-${dimension.key}`}
                  value={optionSelection[dimension.key] ?? ''}
                  onChange={(e) => {
                    setOptionSelection((current) => ({
                      ...current,
                      [dimension.key]: e.target.value,
                    }))
                    setAdded(false)
                    setError('')
                  }}
                  className="w-full rounded border p-2 bg-transparent"
                  disabled={loading}
                >
                  {dimension.values.map((value) => (
                    <option
                      key={value}
                      value={value}
                      disabled={!dimensionValueEnabled(dimension, value)}
                    >
                      {value}
                      {dimensionValueEnabled(dimension, value) ? '' : ' (unavailable)'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {selectedVariant ? (
              <p className="text-sm" role="status">
                {selectedVariant.title} —{' '}
                {formatMinorMoney(selectedVariant.priceMinor, selectedVariant.currency)}
                {isOutOfStock ? ' · Unavailable' : ''}
              </p>
            ) : (
              <p className="text-sm" role="status">
                That combination is not available.
              </p>
            )}
          </div>
        ) : variants.length > 1 ? (
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
                  {v.title} ({v.sku}) - {formatMinorMoney(v.priceMinor, v.currency)}
                  {v.unavailable ? ' [Unavailable]' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {isDonation ? (
          <div>
            <label htmlFor="donation-amount" className="block text-sm font-semibold mb-1">
              Donation Amount ({donationCurrency})
            </label>
            <input
              id="donation-amount"
              type="number"
              step="0.01"
              min={
                donationMinimumMinor
                  ? minorMoneyDecimal(donationMinimumMinor, donationCurrency)
                  : '0'
              }
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
            <p className="text-xs text-muted-foreground mt-1">
              Stock is confirmed by the store when you check out.
            </p>
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
