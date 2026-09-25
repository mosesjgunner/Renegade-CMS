import config from '@payload-config'
import { getPayload } from 'payload'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { assertDonationIntent, feeCoverAmount } from '@/modules/commerce/donations'
import {
  configuredPaymentProvider,
  PaymentProviderError,
} from '@/modules/commerce/payment-provider'
import { signGuestOrderToken } from '@/modules/commerce/payment-operations'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { localTestCheckoutEnabled } from '@/modules/commerce/local-test-checkout'

const id = (value: unknown) =>
  typeof value === 'string' ? value : (value as { id?: string } | null)?.id
const MAX_BODY_BYTES = 16_384

function attachGuestAccess(
  response: NextResponse,
  request: Request,
  session: { id: string; expiresAt: string },
  siteId: string,
  secret: string,
) {
  response.cookies.set(
    `renegade_checkout_${session.id}`,
    signGuestOrderToken(
      {
        orderId: String(session.id),
        checkoutSessionId: String(session.id),
        siteId,
        exp: Date.parse(session.expiresAt) + 30 * 24 * 60 * 60 * 1000,
      },
      secret,
    ),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(request.url).protocol === 'https:',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    },
  )
  return response
}

/** Creates an immutable, server-quoted donation intent. Amount, currency and fee inputs are revalidated here. */
export async function POST(request: Request) {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_BYTES)
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
  let input: any
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  if (!input || typeof input.campaignId !== 'string')
    return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 })
  const payload: any = await getPayload({ config })
  let campaign: any
  try {
    campaign = await payload.findByID({
      collection: 'donation-campaigns',
      id: input.campaignId,
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })
  }
  const now = Date.now()
  if (
    campaign.lifecycle !== 'active' ||
    (campaign.startsAt && Date.parse(campaign.startsAt) > now) ||
    (campaign.endsAt && Date.parse(campaign.endsAt) <= now)
  )
    return NextResponse.json(
      { error: 'This campaign is not accepting donations.' },
      { status: 409 },
    )
  if (input.currency !== campaign.currency)
    return NextResponse.json(
      { error: 'Currency is not available for this campaign.' },
      { status: 422 },
    )
  const digits = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: campaign.currency,
  }).resolvedOptions().maximumFractionDigits
  const minimum = '1'
  const maximum = campaign.allowedAmounts?.length
    ? campaign.allowedAmounts.reduce((a: string, b: string) => (BigInt(a) > BigInt(b) ? a : b))
    : '100000000'
  const amount = input.amountMinor
  if (
    typeof amount !== 'string' ||
    !/^[1-9][0-9]*$/.test(amount) ||
    BigInt(amount) < BigInt(minimum) ||
    BigInt(amount) > BigInt(maximum)
  )
    return NextResponse.json(
      { error: 'Donation amount is outside the allowed minimum and maximum.' },
      { status: 422 },
    )
  if (
    campaign.allowedAmounts?.length &&
    !campaign.allowedAmounts.includes(amount) &&
    input.customAmount !== true
  )
    return NextResponse.json(
      { error: 'Choose a suggested amount or mark this as a custom amount.' },
      { status: 422 },
    )
  if (!Array.isArray(campaign.recurrence) || !campaign.recurrence.includes(input.recurrence))
    return NextResponse.json({ error: 'Donation frequency is not available.' }, { status: 422 })
  if (input.recurrence === 'recurring')
    return NextResponse.json(
      { error: 'Recurring donation checkout is not configured for this campaign.' },
      { status: 503 },
    )
  let fee = '0'
  if (input.feeCover === true) {
    if (!campaign.feeCover)
      return NextResponse.json({ error: 'Fee coverage is unavailable.' }, { status: 422 })
    fee = feeCoverAmount(amount, campaign.feeCover)
  }
  const recognition = input.recognition
  if (!['public', 'anonymous', 'private'].includes(recognition))
    return NextResponse.json({ error: 'Choose a donor recognition option.' }, { status: 422 })
  if (recognition === 'public' && typeof input.publicDisplayName !== 'string')
    return NextResponse.json({ error: 'A public display name is required.' }, { status: 422 })
  if (typeof input.donorMessage === 'string' && input.donorMessage.length > 1000)
    return NextResponse.json({ error: 'Message is too long.' }, { status: 422 })
  if (
    typeof input.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
    input.email.length > 254
  )
    return NextResponse.json({ error: 'A valid receipt email is required.' }, { status: 422 })
  const siteId = id(campaign.site)
  const requestSiteId = await catalogSiteForHost(payload, request.headers.get('host'))
  if (!siteId || siteId !== requestSiteId)
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })
  const setting: any = await payload.findGlobal({
    slug: 'site-settings',
    depth: 0,
    overrideAccess: true,
  })
  if (!setting.adminExperience?.optionalCapabilities?.commerceCheckout)
    return NextResponse.json({ error: 'Checkout is not available.' }, { status: 503 })
  const providerKey = localTestCheckoutEnabled(request.url) ? 'deterministic-test' : 'stripe-test'
  const merchants = await payload.find({
    collection: 'merchant-connections',
    where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const merchant = merchants.docs.find(
    (row: any) =>
      row.providerKey === providerKey &&
      id(row.publication) === id(campaign.publication) &&
      id(row.space) === id(campaign.space),
  )
  if (!merchant)
    return NextResponse.json(
      { error: 'A hosted test payment provider is not configured for this campaign.' },
      { status: 503 },
    )
  const capabilities = await payload.find({
    collection: 'payment-method-capabilities',
    where: {
      and: [
        { merchantConnection: { equals: merchant.id } },
        { site: { equals: siteId } },
        { enabled: { equals: true } },
        { flow: { equals: 'hosted' } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const capability = capabilities.docs.find(
    (row: any) =>
      row.providerKey === providerKey &&
      id(row.publication) === id(campaign.publication) &&
      id(row.space) === id(campaign.space) &&
      (!row.presentmentCurrencies?.length || row.presentmentCurrencies.includes(campaign.currency)),
  )
  if (!capability)
    return NextResponse.json(
      { error: 'No hosted test payment method accepts this donation currency.' },
      { status: 503 },
    )
  let provider
  try {
    provider = configuredPaymentProvider(providerKey)
    if (!(await provider.readiness()).ready) throw new Error('Hosted test payment is unavailable.')
  } catch {
    return NextResponse.json({ error: 'Hosted test payment is unavailable.' }, { status: 503 })
  }
  const guestSecret =
    process.env.COMMERCE_GUEST_ORDER_SECRET ??
    (process.env.NODE_ENV === 'production' ? '' : 'development-commerce-guest-secret-32')
  if (guestSecret.length < 32)
    return NextResponse.json({ error: 'Guest receipt access is not configured.' }, { status: 503 })
  const suppliedKey = request.headers.get('idempotency-key')?.trim() ?? ''
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(suppliedKey))
    return NextResponse.json({ error: 'A bounded Idempotency-Key is required.' }, { status: 400 })
  const idempotencyKey = createHash('sha256')
    .update(`${siteId}|${campaign.id}|${suppliedKey}`)
    .digest('hex')
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        siteId,
        campaignId: campaign.id,
        amount,
        fee,
        currency: campaign.currency,
        recurrence: input.recurrence,
        recognition,
        publicDisplayName: input.publicDisplayName ?? null,
        donorMessage: input.donorMessage ?? null,
        designation: input.designation ?? null,
        email: input.email,
      }),
    )
    .digest('hex')
  const priorRows = await payload.find({
    collection: 'donation-intents',
    where: { idempotencyKey: { equals: idempotencyKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const prior = priorRows.docs[0]
  if (prior) {
    if (prior.trackingSource?.checkoutRequestHash !== requestHash)
      return NextResponse.json(
        { error: 'Idempotency key was used with different donation details.' },
        { status: 409 },
      )
    if (!id(prior.paymentIntent))
      return NextResponse.json(
        { error: 'Checkout setup is pending reconciliation.' },
        { status: 409 },
      )
    const priorPayment = await payload.findByID({
      collection: 'payment-intents',
      id: id(prior.paymentIntent),
      depth: 0,
      overrideAccess: true,
    })
    const priorSession = await payload.findByID({
      collection: 'checkout-sessions',
      id: id(priorPayment.checkoutSession),
      depth: 0,
      overrideAccess: true,
    })
    const priorAttempts = await payload.find({
      collection: 'payment-attempts',
      where: { paymentIntent: { equals: priorPayment.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const priorAttempt = priorAttempts.docs[0]
    if (
      !priorAttempt?.providerReference ||
      !['open', 'pending'].includes(String(priorSession.state))
    )
      return NextResponse.json(
        { error: 'Checkout is no longer awaiting payment.' },
        { status: 409 },
      )
    let priorActionUrl: string | undefined
    if (providerKey === 'deterministic-test')
      priorActionUrl = `/checkout/test/${encodeURIComponent(String(priorAttempt.providerReference))}`
    else
      try {
        priorActionUrl = (await provider.retrieve(String(priorAttempt.providerReference))).actionUrl
      } catch {
        return NextResponse.json(
          { error: 'Existing checkout requires reconciliation.' },
          { status: 503 },
        )
      }
    if (!priorActionUrl)
      return NextResponse.json(
        { error: 'Existing checkout has no hosted payment URL.' },
        { status: 503 },
      )
    return attachGuestAccess(
      NextResponse.json({
        intentId: prior.id,
        paymentIntentId: priorPayment.id,
        attemptId: priorAttempt.id,
        sessionId: priorSession.id,
        actionUrl: priorActionUrl,
        providerMode: provider.metadata.mode,
        currency: campaign.currency,
        amountMinor: amount,
        feeCoveredAmountMinor: fee,
        minorUnitDigits: digits,
        state: priorAttempt.state,
        replay: true,
      }),
      request,
      { id: String(priorSession.id), expiresAt: String(priorSession.expiresAt) },
      String(siteId),
      guestSecret,
    )
  }
  const intent = {
    id: 'pending',
    siteId,
    campaignId: String(campaign.id),
    campaignVersion: Number(campaign.version),
    donorSnapshot: {
      guestName: recognition === 'public' ? input.publicDisplayName.slice(0, 100) : undefined,
      email: input.email,
    },
    money: { baseAmountMinor: amount, feeCoveredAmountMinor: fee, currency: campaign.currency },
    recognition,
    ...(recognition === 'public'
      ? { publicDisplayName: input.publicDisplayName.slice(0, 100) }
      : {}),
    ...(recognition === 'private' && input.donorMessage
      ? { donorMessage: input.donorMessage }
      : {}),
    trackingSource: { checkoutRequestHash: requestHash },
    recurrence: input.recurrence,
    lifecycle: 'created' as const,
  }
  try {
    assertDonationIntent(
      intent as any,
      { ...campaign, id: String(campaign.id), siteId, feeCover: campaign.feeCover } as any,
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Donation details are invalid.' },
      { status: 422 },
    )
  }
  let created: any
  try {
    created = await payload.create({
      collection: 'donation-intents',
      data: {
        site: siteId,
        campaign: campaign.id,
        idempotencyKey,
        campaignVersion: Number(campaign.version),
        designation: input.designation,
        donorSnapshot: intent.donorSnapshot,
        moneySnapshot: intent.money,
        recognition,
        publicDisplayName: intent.publicDisplayName,
        donorMessage: intent.donorMessage,
        trackingSource: intent.trackingSource,
        recurrence: input.recurrence,
        lifecycle: 'created',
      },
      overrideAccess: true,
    })
  } catch (error) {
    const raced = await payload.find({
      collection: 'donation-intents',
      where: { idempotencyKey: { equals: idempotencyKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (raced.docs.length)
      return NextResponse.json(
        { error: 'Checkout setup is already in progress. Retry with the same details and key.' },
        { status: 409 },
      )
    throw error
  }
  const scope = {
    site: siteId,
    ...(id(campaign.publication) ? { publication: id(campaign.publication) } : {}),
    ...(id(campaign.space) ? { space: id(campaign.space) } : {}),
  }
  const totalMinor = (BigInt(amount) + BigInt(fee)).toString()
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()
  const cart = await payload.create({
    collection: 'carts',
    data: {
      ...scope,
      merchantConnection: merchant.id,
      customerEmail: input.email,
      currency: campaign.currency,
      items: [],
      expiresAt,
    },
    overrideAccess: true,
  })
  const session = await payload.create({
    collection: 'checkout-sessions',
    data: {
      ...scope,
      cart: cart.id,
      merchantConnection: merchant.id,
      currency: campaign.currency,
      amountMinor: totalMinor,
      state: 'open',
      expiresAt,
      legalCopy: { donationIntentId: created.id, campaignId: campaign.id },
    },
    overrideAccess: true,
  })
  const payment = await payload.create({
    collection: 'payment-intents',
    data: {
      ...scope,
      checkoutSession: session.id,
      merchantConnection: merchant.id,
      capabilityId: capability.id,
      providerKey: provider.key,
      amountMinor: totalMinor,
      currency: campaign.currency,
      state: 'created',
      orderLines: [],
      expiresAt,
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'donation-intents',
    id: created.id,
    data: { paymentIntent: payment.id, lifecycle: 'pending' },
    overrideAccess: true,
  })
  const attemptKey = `donation-checkout:${created.id}`
  const attempt = await payload.create({
    collection: 'payment-attempts',
    data: {
      ...scope,
      checkoutSession: session.id,
      paymentIntent: payment.id,
      merchantConnection: merchant.id,
      attempt: 1,
      idempotencyKey: attemptKey,
      providerKey: provider.key,
      providerContractVersion: provider.contractVersion,
      providerImplementationVersion: provider.metadata.implementationVersion,
      providerApiVersion: provider.metadata.providerApiVersion,
      amountMinor: totalMinor,
      currency: campaign.currency,
      state: 'initiated',
      refundedAmountMinor: '0',
      expiresAt,
    },
    overrideAccess: true,
  })
  const origin = process.env.APP_URL ?? new URL(request.url).origin
  let action
  try {
    action = await provider.createHostedCheckout({
      attemptId: String(attempt.id),
      idempotencyKey: attemptKey,
      amountMinor: totalMinor,
      currency: campaign.currency,
      description: `Donation to ${String(campaign.title).slice(0, 90)}`,
      successUrl: `${origin}/checkout/return?session=${encodeURIComponent(String(session.id))}`,
      cancelUrl: `${origin}/checkout/cancel?session=${encodeURIComponent(String(session.id))}`,
      expiresAt,
      customerEmail: input.email,
      metadata: {
        renegade_attempt_id: String(attempt.id),
        renegade_session_id: String(session.id),
        renegade_site_id: String(siteId),
      },
    })
    if (!action.actionUrl) throw new Error('Provider did not return a hosted checkout URL.')
  } catch (error) {
    const unknown = error instanceof PaymentProviderError && !error.outcomeKnown
    await payload.update({
      collection: 'payment-attempts',
      id: attempt.id,
      data: {
        state: unknown ? 'unknown' : 'failed',
        ...(unknown
          ? { unknownSince: new Date().toISOString(), nextReconcileAt: new Date().toISOString() }
          : {}),
      },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'checkout-sessions',
      id: session.id,
      data: { state: unknown ? 'pending' : 'failed' },
      overrideAccess: true,
    })
    return NextResponse.json(
      {
        error: unknown
          ? 'Payment status is unknown; operator reconciliation is required.'
          : 'Hosted test checkout failed.',
        intentId: created.id,
        state: unknown ? 'unknown' : 'failed',
      },
      { status: unknown ? 503 : 502 },
    )
  }
  await payload.update({
    collection: 'payment-intents',
    id: payment.id,
    data: { providerReference: action.providerReference, state: 'requires-action' },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'payment-attempts',
    id: attempt.id,
    data: {
      providerReference: action.providerReference,
      providerPaymentReference: action.providerPaymentReference,
      state: action.state,
    },
    overrideAccess: true,
  })
  const response = NextResponse.json(
    {
      intentId: created.id,
      paymentIntentId: payment.id,
      attemptId: attempt.id,
      sessionId: session.id,
      actionUrl: action.actionUrl,
      providerMode: provider.metadata.mode,
      currency: campaign.currency,
      amountMinor: amount,
      feeCoveredAmountMinor: fee,
      minorUnitDigits: digits,
      state: 'requires-action',
    },
    { status: 201 },
  )
  return attachGuestAccess(
    response,
    request,
    { id: String(session.id), expiresAt },
    String(siteId),
    guestSecret,
  )
}
