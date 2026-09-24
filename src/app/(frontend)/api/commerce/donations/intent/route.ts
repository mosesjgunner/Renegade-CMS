import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { assertDonationIntent, feeCoverAmount } from '@/modules/commerce/donations'

const id = (value: unknown) =>
  typeof value === 'string' ? value : (value as { id?: string } | null)?.id
const MAX_BODY_BYTES = 16_384

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
  const setting: any = await payload.findGlobal({
    slug: 'site-settings',
    depth: 0,
    overrideAccess: true,
  })
  if (!setting.adminExperience?.optionalCapabilities?.commerceCheckout)
    return NextResponse.json({ error: 'Checkout is not available.' }, { status: 503 })
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
    trackingSource: {},
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
  const created = await payload.create({
    collection: 'donation-intents',
    data: {
      site: siteId,
      campaign: campaign.id,
      campaignVersion: Number(campaign.version),
      designation: input.designation,
      donorSnapshot: intent.donorSnapshot,
      moneySnapshot: intent.money,
      recognition,
      publicDisplayName: intent.publicDisplayName,
      donorMessage: intent.donorMessage,
      trackingSource: {},
      recurrence: input.recurrence,
      lifecycle: 'created',
    },
    overrideAccess: true,
  })
  return NextResponse.json(
    {
      intentId: created.id,
      currency: campaign.currency,
      amountMinor: amount,
      feeCoveredAmountMinor: fee,
      minorUnitDigits: digits,
      state: 'created',
    },
    { status: 201 },
  )
}
