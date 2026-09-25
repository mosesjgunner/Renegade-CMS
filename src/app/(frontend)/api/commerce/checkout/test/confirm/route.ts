import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { POST as receiveWebhook } from '@/app/(frontend)/api/commerce/webhooks/[provider]/route'
import {
  guestCanConfirmTestCheckout,
  localTestCheckoutEnabled,
  signedLocalPaymentEvent,
} from '@/modules/commerce/local-test-checkout'

const id = (value: unknown) =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String(value.id)
    : String(value ?? '')

export async function POST(request: Request) {
  if (!localTestCheckoutEnabled(request.url))
    return NextResponse.json({ error: 'Local test checkout is disabled.' }, { status: 404 })
  const body = await request.formData()
  const reference = body.get('reference')
  if (typeof reference !== 'string' || !/^det_cs_[a-f0-9]{24}$/.test(reference))
    return NextResponse.json({ error: 'Invalid test checkout.' }, { status: 400 })
  const payload = await getPayload({ config })
  const rows = await payload.find({
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
  const attempt = rows.docs[0]
  if (!attempt) return NextResponse.json({ error: 'Test checkout not found.' }, { status: 404 })
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
      cookie: request.headers.get('cookie') ?? '',
      sessionId,
      siteId: id(attempt.site),
      expiresAt: String(attempt.expiresAt),
    })
  )
    return NextResponse.json({ error: 'Test checkout access denied.' }, { status: 403 })
  if (attempt.state !== 'action-required' && attempt.state !== 'succeeded')
    return NextResponse.json({ error: 'Test checkout is not awaiting payment.' }, { status: 409 })
  if (attempt.state === 'action-required') {
    const { raw, signature } = signedLocalPaymentEvent({
      attemptId: String(attempt.id),
      providerReference: reference,
      amountMinor: String(attempt.amountMinor),
      currency: String(attempt.currency),
      secret: process.env.COMMERCE_TEST_WEBHOOK_SECRET ?? 'development-only',
    })
    const received = await receiveWebhook(
      new Request(new URL('/api/commerce/webhooks/deterministic-test', request.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-commerce-signature': signature },
        body: raw,
      }),
      { params: Promise.resolve({ provider: 'deterministic-test' }) },
    )
    if (!received.ok)
      return NextResponse.json({ error: 'Test payment could not be queued.' }, { status: 503 })
  }
  return NextResponse.redirect(
    new URL(`/checkout/return?session=${encodeURIComponent(sessionId)}`, request.url),
    303,
  )
}
