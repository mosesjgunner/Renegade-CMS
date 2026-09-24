/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { createHash } from 'node:crypto'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createFixtureCryptoAdapter,
  assertCheckoutQuote,
  methodsForCart,
  sameCommerceScope,
  snapshotQuotedLines,
} from '@/modules/commerce/service'
import { safeRelativeRedirect } from '@/modules/core/external-boundary'
import { checkoutBindingKey, signGuestOrderToken } from '@/modules/commerce/payment-operations'
import { computeProposalIntegrityHash } from '@/modules/commerce/proposal'
import {
  configuredPaymentProvider,
  PaymentProviderError,
} from '@/modules/commerce/payment-provider'

const id = (value: unknown) =>
  typeof value === 'string' ? value : (value as { id?: string } | null)?.id
const list = (value: unknown) => (Array.isArray(value) ? value : [])

/** Creates an action only after server-side scope/eligibility checks; redirects are not payment proof. */
export async function POST(request: Request) {
  const input = (await request.json()) as {
    sessionId?: string
    proposalId?: string
    capabilityId?: string
    returnUrl?: string
  }
  if ((!input.sessionId && !input.proposalId) || !input.capabilityId)
    return NextResponse.json(
      { error: 'proposalId (or sessionId) and capabilityId are required.' },
      { status: 400 },
    )
  const payload = await getPayload({ config })
  const db: any = payload
  const settings: any = await db.findGlobal({
    slug: 'site-settings',
    depth: 0,
    overrideAccess: true,
  })
  if (!settings.adminExperience?.optionalCapabilities?.commerceCheckout)
    return NextResponse.json({ error: 'Commerce checkout is disabled.' }, { status: 503 })

  let proposal: any = null
  let session: any = null

  if (input.proposalId) {
    proposal = await db.findByID({
      collection: 'checkout-proposals',
      id: input.proposalId,
      depth: 1,
      overrideAccess: true,
    })
    if (!proposal) return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 })
    if (proposal.state !== 'active' || proposal.expiresAt <= new Date().toISOString()) {
      return NextResponse.json({ error: 'Proposal is expired or inactive.' }, { status: 409 })
    }
    const proposalCart: any =
      typeof proposal.cart === 'object'
        ? proposal.cart
        : await db.findByID({
            collection: 'carts',
            id: id(proposal.cart),
            depth: 0,
            overrideAccess: true,
          })
    const cartItems = list(proposalCart.items)
    const expectedIntegrity = computeProposalIntegrityHash({
      id: String(proposal.id),
      cartId: String(proposalCart.id),
      cartVersion: Number(proposal.cartVersion),
      siteId: String(id(proposal.site)),
      currency: String(proposal.currency),
      grandTotalMinor: String(proposal.pricingSnapshot?.grandTotalMinor ?? ''),
      taxTotalMinor: String(proposal.pricingSnapshot?.taxTotalMinor ?? ''),
      netShippingMinor: String(proposal.pricingSnapshot?.netShippingMinor ?? ''),
      customerEmail: String(proposal.customer?.email ?? ''),
      shippingPostalCode: proposal.shippingAddress?.normalized?.postalCode,
      items: cartItems.map((item: any) => ({
        productId: String(item.productId),
        variantSku: String(item.variantSku),
        quantity: Number(item.quantity),
        unitPriceMinor: String(item.displaySnapshot?.unitPriceMinor ?? ''),
      })),
    })
    if (
      Number(proposalCart.version) !== Number(proposal.cartVersion) ||
      proposal.integrityHash !== expectedIntegrity
    )
      return NextResponse.json(
        { error: 'Proposal integrity or cart version check failed.' },
        { status: 409 },
      )
  }

  if (input.sessionId) {
    session = await db.findByID({
      collection: 'checkout-sessions',
      id: input.sessionId,
      depth: 1,
      overrideAccess: true,
    })
    if (session.state !== 'open')
      return NextResponse.json({ error: 'Checkout is not open.' }, { status: 409 })
  } else if (proposal) {
    const customerKey = createHash('sha256')
      .update(JSON.stringify(proposal.customer ?? {}))
      .digest('hex')
    const attempt = 1
    const bindingKey = checkoutBindingKey({
      proposalId: String(proposal.id),
      customerKey,
      siteId: String(id(proposal.site)),
      amountMinor: String(proposal.pricingSnapshot.grandTotalMinor),
      currency: String(proposal.currency),
      attempt,
    })
    const duplicate = await db.find({
      collection: 'checkout-sessions',
      where: { bindingKey: { equals: bindingKey } },
      limit: 1,
      overrideAccess: true,
    })
    if (duplicate.docs.length) session = duplicate.docs[0]
    // Create checkout session derived directly from immutable proposal
    else
      session = await db.create({
        collection: 'checkout-sessions',
        data: {
          site: proposal.site,
          publication: proposal.publication,
          space: proposal.space,
          cart: id(proposal.cart),
          proposal: proposal.id,
          merchantConnection: id(proposal.merchantConnection),
          currency: proposal.currency,
          amountMinor: proposal.pricingSnapshot.grandTotalMinor,
          customerKey,
          attempt,
          bindingKey,
          state: 'open',
          expiresAt: proposal.expiresAt,
        },
        overrideAccess: true,
      })
  }
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
  const scope = {
    siteId: id(session.site)!,
    spaceId: id(session.space)!,
    merchantConnectionId: merchantId,
  }
  if (
    !sameCommerceScope(scope, {
      siteId: id(cart.site)!,
      spaceId: id(cart.space)!,
      merchantConnectionId: id(cart.merchantConnection)!,
    }) ||
    !sameCommerceScope(scope, {
      siteId: id(merchant.site)!,
      spaceId: id(merchant.space)!,
      merchantConnectionId: merchant.id,
    }) ||
    !sameCommerceScope(scope, {
      siteId: id(capability.site)!,
      spaceId: id(capability.space)!,
      merchantConnectionId: id(capability.merchantConnection)!,
    })
  )
    return NextResponse.json({ error: 'Cross-site checkout scope denied.' }, { status: 403 })
  const recurring = list(cart.items).some((line: any) =>
    ['subscription', 'membership'].includes(line.kind),
  )
  if (recurring)
    return NextResponse.json(
      { error: 'Recurring items must use the subscription checkout flow.' },
      { status: 422 },
    )
  // A cart is selection only. Chargeable totals are recomputed from published catalog prices.
  const productIds = [
    ...new Set(
      list(cart.items)
        .map((line: any) => String(line.productId))
        .filter(Boolean),
    ),
  ]
  const products = await Promise.all(
    productIds.map((productId) =>
      db.findByID({ collection: 'products', id: productId, depth: 0, overrideAccess: true }),
    ),
  )
  let quotedLines: any[]
  try {
    quotedLines = snapshotQuotedLines({
      cartLines: list(cart.items),
      products,
      currency: session.currency,
    })
    if (proposal) {
      if (
        String(session.amountMinor) !== String(proposal.pricingSnapshot.grandTotalMinor) ||
        String(session.currency) !== String(proposal.currency)
      )
        throw new Error('Checkout amount differs from the immutable proposal.')
      const pricedLines = list(proposal.pricingSnapshot.lines)
      for (const line of quotedLines) {
        const priced = pricedLines.find(
          (candidate: any) =>
            String(candidate.productId) === line.productId &&
            String(candidate.variantSku) === line.variantSku,
        )
        if (
          !priced ||
          Number(priced.quantity) !== line.quantity ||
          String(priced.unitPriceMinor) !== line.unitAmountMinor
        )
          throw new Error('Proposal line differs from the current server catalog quote.')
      }
    } else
      assertCheckoutQuote({
        lines: quotedLines,
        currency: session.currency,
        amountMinor: session.amountMinor,
      })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid checkout quote.' },
      { status: 409 },
    )
  }
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
  const existing = await db.find({
    collection: 'payment-intents',
    where: {
      and: [
        { checkoutSession: { equals: session.id } },
        { capabilityId: { equals: capability.id } },
        { state: { in: ['created', 'requires-action', 'pending'] } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs.length) {
    const attempts = await db.find({
      collection: 'payment-attempts',
      where: { paymentIntent: { equals: existing.docs[0].id } },
      sort: '-attempt',
      limit: 1,
      overrideAccess: true,
    })
    const previous = attempts.docs[0]
    let recoveredActionUrl: string | undefined
    if (previous?.providerReference && previous.state !== 'unknown') {
      try {
        recoveredActionUrl = (
          await configuredPaymentProvider(capability.providerKey).retrieve(
            previous.providerReference,
          )
        ).actionUrl
      } catch {
        // The durable prior attempt still wins. Reconciliation, not a new creation, resolves ambiguity.
      }
    }
    const replayResponse = NextResponse.json({
      intentId: existing.docs[0].id,
      attemptId: previous?.id,
      state: previous?.state ?? existing.docs[0].state,
      flow: capability.flow,
      actionUrl: recoveredActionUrl,
      replay: true,
      instructions: capability.instructions,
    })
    if (!id(cart.member) && !id(cart.owner)) {
      const tokenSecret =
        process.env.COMMERCE_GUEST_ORDER_SECRET ??
        (process.env.NODE_ENV === 'production' ? '' : 'development-commerce-guest-secret-32')
      if (tokenSecret)
        replayResponse.cookies.set(
          `renegade_checkout_${session.id}`,
          signGuestOrderToken(
            {
              orderId: String(session.id),
              checkoutSessionId: String(session.id),
              siteId: String(id(session.site)),
              exp: Date.parse(session.expiresAt) + 30 * 24 * 60 * 60 * 1000,
            },
            tokenSecret,
          ),
          {
            httpOnly: true,
            sameSite: 'lax',
            secure: new URL(request.url).protocol === 'https:',
            path: '/',
            maxAge: 30 * 24 * 60 * 60,
          },
        )
    }
    return replayResponse
  }
  const crypto = capability.family === 'crypto'
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
      orderLines: quotedLines,
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
  let adapter
  try {
    adapter = configuredPaymentProvider(capability.providerKey)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Provider is unavailable.' },
      { status: 503 },
    )
  }
  const attemptNumber = Number(session.attempt ?? 1)
  const attemptKey = `checkout:${session.id}:${attemptNumber}`
  const attempt: any = await db.create({
    collection: 'payment-attempts',
    data: {
      site: session.site,
      publication: session.publication,
      space: session.space,
      checkoutSession: session.id,
      paymentIntent: intent.id,
      proposal: id(session.proposal),
      merchantConnection: merchantId,
      attempt: attemptNumber,
      idempotencyKey: attemptKey,
      providerKey: adapter.key,
      providerContractVersion: adapter.contractVersion,
      providerImplementationVersion: adapter.metadata.implementationVersion,
      providerApiVersion: adapter.metadata.providerApiVersion,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      state: 'initiated',
      refundedAmountMinor: '0',
      expiresAt: intent.expiresAt,
    },
    overrideAccess: true,
  })
  const origin = process.env.APP_URL ?? new URL(request.url).origin
  const requestedReturnPath = safeRelativeRedirect(input.returnUrl, '/cart')
  const returnUrl = new URL('/checkout/return', origin)
  returnUrl.searchParams.set('session', String(session.id))
  returnUrl.searchParams.set('continue', requestedReturnPath)
  const cancelUrl = new URL('/checkout/cancel', origin)
  cancelUrl.searchParams.set('session', String(session.id))
  let action
  try {
    action = await adapter.createHostedCheckout({
      attemptId: String(attempt.id),
      idempotencyKey: attemptKey,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      description: `Order ${session.id}`,
      successUrl: returnUrl.toString(),
      cancelUrl: cancelUrl.toString(),
      expiresAt: intent.expiresAt,
      ...(proposal?.customer?.email ? { customerEmail: String(proposal.customer.email) } : {}),
      metadata: {
        renegade_attempt_id: String(attempt.id),
        renegade_session_id: String(session.id),
        renegade_site_id: String(id(session.site)),
      },
    })
  } catch (error) {
    const unknown = error instanceof PaymentProviderError && !error.outcomeKnown
    await db.update({
      collection: 'payment-attempts',
      id: attempt.id,
      data: {
        state: unknown ? 'unknown' : 'failed',
        ...(unknown
          ? { unknownSince: new Date().toISOString(), nextReconcileAt: new Date().toISOString() }
          : {}),
        failure: {
          code: error instanceof PaymentProviderError ? error.code : 'provider-error',
          message: error instanceof Error ? error.message : 'Provider checkout failed.',
        },
      },
      overrideAccess: true,
    })
    await db.update({
      collection: 'payment-intents',
      id: intent.id,
      data: { state: unknown ? 'pending' : 'failed' },
      overrideAccess: true,
    })
    await db.update({
      collection: 'checkout-sessions',
      id: session.id,
      data: { state: unknown ? 'pending' : 'failed' },
      overrideAccess: true,
    })
    return NextResponse.json(
      {
        intentId: intent.id,
        attemptId: attempt.id,
        state: unknown ? 'unknown' : 'failed',
        reconcileRequired: unknown,
      },
      { status: unknown ? 202 : 502 },
    )
  }
  await db.update({
    collection: 'payment-intents',
    id: intent.id,
    data: {
      providerReference: action.providerReference,
      state: action.state === 'processing' ? 'pending' : 'requires-action',
    },
    overrideAccess: true,
  })
  await db.update({
    collection: 'payment-attempts',
    id: attempt.id,
    data: {
      providerReference: action.providerReference,
      providerPaymentReference: action.providerPaymentReference,
      state: action.state,
    },
    overrideAccess: true,
  })
  await db.update({
    collection: 'checkout-sessions',
    id: session.id,
    data: {
      state: action.state === 'processing' ? 'pending' : 'open',
      selectedCapabilityId: capability.id,
      returnPath: requestedReturnPath,
      cancelPath: '/cart',
    },
    overrideAccess: true,
  })
  if (proposal) {
    await db.update({
      collection: 'checkout-proposals',
      id: proposal.id,
      data: { state: 'consumed' },
      overrideAccess: true,
    })
  }
  const response = NextResponse.json({
    intentId: intent.id,
    attemptId: attempt.id,
    state: action.state,
    flow: 'hosted',
    actionUrl: action.actionUrl,
    instructions: capability.instructions,
  })
  if (!id(cart.member) && !id(cart.owner)) {
    const tokenSecret =
      process.env.COMMERCE_GUEST_ORDER_SECRET ??
      (process.env.NODE_ENV === 'production' ? '' : 'development-commerce-guest-secret-32')
    if (!tokenSecret)
      return NextResponse.json({ error: 'Guest order access is not configured.' }, { status: 503 })
    const token = signGuestOrderToken(
      {
        orderId: String(session.id),
        checkoutSessionId: String(session.id),
        siteId: String(id(session.site)),
        exp: Date.parse(session.expiresAt) + 30 * 24 * 60 * 60 * 1000,
      },
      tokenSecret,
    )
    response.cookies.set(`renegade_checkout_${session.id}`, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(request.url).protocol === 'https:',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })
  }
  return response
}
