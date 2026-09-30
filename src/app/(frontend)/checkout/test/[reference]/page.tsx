import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import {
  guestCanConfirmTestCheckout,
  localTestCheckoutEnabled,
} from '@/modules/commerce/local-test-checkout'

export const dynamic = 'force-dynamic'

const id = (value: unknown) =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String(value.id)
    : String(value ?? '')

export default async function LocalTestCheckoutPage({
  params,
}: {
  params: Promise<{ reference: string }>
}) {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? ''
  if (!localTestCheckoutEnabled(`http://${host}`)) notFound()
  const { reference } = await params
  if (!/^det_cs_[a-f0-9]{24}$/.test(reference)) notFound()
  const payload = await getPayload({ config })
  const attempts = await payload.find({
    collection: 'payment-attempts',
    where: {
      and: [
        { providerKey: { equals: 'deterministic-test' } },
        { providerReference: { equals: reference } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const attempt = attempts.docs[0]
  if (!attempt) notFound()
  const sessionId = id(attempt.checkoutSession)
  const session = await payload.findByID({
    collection: 'checkout-sessions',
    id: sessionId,
    depth: 0,
    overrideAccess: true,
  })
  if (
    !session ||
    !guestCanConfirmTestCheckout({
      cookie: requestHeaders.get('cookie') ?? '',
      sessionId,
      siteId: id(attempt.site),
      expiresAt: String(attempt.expiresAt),
    })
  )
    notFound()
  return (
    <main>
      <h1>Local test checkout</h1>
      <p>No real money will be charged.</p>
      <p>
        Amount: {attempt.amountMinor} {attempt.currency} minor units
      </p>
      {attempt.state === 'succeeded' ? (
        <p>This test payment has already been confirmed.</p>
      ) : (
        <form action="/api/commerce/checkout/test/confirm" method="post">
          <input type="hidden" name="reference" value={reference} />
          <button type="submit">Confirm test payment</button>
        </form>
      )}
    </main>
  )
}
