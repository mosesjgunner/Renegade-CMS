/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createFixtureCryptoAdapter,
  finalizeVerifiedOrder,
  verifySubmittedCryptoTransaction,
} from '@/modules/commerce/service'

/** A submitted hash is a lookup hint only; the configured adapter supplies chain facts. */
export async function POST(request: Request) {
  const input = (await request.json()) as { intentId?: string; transactionId?: string }
  if (!input.intentId || !input.transactionId)
    return NextResponse.json({ error: 'intentId and transactionId are required.' }, { status: 400 })
  const payload = await getPayload({ config })
  const db: any = payload
  const intent: any = await db.findByID({
    collection: 'payment-intents',
    id: input.intentId,
    depth: 0,
    overrideAccess: true,
  })
  if (!intent.cryptoInvoice)
    return NextResponse.json({ error: 'Not a crypto payment intent.' }, { status: 422 })
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
