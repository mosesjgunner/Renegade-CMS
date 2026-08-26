/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createDevelopmentAdapter,
  createFixtureCryptoAdapter,
  methodsForCart,
} from '@/modules/commerce/service'

const id = (value: unknown) =>
  typeof value === 'string' ? value : (value as { id?: string } | null)?.id
const list = (value: unknown) => (Array.isArray(value) ? value : [])

/** Creates an action only after server-side scope/eligibility checks; redirects are not payment proof. */
export async function POST(request: Request) {
  const input = (await request.json()) as {
    sessionId?: string
    capabilityId?: string
    returnUrl?: string
  }
  if (!input.sessionId || !input.capabilityId)
    return NextResponse.json({ error: 'sessionId and capabilityId are required.' }, { status: 400 })
  const payload = await getPayload({ config })
  const db: any = payload
  const session: any = await db.findByID({
    collection: 'checkout-sessions',
    id: input.sessionId,
    depth: 1,
    overrideAccess: true,
  })
  if (session.state !== 'open')
    return NextResponse.json({ error: 'Checkout is not open.' }, { status: 409 })
  const cart: any =
    typeof session.cart === 'object'
      ? session.cart
      : await db.findByID({
          collection: 'carts',
          id: id(session.cart)!,
          depth: 0,
          overrideAccess: true,
        })
  const merchantId = id(session.merchantConnection)
  if (!merchantId || id(cart.merchantConnection) !== merchantId)
    return NextResponse.json({ error: 'Cross-Space merchant cart denied.' }, { status: 403 })
  const merchant: any = await db.findByID({
    collection: 'merchant-connections',
    id: merchantId,
    depth: 0,
    overrideAccess: true,
  })
  const capability: any = await db.findByID({
    collection: 'payment-method-capabilities',
    id: input.capabilityId,
    depth: 0,
    overrideAccess: true,
  })
  const recurring = list(cart.items).some((line: any) =>
    ['subscription', 'membership'].includes(line.kind),
  )
  const eligible = methodsForCart(
    [
      {
        ...capability,
        merchantConnectionId: id(capability.merchantConnection),
        merchantCountries: list(capability.merchantCountries),
        buyerCountries: list(capability.buyerCountries),
        presentmentCurrencies: list(capability.presentmentCurrencies),
        settlementCurrencies: list(capability.settlementCurrencies),
        requiredCustomerFields: list(capability.requiredCustomerFields),
      },
    ],
    {
      merchant: {
        siteId: String(session.site),
        spaceId: id(session.space),
        merchantConnectionId: merchantId,
      },
      merchantCountry: merchant.merchantCountry,
      buyerCountry: session.buyerCountry,
      currency: session.currency,
      amountMinor: session.amountMinor,
      recurring,
    },
    list(cart.items),
  )
  if (!eligible.length)
    return NextResponse.json(
      { error: 'Payment method is not eligible for this checkout.' },
      { status: 422 },
    )
  const crypto = capability.family === 'crypto'
  if (!crypto && !capability.providerKey.startsWith('development-'))
    return NextResponse.json(
      { error: 'No configured adapter is available for this provider.' },
      { status: 503 },
    )
  const intent: any = await db.create({
    collection: 'payment-intents',
    data: {
      site: session.site,
      publication: session.publication,
      space: session.space,
      checkoutSession: session.id,
      merchantConnection: merchantId,
      capabilityId: capability.id,
      providerKey: capability.providerKey,
      amountMinor: session.amountMinor,
      currency: session.currency,
      state: 'requires-action',
      expiresAt: session.expiresAt,
    },
    overrideAccess: true,
  })
  if (crypto) {
    const cryptoConfig = (merchant.configuration ?? {}).crypto ?? {}
    const network = String(
      cryptoConfig.network ?? (capability.providerKey.includes('doge') ? 'dogecoin' : 'evm:1'),
    )
    const asset = String(cryptoConfig.asset ?? (network === 'dogecoin' ? 'DOGE' : 'ETH'))
    const destination = String(cryptoConfig.destination ?? '')
    const exactAmountAtomic = String(cryptoConfig.exactAmountAtomic ?? intent.amountMinor)
    if (!destination)
      return NextResponse.json({ error: 'Crypto destination is not configured.' }, { status: 503 })
    const invoice = await createFixtureCryptoAdapter(capability.providerKey).createInvoice({
      intentId: intent.id,
      network,
      asset,
      destination,
      exactAmountAtomic,
      expiresAt: intent.expiresAt,
      requiredConfirmations: Number(cryptoConfig.requiredConfirmations ?? 1),
    })
    await db.update({
      collection: 'payment-intents',
      id: intent.id,
      data: { providerReference: 'crypto:' + intent.id, state: 'pending', cryptoInvoice: invoice },
      overrideAccess: true,
    })
    await db.update({
      collection: 'checkout-sessions',
      id: session.id,
      data: { state: 'pending', selectedCapabilityId: capability.id },
      overrideAccess: true,
    })
    return NextResponse.json({
      intentId: intent.id,
      flow: 'qr',
      cryptoInvoice: invoice,
      instructions: capability.instructions,
    })
  }
  const action = await createDevelopmentAdapter(
    capability.providerKey,
    process.env.COMMERCE_TEST_WEBHOOK_SECRET ?? 'development-only',
  ).initiate({
    intentId: intent.id,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    returnUrl: input.returnUrl ?? '/cart',
  })
  await db.update({
    collection: 'payment-intents',
    id: intent.id,
    data: {
      providerReference: action.providerReference,
      state: action.flow === 'asynchronous' ? 'pending' : 'requires-action',
    },
    overrideAccess: true,
  })
  await db.update({
    collection: 'checkout-sessions',
    id: session.id,
    data: {
      state: action.flow === 'asynchronous' ? 'pending' : 'open',
      selectedCapabilityId: capability.id,
    },
    overrideAccess: true,
  })
  return NextResponse.json({
    intentId: intent.id,
    flow: action.flow,
    actionUrl: action.actionUrl,
    instructions: capability.instructions,
  })
}
