'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import type { VersionedCart } from './cart'
import type { PricingSnapshot } from './pricing'
import type { CheckoutProposal } from './proposal'
import type { RawAddressInput, ShippingRate } from './shipping'

export function CartView() {
  const [cart, setCart] = useState<VersionedCart | null>(null)
  const [pricing, setPricing] = useState<PricingSnapshot | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [updatingLine, setUpdatingLine] = useState<string | null>(null)
  const [couponInput, setCouponInput] = useState<string>('')
  const [couponError, setCouponError] = useState<string>('')
  const [announcement, setAnnouncement] = useState<string>('')

  // Customer & Shipping Address State
  const [customerEmail, setCustomerEmail] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [address, setAddress] = useState<RawAddressInput>({
    name: '',
    line1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  })
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false)

  // Proposal State
  const [proposal, setProposal] = useState<CheckoutProposal | null>(null)
  const [proposalLoading, setProposalLoading] = useState<boolean>(false)
  const [proposalError, setProposalError] = useState<string>('')
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false)
  const [paymentAction, setPaymentAction] = useState<any>(null)

  useEffect(() => {
    fetchCart()
  }, [])

  async function fetchCart() {
    setLoading(true)
    try {
      const res = await fetch('/api/commerce/cart')
      const data = await res.json()
      if (res.ok && data.cart) {
        setCart(data.cart)
        setPricing(data.pricing)
        if (data.cart.customerEmail) setCustomerEmail(data.cart.customerEmail)
        if (data.cart.shippingAddress) {
          setAddress(data.cart.shippingAddress)
          setCustomerName(data.cart.shippingAddress.name || '')
        }
      } else {
        setCart(null)
        setPricing(null)
      }
    } catch {
      setCart(null)
      setPricing(null)
    } finally {
      setLoading(false)
    }
  }

  async function updateLineQuantity(lineId: string, newQuantity: number) {
    if (!cart) return
    setUpdatingLine(lineId)
    setAnnouncement(`Updating quantity...`)

    try {
      const res = await fetch('/api/commerce/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: cart.version,
          lineId,
          quantity: newQuantity,
        }),
      })

      const data = await res.json()
      if (res.status === 409) {
        setAnnouncement('Cart was modified elsewhere. Reloading...')
        await fetchCart()
        return
      }

      if (res.ok) {
        setCart(data.cart)
        setPricing(data.pricing)
        setAnnouncement(newQuantity === 0 ? 'Item removed from cart.' : 'Cart updated.')
        // Invalidate active proposal if cart changed
        setProposal(null)
      }
    } catch {
      setAnnouncement('Failed to update cart.')
    } finally {
      setUpdatingLine(null)
    }
  }

  async function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault()
    if (!cart || !couponInput.trim()) return

    const code = couponInput.trim().toUpperCase()
    setCouponError('')

    if (cart.appliedCouponCodes.includes(code)) {
      setCouponError('Coupon code already applied.')
      return
    }

    try {
      const newCoupons = [...cart.appliedCouponCodes, code]
      const res = await fetch('/api/commerce/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: cart.version,
          appliedCouponCodes: newCoupons,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setCart(data.cart)
        setPricing(data.pricing)
        setCouponInput('')
        setProposal(null)
        if (data.cart.appliedCouponCodes.includes(code)) {
          setAnnouncement(`Coupon ${code} applied successfully.`)
        } else {
          setCouponError(`Coupon ${code} is not eligible for this cart.`)
        }
      } else {
        setCouponError(data.error || 'Failed to apply coupon.')
      }
    } catch {
      setCouponError('Failed to apply coupon.')
    }
  }

  async function handleRemoveCoupon(code: string) {
    if (!cart) return
    try {
      const newCoupons = cart.appliedCouponCodes.filter((c) => c !== code)
      const res = await fetch('/api/commerce/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: cart.version,
          appliedCouponCodes: newCoupons,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setCart(data.cart)
        setPricing(data.pricing)
        setProposal(null)
        setAnnouncement(`Coupon ${code} removed.`)
      }
    } catch {
      setAnnouncement('Failed to remove coupon.')
    }
  }

  async function handleGenerateProposal(e: React.FormEvent) {
    e.preventDefault()
    if (!cart) return

    setProposalLoading(true)
    setProposalError('')

    try {
      const hasPhysical = cart.items.some((i) => i.kind === 'physical' || i.kind === 'pod')
      const payload: Record<string, unknown> = {
        customer: {
          email: customerEmail,
          name: customerName,
        },
        consents: {
          termsAccepted: true,
          privacyAccepted: true,
        },
      }

      if (hasPhysical) {
        payload.shippingAddress = {
          ...address,
          name: customerName || address.name,
        }
      }

      const res = await fetch('/api/commerce/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate checkout proposal.')
      }

      setProposal(data.proposal)
      setAnnouncement('Immutable checkout proposal created. Ready to proceed to payment.')
    } catch (err: any) {
      setProposalError(err.message || 'Error creating checkout proposal.')
    } finally {
      setProposalLoading(false)
    }
  }

  async function handleInitiateCheckout() {
    if (!proposal) return
    setPaymentLoading(true)
    try {
      // Find eligible capability
      const res = await fetch('/api/commerce/checkout/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          capabilityId: 'development-card', // Default test capability
          returnUrl: '/cart',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Payment initiation failed.')

      setPaymentAction(data)
      setAnnouncement('Checkout initiated. Follow instructions to complete payment.')
    } catch (err: any) {
      setProposalError(err.message || 'Payment initiation error.')
    } finally {
      setPaymentLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto p-8 space-y-4">
        <h1 className="text-3xl font-black">Shopping Cart</h1>
        <p>Loading your cart...</p>
      </main>
    )
  }

  if (!cart || cart.items.length === 0) {
    return (
      <main className="max-w-4xl mx-auto p-8 space-y-6">
        <h1 className="text-3xl font-black">Shopping Cart</h1>
        <p className="text-muted-foreground">Your cart is currently empty.</p>
        <Link
          href="/store"
          className="inline-block px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded"
        >
          Continue Shopping →
        </Link>
      </main>
    )
  }

  const hasPhysical = cart.items.some((i) => i.kind === 'physical' || i.kind === 'pod')

  return (
    <main className="max-w-5xl mx-auto p-6 md:p-8 space-y-8">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <header className="flex justify-between items-baseline border-b pb-4">
        <h1 className="text-3xl font-black">Shopping Cart</h1>
        <Link href="/store" className="text-sm underline font-semibold text-primary">
          ← Continue Shopping
        </Link>
      </header>

      {/* Reconciliation Notes / Alerts */}
      {cart.reconciliationNotes && cart.reconciliationNotes.length > 0 && (
        <section
          aria-labelledby="cart-notices-heading"
          className="rounded-lg border border-amber-500/50 bg-amber-50/20 dark:bg-amber-950/20 p-4 space-y-2"
        >
          <h2
            id="cart-notices-heading"
            className="text-sm font-bold text-amber-700 dark:text-amber-300"
          >
            Important Updates to your Cart:
          </h2>
          <ul className="text-sm space-y-1 list-disc list-inside">
            {cart.reconciliationNotes.map((note, idx) => (
              <li key={idx}>{note.message}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Items List */}
        <section aria-labelledby="cart-items-heading" className="lg:col-span-2 space-y-4">
          <h2 id="cart-items-heading" className="text-xl font-bold">
            Items ({cart.items.reduce((sum, i) => sum + i.quantity, 0)})
          </h2>

          <div className="space-y-4">
            {cart.items.map((item) => (
              <article
                key={item.lineId}
                className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-lg border bg-surface dark:bg-zinc-900 gap-4"
              >
                <div className="space-y-1">
                  <h3 className="font-bold text-lg">{item.displaySnapshot.title}</h3>
                  <p className="text-xs text-muted-foreground">SKU: {item.variantSku}</p>
                  <p className="font-semibold">
                    ${(Number(item.displaySnapshot.unitPriceMinor) / 100).toFixed(2)}{' '}
                    {item.displaySnapshot.currency} each
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center border rounded">
                    <button
                      type="button"
                      onClick={() => updateLineQuantity(item.lineId, item.quantity - 1)}
                      disabled={updatingLine === item.lineId}
                      aria-label={`Decrease quantity of ${item.displaySnapshot.title}`}
                      className="px-3 py-1 font-bold disabled:opacity-50"
                    >
                      -
                    </button>
                    <span
                      className="px-3 py-1 text-sm font-medium"
                      aria-label={`Quantity is ${item.quantity}`}
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateLineQuantity(item.lineId, item.quantity + 1)}
                      disabled={updatingLine === item.lineId}
                      aria-label={`Increase quantity of ${item.displaySnapshot.title}`}
                      className="px-3 py-1 font-bold disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => updateLineQuantity(item.lineId, 0)}
                    disabled={updatingLine === item.lineId}
                    aria-label={`Remove ${item.displaySnapshot.title} from cart`}
                    className="text-xs text-red-600 underline font-semibold hover:text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>

          {/* Coupon Codes */}
          <div className="pt-4 border-t space-y-3">
            <h3 className="text-sm font-bold">Promotion / Gift Code</h3>
            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="Enter coupon code"
                aria-label="Promotion code"
                className="rounded border p-2 text-sm bg-transparent flex-1"
              />
              <button
                type="submit"
                disabled={!couponInput.trim()}
                className="px-4 py-2 bg-secondary text-secondary-foreground font-semibold rounded text-sm disabled:opacity-50"
              >
                Apply
              </button>
            </form>
            {couponError && (
              <p role="alert" className="text-xs text-red-500 font-medium">
                {couponError}
              </p>
            )}

            {cart.appliedCouponCodes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {cart.appliedCouponCodes.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20"
                  >
                    <span>{code}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCoupon(code)}
                      aria-label={`Remove coupon ${code}`}
                      className="hover:opacity-75"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Order Summary & Proposal Flow */}
        <section aria-labelledby="order-summary-heading" className="space-y-6">
          <div className="p-6 rounded-lg border bg-surface dark:bg-zinc-900 space-y-4">
            <h2 id="order-summary-heading" className="text-xl font-bold border-b pb-3">
              Order Summary
            </h2>

            {pricing && (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-semibold">
                    ${(Number(pricing.subtotalMinor) / 100).toFixed(2)} {pricing.currency}
                  </dd>
                </div>

                {BigInt(pricing.adjustmentsTotalMinor) > 0n && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <dt>Discounts</dt>
                    <dd className="font-semibold">
                      -${(Number(pricing.adjustmentsTotalMinor) / 100).toFixed(2)}{' '}
                      {pricing.currency}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping Estimate</dt>
                  <dd className="font-semibold">
                    ${(Number(pricing.netShippingMinor) / 100).toFixed(2)} {pricing.currency}
                  </dd>
                </div>

                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Estimated Tax</dt>
                  <dd className="font-semibold">
                    ${(Number(pricing.taxTotalMinor) / 100).toFixed(2)} {pricing.currency}
                  </dd>
                </div>

                <div className="flex justify-between border-t pt-3 text-base font-bold">
                  <dt>Grand Total</dt>
                  <dd className="text-primary">
                    ${(Number(pricing.grandTotalMinor) / 100).toFixed(2)} {pricing.currency}
                  </dd>
                </div>
              </dl>
            )}

            <p className="text-xs text-muted-foreground">
              Prices, promotions and availability are validated and guaranteed server-side.
            </p>
          </div>

          {/* Checkout Proposal Generator */}
          {!proposal ? (
            <form
              onSubmit={handleGenerateProposal}
              className="p-6 rounded-lg border bg-surface dark:bg-zinc-900 space-y-4"
            >
              <h3 className="font-bold text-base">Checkout Details</h3>
              <p className="text-xs text-muted-foreground">
                No account required. Fast and private guest checkout.
              </p>

              <div>
                <label htmlFor="customer-email" className="block text-xs font-semibold mb-1">
                  Email Address *
                </label>
                <input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full rounded border p-2 text-sm bg-transparent"
                />
              </div>

              <div>
                <label htmlFor="customer-name" className="block text-xs font-semibold mb-1">
                  Full Name
                </label>
                <input
                  id="customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded border p-2 text-sm bg-transparent"
                />
              </div>

              {hasPhysical && (
                <fieldset className="space-y-3 border-t pt-3">
                  <legend className="text-xs font-bold">Shipping Address *</legend>

                  <div>
                    <label htmlFor="addr-line1" className="block text-xs font-medium mb-1">
                      Street Address
                    </label>
                    <input
                      id="addr-line1"
                      type="text"
                      value={address.line1}
                      onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                      required
                      placeholder="123 Main St"
                      className="w-full rounded border p-2 text-sm bg-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="addr-city" className="block text-xs font-medium mb-1">
                        City
                      </label>
                      <input
                        id="addr-city"
                        type="text"
                        value={address.city}
                        onChange={(e) => setAddress({ ...address, city: e.target.value })}
                        required
                        className="w-full rounded border p-2 text-sm bg-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="addr-state" className="block text-xs font-medium mb-1">
                        State / Province
                      </label>
                      <input
                        id="addr-state"
                        type="text"
                        value={address.state ?? ''}
                        onChange={(e) => setAddress({ ...address, state: e.target.value })}
                        required
                        placeholder="CA"
                        className="w-full rounded border p-2 text-sm bg-transparent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="addr-postal" className="block text-xs font-medium mb-1">
                        Postal Code
                      </label>
                      <input
                        id="addr-postal"
                        type="text"
                        value={address.postalCode}
                        onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                        required
                        placeholder="90210"
                        className="w-full rounded border p-2 text-sm bg-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="addr-country" className="block text-xs font-medium mb-1">
                        Country (2-letter ISO)
                      </label>
                      <input
                        id="addr-country"
                        type="text"
                        maxLength={2}
                        value={address.country}
                        onChange={(e) =>
                          setAddress({ ...address, country: e.target.value.toUpperCase() })
                        }
                        required
                        className="w-full rounded border p-2 text-sm bg-transparent uppercase"
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              <div className="border-t pt-3">
                <label className="flex items-start space-x-2 text-xs">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    required
                    className="mt-0.5 rounded"
                  />
                  <span>I agree to the Terms of Service and Privacy Policy.</span>
                </label>
              </div>

              {proposalError && (
                <p role="alert" className="text-xs text-red-500 font-semibold">
                  {proposalError}
                </p>
              )}

              <button
                type="submit"
                disabled={proposalLoading || !customerEmail || !termsAccepted}
                className="w-full py-3 bg-primary text-primary-foreground font-bold rounded hover:opacity-90 disabled:opacity-50 text-sm transition-opacity"
              >
                {proposalLoading ? 'Generating Proposal...' : 'Create Checkout Proposal'}
              </button>
            </form>
          ) : (
            /* Proposal Review State */
            <div
              className="p-6 rounded-lg border border-primary/40 bg-primary/5 space-y-4"
              role="region"
              aria-label="Checkout Proposal Review"
            >
              <div className="flex justify-between items-baseline">
                <h3 className="font-bold text-base text-primary">Immutable Proposal</h3>
                <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-bold rounded">
                  Guaranteed Quote
                </span>
              </div>

              <div className="text-xs space-y-1 font-mono break-all text-muted-foreground">
                <p>ID: {proposal.id}</p>
                <p>Hash: {proposal.integrityHash.slice(0, 24)}...</p>
                <p>Cart Version: {proposal.cartVersion}</p>
              </div>

              <div className="text-xs space-y-1 border-t pt-2">
                <p>
                  <strong>Customer:</strong> {proposal.customer.email}
                </p>
                {proposal.shippingAddress && (
                  <p>
                    <strong>Destination:</strong> {proposal.shippingAddress.normalized.city},{' '}
                    {proposal.shippingAddress.normalized.state}{' '}
                    {proposal.shippingAddress.normalized.country}
                  </p>
                )}
                <p>
                  <strong>Fulfillment:</strong> {proposal.fulfillmentSplit.length} package(s) (
                  {proposal.fulfillmentSplit.map((f) => f.fulfillmentKind).join(', ')})
                </p>
              </div>

              {proposalError && (
                <p role="alert" className="text-xs text-red-500 font-semibold">
                  {proposalError}
                </p>
              )}

              {paymentAction ? (
                <div className="p-4 rounded border bg-surface dark:bg-zinc-900 space-y-2 text-sm">
                  <p className="font-bold text-green-600">✓ Checkout Initiated</p>
                  <p>Intent ID: {paymentAction.intentId}</p>
                  {paymentAction.actionUrl && (
                    <a
                      href={paymentAction.actionUrl}
                      className="inline-block px-4 py-2 bg-primary text-primary-foreground font-bold rounded text-xs"
                    >
                      Complete Payment →
                    </a>
                  )}
                  {paymentAction.instructions && (
                    <p className="text-xs text-muted-foreground">{paymentAction.instructions}</p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleInitiateCheckout}
                  disabled={paymentLoading}
                  className="w-full py-3 bg-primary text-primary-foreground font-bold rounded hover:opacity-90 disabled:opacity-50 text-sm transition-opacity"
                >
                  {paymentLoading
                    ? 'Initiating Checkout...'
                    : `Confirm & Pay $${(Number(proposal.pricingSnapshot.grandTotalMinor) / 100).toFixed(2)}`}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
