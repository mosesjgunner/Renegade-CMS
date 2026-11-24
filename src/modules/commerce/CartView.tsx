'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toDataURL } from 'qrcode'
import type { VersionedCart } from './cart'
import type { PricingSnapshot } from './pricing'
import type { CheckoutProposal } from './proposal'
import type { RawAddressInput } from './shipping'
import { formatMinorMoney } from './catalog'

/** Recognizable country names for the address selects (Pass 04: buyers
 * should never have to know ISO codes). */
const COUNTRY_CODES: string[] = (() => {
  try {
    return (Intl as any)
      .supportedValuesOf('region')
      .filter((code: string) => /^[A-Z]{2}$/.test(code))
  } catch {
    return ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'JP', 'MX', 'BR', 'IN']
  }
})()
const countryDisplay = new Intl.DisplayNames(['en'], { type: 'region' })
const countryName = (code: string) => {
  try {
    return countryDisplay.of(code) ?? code
  } catch {
    return code
  }
}

type PresentedMethod = {
  id: string
  label: string
  detail: string | null
  family: string
  providerKey: string
  custody: 'processor-managed' | 'noncustodial' | null
  networks: readonly string[]
  paymentOptions: readonly string[]
  testMode: boolean
}

type ShippingRateOption = {
  id: string
  title: string
  amountMinor: string
  currency: string
  estimatedDaysMin?: number
  estimatedDaysMax?: number
}
type ShippingOptionGroup = {
  groupKey: string
  rates: ShippingRateOption[]
  selectedRateId: string | null
}
type MerchantPolicyLink = { type: string; version: string; title: string; href: string }

const formatBtc = (satoshis: string) => {
  const value = BigInt(satoshis)
  const whole = value / 100_000_000n
  const fraction = (value % 100_000_000n).toString().padStart(8, '0')
  return `${whole.toString()}.${fraction}`
}

export function CartView({ mode = 'cart' }: { mode?: 'cart' | 'checkout' }) {
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
  const [billingCountry, setBillingCountry] = useState('US')
  const [address, setAddress] = useState<RawAddressInput>({
    name: '',
    line1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  })
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false)
  const [marketingAccepted, setMarketingAccepted] = useState<boolean>(false)

  // Proposal State
  const [proposal, setProposal] = useState<CheckoutProposal | null>(null)
  const [proposalLoading, setProposalLoading] = useState<boolean>(false)
  const [proposalError, setProposalError] = useState<string>('')
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false)
  const [paymentAction, setPaymentAction] = useState<any>(null)
  const [paymentMethods, setPaymentMethods] = useState<PresentedMethod[]>([])
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [shippingOptions, setShippingOptions] = useState<ShippingOptionGroup[]>([])
  const [selectedShippingRateId, setSelectedShippingRateId] = useState('')
  const [policies, setPolicies] = useState<MerchantPolicyLink[]>([])
  const [cryptoTxId, setCryptoTxId] = useState('')
  const [cryptoVerifyState, setCryptoVerifyState] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    fetchCart()
    fetch('/api/commerce/policies')
      .then(async (response) => {
        if (response.ok) setPolicies((await response.json()).policies ?? [])
      })
      .catch(() => undefined)
  }, [])

  // Render a scannable QR for the crypto payment URI the server issued.
  useEffect(() => {
    const payload = paymentAction?.cryptoInvoice?.qrPayload
    if (!payload) {
      setQrDataUrl('')
      return
    }
    let cancelled = false
    toDataURL(String(payload), { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('')
      })
    return () => {
      cancelled = true
    }
  }, [paymentAction])

  async function mergeGuestCart() {
    const token = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('renegade-member-csrf='))
      ?.split('=')[1]
    const response = await fetch('/api/commerce/cart/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-member-csrf': token ?? '' },
      body: '{}',
    })
    const result = await response.json()
    if (response.ok) await fetchCart()
    else setCouponError(result.error ?? 'Cart merge failed.')
  }

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

  async function updateLineQuantity(lineId: string, newQuantity: number, variantSku?: string) {
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
          variantSku,
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

  async function requestProposal(shippingRateId?: string) {
    if (!cart) return
    setProposalLoading(true)
    setProposalError('')
    setPaymentAction(null)
    setPaymentMethods([])
    setPaymentMethodId('')
    setCryptoVerifyState('')

    try {
      const hasPhysical = cart.items.some((i) => i.kind === 'physical' || i.kind === 'pod')
      const payload: Record<string, unknown> = {
        customer: {
          email: customerEmail,
          name: customerName,
          country: hasPhysical ? address.country : billingCountry,
        },
        consents: {
          // Send the customer's actual selections: the required agreement
          // checkbox covers the Terms of Service and Privacy Policy it names;
          // marketing consent is a separate, optional choice.
          termsAccepted,
          privacyAccepted: termsAccepted,
          marketingAccepted,
        },
      }

      if (hasPhysical) {
        payload.shippingAddress = {
          ...address,
          name: customerName || address.name,
        }
      }
      if (shippingRateId) payload.selectedShippingRateId = shippingRateId

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
      const options: ShippingOptionGroup[] = Array.isArray(data.shippingOptions)
        ? data.shippingOptions
        : []
      setShippingOptions(options)
      setSelectedShippingRateId(options[0]?.selectedRateId ?? '')
      const methodsResponse = await fetch(
        '/api/commerce/checkout/methods?proposal=' + encodeURIComponent(data.proposal.id),
      )
      const available = await methodsResponse.json()
      if (!methodsResponse.ok)
        throw new Error(available.error ?? 'Payment methods could not be loaded.')
      setPaymentMethods(available.methods)
      setPaymentMethodId(available.methods[0]?.id ?? '')
      if (!available.methods.length)
        throw new Error('No configured payment methods are eligible for this quote.')
      setAnnouncement('Your order total is confirmed. Choose how to pay below.')
    } catch (err: any) {
      setProposalError(err.message || 'Error creating checkout proposal.')
    } finally {
      setProposalLoading(false)
    }
  }

  async function handleGenerateProposal(e: React.FormEvent) {
    e.preventDefault()
    await requestProposal(selectedShippingRateId || undefined)
  }

  /** Pass 04: an explicit delivery-method choice re-quotes the order with
   * that rate; the previous quote is superseded server-side. */
  async function changeShippingMethod(rateId: string) {
    setSelectedShippingRateId(rateId)
    await requestProposal(rateId)
  }

  /** Pass 05: after paying a crypto invoice, ask the server to verify. The
   * transaction id is only a lookup hint — settlement truth is server-side. */
  async function handleVerifyCrypto() {
    if (!paymentAction?.intentId) return
    setPaymentLoading(true)
    try {
      const res = await fetch('/api/commerce/crypto/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId: paymentAction.intentId,
          ...(cryptoTxId.trim() ? { transactionId: cryptoTxId.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verification failed.')
      if (data.confirmed) {
        setCryptoVerifyState('Payment confirmed. Your order is complete — thank you!')
        setAnnouncement('Payment confirmed. Your order is complete.')
      } else if (data.state === 'underpaid') {
        setCryptoVerifyState(
          'The payment received was less than the invoice amount. Please send the remaining amount to the same address.',
        )
      } else if (data.state === 'expired') {
        setCryptoVerifyState(
          'This invoice has expired. Go back and review your order again to get a new quote.',
        )
      } else {
        setCryptoVerifyState(
          `Payment seen (status: ${data.state}). Confirmation can take a little while — you can check again shortly.`,
        )
      }
    } catch (err: any) {
      setCryptoVerifyState(err.message || 'Verification failed.')
    } finally {
      setPaymentLoading(false)
    }
  }

  async function handleInitiateCheckout() {
    if (!proposal || !paymentMethodId) return
    setPaymentLoading(true)
    try {
      // Find eligible capability
      const res = await fetch('/api/commerce/checkout/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          capabilityId: paymentMethodId,
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

  const pageTitle = mode === 'checkout' ? 'Checkout' : 'Shopping Cart'

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto p-8 space-y-4">
        <h1 className="text-3xl font-black">{pageTitle}</h1>
        <p>Loading your cart...</p>
      </main>
    )
  }

  if (!cart || cart.items.length === 0) {
    return (
      <main className="max-w-4xl mx-auto p-8 space-y-6">
        <h1 className="text-3xl font-black">{pageTitle}</h1>
        <p className="text-muted-foreground">Your cart is currently empty.</p>
        <button type="button" onClick={mergeGuestCart}>
          Merge guest cart after signing in
        </button>
        {couponError && <p role="alert">{couponError}</p>}
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
        <h1 className="text-3xl font-black">{pageTitle}</h1>
        <Link href="/store" className="text-sm underline font-semibold text-primary">
          ← Continue Shopping
        </Link>
      </header>

      <button type="button" onClick={mergeGuestCart}>
        Merge guest cart after signing in
      </button>
      {couponError && <p role="alert">{couponError}</p>}
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
          {mode === 'checkout' ? (
            <p className="text-sm">
              <Link href="/cart" className="underline font-semibold text-primary">
                ← Edit cart
              </Link>
            </p>
          ) : null}

          <div className="space-y-4">
            {cart.items.map((item) => (
              <article
                key={item.lineId}
                className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-lg border bg-surface dark:bg-zinc-900 gap-4"
              >
                <div className="space-y-1">
                  <h3 className="font-bold text-lg">{item.displaySnapshot.title}</h3>
                  <p className="text-xs text-muted-foreground">SKU: {item.variantSku}</p>
                  {(item.availableVariants?.length ?? 0) > 1 && (
                    <label>
                      Option
                      <select
                        aria-label={`Option for ${item.displaySnapshot.title}`}
                        value={item.variantSku}
                        disabled={updatingLine === item.lineId}
                        onChange={(event) =>
                          updateLineQuantity(item.lineId, item.quantity, event.target.value)
                        }
                      >
                        {item.availableVariants?.map((variant) => (
                          <option key={variant.sku} value={variant.sku}>
                            {variant.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="font-semibold">
                    {formatMinorMoney(
                      item.displaySnapshot.unitPriceMinor,
                      item.displaySnapshot.currency,
                    )}{' '}
                    each
                  </p>
                </div>

                {mode === 'checkout' ? (
                  <p className="text-sm font-medium">Qty {item.quantity}</p>
                ) : (
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
                )}
              </article>
            ))}
          </div>

          {/* Coupon Codes (cart step only; codes already applied still price in checkout) */}
          <div className={mode === 'checkout' ? 'hidden' : 'pt-4 border-t space-y-3'}>
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
                    {formatMinorMoney(pricing.subtotalMinor, pricing.currency)}
                  </dd>
                </div>

                {BigInt(pricing.adjustmentsTotalMinor) > 0n && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <dt>Discounts</dt>
                    <dd className="font-semibold">
                      -{formatMinorMoney(pricing.adjustmentsTotalMinor, pricing.currency)}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping Estimate</dt>
                  <dd className="font-semibold">
                    {formatMinorMoney(pricing.netShippingMinor, pricing.currency)}
                  </dd>
                </div>

                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Estimated Tax</dt>
                  <dd className="font-semibold">
                    {formatMinorMoney(pricing.taxTotalMinor, pricing.currency)}
                  </dd>
                </div>

                <div className="flex justify-between border-t pt-3 text-base font-bold">
                  <dt>Total</dt>
                  <dd className="text-primary">
                    {formatMinorMoney(pricing.grandTotalMinor, pricing.currency)}
                  </dd>
                </div>
              </dl>
            )}

            <p className="text-xs text-muted-foreground">
              Current prices and promotions are checked on the server. Shipping and tax are
              confirmed in the checkout quote.
            </p>

            {mode === 'cart' ? (
              <Link
                href="/checkout"
                className="block w-full py-3 text-center bg-primary text-primary-foreground font-bold rounded hover:opacity-90 text-sm transition-opacity"
              >
                Proceed to Checkout →
              </Link>
            ) : null}
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

              {!hasPhysical && (
                <div>
                  <label htmlFor="billing-country" className="block text-xs font-semibold mb-1">
                    Billing country
                  </label>
                  <select
                    id="billing-country"
                    value={billingCountry}
                    required
                    onChange={(event) => setBillingCountry(event.target.value)}
                    className="w-full rounded border p-2 text-sm bg-transparent"
                  >
                    {COUNTRY_CODES.map((code) => (
                      <option key={code} value={code}>
                        {countryName(code)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                        Country
                      </label>
                      <select
                        id="addr-country"
                        value={address.country}
                        onChange={(e) => setAddress({ ...address, country: e.target.value })}
                        required
                        className="w-full rounded border p-2 text-sm bg-transparent"
                      >
                        {COUNTRY_CODES.map((code) => (
                          <option key={code} value={code}>
                            {countryName(code)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </fieldset>
              )}

              <div className="border-t pt-3 space-y-2">
                <label className="flex items-start space-x-2 text-xs">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    required
                    className="mt-0.5 rounded"
                  />
                  <span>
                    I agree to the{' '}
                    {policies.find((policy) => policy.type === 'terms') ? (
                      <a
                        className="underline font-semibold"
                        href={policies.find((policy) => policy.type === 'terms')!.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Terms of Service (v
                        {policies.find((policy) => policy.type === 'terms')!.version})
                      </a>
                    ) : (
                      'Terms of Service'
                    )}{' '}
                    and{' '}
                    {policies.find((policy) => policy.type === 'privacy') ? (
                      <a
                        className="underline font-semibold"
                        href={policies.find((policy) => policy.type === 'privacy')!.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Privacy Policy (v
                        {policies.find((policy) => policy.type === 'privacy')!.version})
                      </a>
                    ) : (
                      'Privacy Policy'
                    )}
                    .
                  </span>
                </label>
                <label className="flex items-start space-x-2 text-xs">
                  <input
                    type="checkbox"
                    checked={marketingAccepted}
                    onChange={(e) => setMarketingAccepted(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <span>Email me news and offers (optional).</span>
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
                {proposalLoading ? 'Preparing your order…' : 'Review your order'}
              </button>
            </form>
          ) : (
            /* Proposal Review State */
            <div
              className="p-6 rounded-lg border border-primary/40 bg-primary/5 space-y-4"
              role="region"
              aria-label="Review and pay"
            >
              <div className="flex justify-between items-baseline">
                <h3 className="font-bold text-base text-primary">Review &amp; pay</h3>
                <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-bold rounded">
                  Total confirmed
                </span>
              </div>

              <div className="text-xs space-y-1 border-t pt-2">
                <p>
                  <strong>Email:</strong> {proposal.customer.email}
                </p>
                {proposal.shippingAddress && (
                  <p>
                    <strong>Deliver to:</strong> {proposal.shippingAddress.normalized.city},{' '}
                    {proposal.shippingAddress.normalized.state}{' '}
                    {proposal.shippingAddress.normalized.country}
                  </p>
                )}
                <p>
                  <strong>How you&apos;ll get it:</strong>{' '}
                  {proposal.fulfillmentSplit
                    .map((f) =>
                      f.fulfillmentKind === 'physical'
                        ? 'parcel delivery'
                        : f.fulfillmentKind === 'pod'
                          ? 'made to order'
                          : f.fulfillmentKind === 'dropship'
                            ? 'shipped by the supplier'
                            : f.fulfillmentKind === 'referral'
                              ? 'bought at the seller’s own site'
                              : 'digital delivery',
                    )
                    .join(', ')}
                </p>
                <p>
                  <strong>Total to pay:</strong>{' '}
                  {formatMinorMoney(proposal.pricingSnapshot.grandTotalMinor, proposal.currency)}
                </p>
              </div>

              {proposalError && (
                <p role="alert" className="text-xs text-red-500 font-semibold">
                  {proposalError}
                </p>
              )}

              {shippingOptions.length > 0 && !paymentAction && (
                <fieldset className="border-t pt-3 space-y-2">
                  <legend className="text-xs font-bold">Delivery method</legend>
                  <p className="text-xs text-muted-foreground">
                    Applies to each shipment in this order. Changing it updates your total.
                  </p>
                  {shippingOptions[0].rates.map((rate) => (
                    <label key={rate.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="shipping-method"
                        value={rate.id}
                        checked={selectedShippingRateId === rate.id}
                        onChange={() => changeShippingMethod(rate.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-semibold">{rate.title}</span> —{' '}
                        {formatMinorMoney(rate.amountMinor, rate.currency)}
                        {rate.estimatedDaysMin && rate.estimatedDaysMax
                          ? ` · arrives in ${rate.estimatedDaysMin}–${rate.estimatedDaysMax} days`
                          : ''}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {paymentMethods.length > 0 && !paymentAction && (
                <fieldset className="border-t pt-3 space-y-2">
                  <legend className="text-xs font-bold">Payment method</legend>
                  {paymentMethods.map((method) => (
                    <label key={method.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="payment-method"
                        value={method.id}
                        checked={paymentMethodId === method.id}
                        onChange={(event) => setPaymentMethodId(event.target.value)}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-semibold">{method.label}</span>
                        {method.paymentOptions.length ? (
                          <span className="text-muted-foreground">
                            {' '}
                            ({method.paymentOptions.join(' or ')})
                          </span>
                        ) : null}
                        {method.detail ? (
                          <span className="block text-xs text-muted-foreground">
                            {method.detail}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {paymentAction ? (
                <div className="p-4 rounded border bg-surface dark:bg-zinc-900 space-y-2 text-sm">
                  <p className="font-bold text-green-600">✓ Payment started</p>
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
                  {paymentAction.cryptoInvoice && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="font-bold">
                        Pay exactly {formatBtc(paymentAction.cryptoInvoice.exactAmountAtomic)} BTC
                      </p>
                      {paymentAction.fxQuote && (
                        <p className="text-xs text-muted-foreground">
                          That is{' '}
                          {formatMinorMoney(
                            paymentAction.fxQuote.amountMinor,
                            paymentAction.fxQuote.currency,
                          )}{' '}
                          at the rate frozen when this payment started — the amount will not change
                          while this invoice is open.
                          {paymentAction.fxQuote.settlement
                            ? ` Processor fee ${formatMinorMoney(paymentAction.fxQuote.settlement.feeAmountMinor, paymentAction.fxQuote.currency)}; the seller receives ${formatMinorMoney(paymentAction.fxQuote.settlement.netAmountMinor, paymentAction.fxQuote.currency)}.`
                            : ''}
                        </p>
                      )}
                      {paymentAction.custodial?.lightningAddress && (
                        <p className="text-xs">
                          <strong>Lightning:</strong> pay{' '}
                          <span className="font-mono break-all">
                            {paymentAction.custodial.lightningAddress}
                          </span>{' '}
                          the exact amount above.
                        </p>
                      )}
                      <p className="text-xs">
                        <strong>On-chain address:</strong>{' '}
                        <span className="font-mono break-all">
                          {paymentAction.cryptoInvoice.destination}
                        </span>
                      </p>
                      {qrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={qrDataUrl}
                          alt="QR code for this Bitcoin payment"
                          width={220}
                          height={220}
                        />
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        This invoice expires at{' '}
                        {new Date(paymentAction.cryptoInvoice.expiresAt).toLocaleString()}. Send the
                        exact amount — a partial payment cannot complete the order.
                      </p>
                      {paymentAction.cryptoInvoice.network === 'bitcoin' &&
                      paymentMethods.find((method) => method.id === paymentMethodId)
                        ?.providerKey !== 'btcpay' ? (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold" htmlFor="crypto-txid">
                            After paying, enter the transaction ID so we can confirm it
                          </label>
                          <input
                            id="crypto-txid"
                            type="text"
                            value={cryptoTxId}
                            onChange={(event) => setCryptoTxId(event.target.value)}
                            className="w-full rounded border p-2 text-sm bg-transparent font-mono"
                            placeholder="Transaction ID"
                          />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleVerifyCrypto}
                        disabled={paymentLoading}
                        className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded text-xs disabled:opacity-50"
                      >
                        {paymentLoading ? 'Checking…' : 'I’ve paid — confirm my payment'}
                      </button>
                      {cryptoVerifyState && (
                        <p role="status" className="text-xs font-semibold">
                          {cryptoVerifyState}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleInitiateCheckout}
                  disabled={paymentLoading || !paymentMethodId}
                  className="w-full py-3 bg-primary text-primary-foreground font-bold rounded hover:opacity-90 disabled:opacity-50 text-sm transition-opacity"
                >
                  {paymentLoading
                    ? 'Starting payment…'
                    : `Confirm & Pay ${formatMinorMoney(proposal.pricingSnapshot.grandTotalMinor, proposal.currency)}`}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
