'use client'

import Link from 'next/link'

/**
 * UXI-D10 repair (UXI-09): this surface previously presented a working
 * till that did not exist — catalogue buttons with no handler, an
 * invoice button that only re-set the status state to the value it
 * already held, and a QR component that was never rendered. No
 * POS-specific invoice API exists: real crypto
 * invoices are created only by the store checkout flow (cart →
 * proposal → POST /api/commerce/checkout/initiate) when the merchant
 * has a crypto payment capability configured, and the resulting
 * invoice is shown by that checkout flow.
 *
 * This page is therefore an honestly labelled preview. It has no
 * controls that pretend to take a payment, create an invoice, or mark
 * anything paid; its actions are real links to the surfaces that do
 * the work.
 */
export default function POS() {
  return (
    <main className="mx-auto max-w-md min-h-dvh p-4 space-y-4">
      <header>
        <h1 className="text-2xl font-black">Point of sale</h1>
        <p className="text-sm">
          <strong>Preview — not a working till.</strong> In-person point-of-sale checkout is not
          available in this install yet.
        </p>
      </header>
      <section className="surface-card p-4 space-y-3">
        <p className="text-sm">
          This page cannot create a crypto invoice, show a payment QR code, take a payment, or mark
          an order as paid. Nothing you do here affects a customer, an order, or stock.
        </p>
        <p className="text-sm">
          To sell something today, use the store checkout: add published products to the cart and
          complete checkout there. When the merchant connection for the site has a crypto payment
          method configured, that checkout creates the real payment-intent-bound crypto invoice and
          shows its QR code.
        </p>
      </section>
      <section className="surface-card p-4 space-y-3">
        <h2 className="font-bold">Where the real work happens</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/store" className="btn">
              Open the store
            </Link>{' '}
            Browse the published catalog a customer would buy from.
          </li>
          <li>
            <Link href="/cart" className="btn">
              Open the cart and checkout
            </Link>{' '}
            The working purchase loop, including crypto payment when configured.
          </li>
          <li>
            <Link href="/connections" className="btn">
              Merchant connections
            </Link>{' '}
            Configure the payment methods checkout can offer.
          </li>
        </ul>
      </section>
    </main>
  )
}
