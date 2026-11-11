/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createFixtureCryptoAdapter,
  finalizeVerifiedOrder,
  verifySubmittedCryptoTransaction,
} from '@/modules/commerce/service'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'

const relationId = (value: any) =>
  typeof value === 'object' && value !== null ? String(value.id ?? '') : String(value ?? '')

/** A submitted hash is a lookup hint only; the configured adapter supplies chain facts. */
export async function POST(request: Request) {
  const input = (await request.json()) as { intentId?: string; transactionId?: string }
  if (!input.intentId || !input.transactionId)
    return NextResponse.json({ error: 'intentId and transactionId are required.' }, { status: 400 })
  const payload = await getPayload({ config })
  const db: any = payload
  const intent: any = await db
    .findByID({
      collection: 'payment-intents',
      id: input.intentId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!intent) return NextResponse.json({ error: 'Payment intent not found.' }, { status: 404 })
  if (!intent.cryptoInvoice)
    return NextResponse.json({ error: 'Not a crypto payment intent.' }, { status: 422 })
  // TA-P0-2 (a): bind the request to the intent's own tenant, exactly like
  // the sibling commerce routes — the caller's host must resolve to the
  // site that owns the intent, or the intent is treated as not found.
  const hostSite = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => '')
  if (!hostSite || hostSite !== relationId(intent.site))
    return NextResponse.json({ error: 'Payment intent not found.' }, { status: 404 })
  // TA-P0-2 (c): this route can only settle on fixture evidence (the sole
  // configured adapter). Fixture evidence is test evidence — it must never
  // settle an order in production posture. The local E2E harness is the
  // sanctioned exception, mirroring the app config's own escape hatch.
  if (process.env.NODE_ENV === 'production' && process.env.LOCAL_E2E_TEST_MODE !== 'true')
    return NextResponse.json(
      { error: 'Crypto verification is unavailable: only fixture evidence is configured.' },
      { status: 422 },
    )
  // TA-P0-2 (b): a transaction settles at most one intent. Observation
  // matching repeats destination and amount across invoices, so without
  // this, one observed transaction replays against every later same-price
  // intent. Re-posting a transaction against its own intent stays allowed
  // (a replay-safe confirmation refresh).
  const otherIntents = await db.find({
    collection: 'payment-intents',
    where: { id: { not_equals: intent.id } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const alreadySettled = (otherIntents.docs as any[]).some((other) =>
    Array.isArray(other.cryptoInvoice?.transactionIds)
      ? other.cryptoInvoice.transactionIds.includes(input.transactionId)
      : false,
  )
  if (alreadySettled)
    return NextResponse.json(
      { error: 'Transaction has already settled another payment intent.' },
      { status: 422 },
    )
  const configured =
    (
      await db.findByID({
        collection: 'merchant-connections',
        id:
          typeof intent.merchantConnection === 'string'
            ? intent.merchantConnection
            : intent.merchantConnection.id,
        depth: 0,
        overrideAccess: true,
      })
    ).configuration?.crypto?.fixtureObservations ?? []
  try {
    const verification = await verifySubmittedCryptoTransaction({
      adapter: createFixtureCryptoAdapter(intent.providerKey, configured),
      invoice: intent.cryptoInvoice,
      transactionId: input.transactionId,
      now: new Date().toISOString(),
    })
    await db.update({
      collection: 'payment-intents',
      id: intent.id,
      data: {
        cryptoInvoice: verification.invoice,
        state: verification.accepted
          ? 'paid'
          : verification.invoice.state === 'reorged'
            ? 'exception'
            : 'pending',
      },
      overrideAccess: true,
    })
    const session: any = await db.findByID({
      collection: 'checkout-sessions',
      id:
        typeof intent.checkoutSession === 'string'
          ? intent.checkoutSession
          : intent.checkoutSession.id,
      depth: 1,
      overrideAccess: true,
    })
    if (verification.accepted) {
      await db.update({
        collection: 'checkout-sessions',
        id: session.id,
        data: { state: 'completed' },
        overrideAccess: true,
      })
      await finalizeVerifiedOrder(db, {
        intent: { ...intent, state: 'paid' },
        session,
        merchantId:
          typeof intent.merchantConnection === 'string'
            ? intent.merchantConnection
            : intent.merchantConnection.id,
        verifiedAt: new Date().toISOString(),
      })
    } else if (verification.invoice.state === 'reorged') {
      await db.update({
        collection: 'checkout-sessions',
        id: session.id,
        data: { state: 'pending' },
        overrideAccess: true,
      })
      const orders = await db.find({
        collection: 'orders',
        where: { checkoutSession: { equals: session.id } },
        limit: 1,
        overrideAccess: true,
      })
      if (orders.docs[0])
        await db.update({
          collection: 'orders',
          id: orders.docs[0].id,
          data: {
            state: 'exception',
            exception: {
              code: 'crypto_reorg_reconciliation_required',
              at: new Date().toISOString(),
            },
          },
          overrideAccess: true,
        })
    }
    return NextResponse.json({
      state: verification.invoice.state,
      confirmations: verification.invoice.confirmations,
      confirmed: verification.accepted,
      manualReconciliationAllowed: verification.manualReconciliationAllowed,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed.' },
      { status: 422 },
    )
  }
}
