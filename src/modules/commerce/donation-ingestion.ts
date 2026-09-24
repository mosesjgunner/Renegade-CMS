import { createHash } from 'node:crypto'
import {
  assertDonationPaymentBinding,
  donationDisclosures,
  type DonationLifecycle,
} from './donations'

type PayloadLike = {
  find(input: any): Promise<any>
  findByID(input: any): Promise<any>
  create(input: any): Promise<any>
  update(input: any): Promise<any>
}

const relationId = (value: any): string =>
  String(typeof value === 'object' && value ? value.id : (value ?? ''))
const sha256 = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export type DonationEvidence = Readonly<{
  providerKey: string
  providerEventId: string
  paymentIntentId: string
  state: 'pending' | 'settled' | 'failed' | 'unknown'
  occurredAt: string
  verifiedAt: string
  amountMinor?: string
  currency?: string
  evidence?: Readonly<Record<string, unknown>>
}>

/** Processes verified payment/settlement evidence; provider callbacks never supply donor identity or snapshots. */
export async function ingestDonationEvidence(payload: PayloadLike, evidence: DonationEvidence) {
  if (!evidence.providerKey || !evidence.providerEventId || !evidence.paymentIntentId)
    throw new Error('Donation evidence requires provider and payment event identity.')
  if (
    Number.isNaN(Date.parse(evidence.verifiedAt)) ||
    Number.isNaN(Date.parse(evidence.occurredAt))
  )
    throw new Error('Donation evidence timestamps must be valid.')
  const evidenceHash = sha256({ ...evidence, evidence: evidence.evidence ?? {} })
  const eventKey = `provider:${evidence.providerKey}:${evidence.providerEventId}`
  const priorEvent = await findOne(payload, 'donation-events', { eventKey })
  let eventAlreadyRecorded = false
  if (priorEvent) {
    if (priorEvent.evidence?.evidenceHash && priorEvent.evidence.evidenceHash !== evidenceHash)
      throw new Error('Provider event replay contains different evidence.')
    if (evidence.state !== 'settled') return { outcome: 'duplicate' as const }
    const settledDonation = await findOne(payload, 'donations', {
      paymentIntent: { equals: evidence.paymentIntentId },
    })
    if (settledDonation) return { outcome: 'duplicate' as const }
    // Resume interrupted settlement work from its durable evidence row.
    eventAlreadyRecorded = true
  }

  const payment = await payload.findByID({
    collection: 'payment-intents',
    id: evidence.paymentIntentId,
    depth: 0,
    overrideAccess: true,
  })
  if (!payment) throw new Error('Donation payment intent was not found.')
  const donationIntent = await findOne(payload, 'donation-intents', {
    paymentIntent: { equals: evidence.paymentIntentId },
  })
  let subscription: any = null
  let parentIntent = donationIntent
  if (!parentIntent && evidence.evidence?.subscriptionReference) {
    subscription = await findOne(payload, 'subscriptions', {
      and: [
        { providerKey: { equals: evidence.providerKey } },
        {
          providerSubscriptionReference: {
            equals: String(evidence.evidence.subscriptionReference),
          },
        },
      ],
    })
    if (subscription)
      parentIntent = await findOne(payload, 'donation-intents', {
        subscription: { equals: relationId(subscription.id) },
      })
  }
  if (!parentIntent) return { outcome: 'unmatched' as const }
  if (
    subscription &&
    relationId(subscription.supporter) !== supporterFor(parentIntent, subscription)
  )
    throw new Error('Recurring donation supporter does not match its subscription.')

  const lifecycle: DonationLifecycle =
    evidence.state === 'settled'
      ? 'succeeded'
      : evidence.state === 'failed'
        ? 'failed'
        : evidence.state === 'pending'
          ? 'pending'
          : 'unknown'
  const commonEvent = {
    eventKey,
    kind: evidence.state,
    occurredAt: evidence.occurredAt,
    evidenceHash,
    evidence: {
      ...(evidence.evidence ?? {}),
      evidenceHash,
      providerKey: evidence.providerKey,
      providerEventId: evidence.providerEventId,
      paymentIntentId: evidence.paymentIntentId,
    },
  }
  // Unique eventKey/paymentIntent constraints are the cross-process idempotency boundary.
  if (!eventAlreadyRecorded) {
    try {
      await payload.create({
        collection: 'donation-events',
        data: { donationIntent: parentIntent.id, ...commonEvent },
        overrideAccess: true,
      })
    } catch (error) {
      const raced = await findOne(payload, 'donation-events', { eventKey })
      if (raced) {
        if (raced.evidence?.evidenceHash && raced.evidence.evidenceHash !== evidenceHash)
          throw new Error('Provider event replay contains different evidence.')
        if (
          evidence.state !== 'settled' ||
          (await findOne(payload, 'donations', {
            paymentIntent: { equals: evidence.paymentIntentId },
          }))
        )
          return { outcome: 'duplicate' as const }
      } else {
        throw error
      }
    }
  }
  if (lifecycle !== 'succeeded') {
    // Ignore an older pending/failure notice after settlement; terminal donation records are not downgraded.
    const existingDonation = await findOne(payload, 'donations', {
      paymentIntent: { equals: evidence.paymentIntentId },
    })
    if (!existingDonation)
      await payload.update({
        collection: 'donation-intents',
        id: parentIntent.id,
        data: { lifecycle },
        overrideAccess: true,
      })
    return { outcome: lifecycle as 'pending' | 'failed' | 'unknown' }
  }

  if (!['paid', 'succeeded'].includes(String(payment.state)))
    throw new Error('A donation snapshot requires payment state verified as settled.')
  const money = parentIntent.moneySnapshot
  const boundIntent = {
    ...parentIntent,
    paymentIntentId: relationId(parentIntent.paymentIntent) || evidence.paymentIntentId,
    money,
  }
  assertDonationPaymentBinding(boundIntent, {
    id: evidence.paymentIntentId,
    amountMinor: evidence.amountMinor ?? payment.amountMinor,
    currency: evidence.currency ?? payment.currency,
    state: payment.state,
  })
  const already = await findOne(payload, 'donations', {
    paymentIntent: { equals: evidence.paymentIntentId },
  })
  if (already) return { outcome: 'settled' as const, donationId: already.id }

  const campaign = await payload.findByID({
    collection: 'donation-campaigns',
    id: relationId(parentIntent.campaign),
    depth: 0,
    overrideAccess: true,
  })
  if (!campaign) throw new Error('Donation campaign revision was not found.')
  const supporterId = subscription
    ? relationId(subscription.supporter)
    : await resolveSupporter(payload, parentIntent, payment)
  const donorSnapshot = Object.freeze({ ...(parentIntent.donorSnapshot ?? {}) })
  const campaignSnapshot = Object.freeze({
    campaignId: campaign.id,
    version: parentIntent.campaignVersion,
    title: campaign.title,
    purpose: campaign.purpose,
    organizationId: relationId(campaign.organization) || undefined,
  })
  const created = await createOnce(
    payload,
    'donations',
    { paymentIntent: { equals: evidence.paymentIntentId } },
    {
      donationIntent: parentIntent.id,
      campaign: campaign.id,
      paymentIntent: evidence.paymentIntentId,
      ...(subscription
        ? { subscription: subscription.id }
        : parentIntent.subscription
          ? { subscription: relationId(parentIntent.subscription) }
          : {}),
      ...(supporterId ? { supporter: supporterId } : {}),
      donorSnapshot,
      campaignSnapshot,
      designation: parentIntent.designation,
      baseAmountMinor: money.baseAmountMinor,
      feeCoveredAmountMinor: money.feeCoveredAmountMinor,
      currency: money.currency,
      recognition: parentIntent.recognition,
      publicDisplayName: parentIntent.publicDisplayName,
      donorMessage: parentIntent.donorMessage,
      trackingSource: parentIntent.trackingSource ?? {},
      receiptSnapshot: {
        entityName: String(campaign.receiptEntityName ?? campaign.organizationName ?? ''),
        amountMinor: String(money.baseAmountMinor),
        feeCoveredAmountMinor: String(money.feeCoveredAmountMinor),
        currency: String(money.currency),
        settledAt: evidence.occurredAt,
        designation: parentIntent.designation ?? '',
        recurrence: parentIntent.recurrence,
        disclosures: donationDisclosures(
          campaign,
          Array.isArray(campaign.disclosures) ? campaign.disclosures : [],
        ),
      },
      lifecycle: 'succeeded',
      site: relationId(parentIntent.site),
    },
  )
  const perk = String(campaign.supporterEntitlement ?? '').trim()
  const termDays = Number(campaign.supporterEntitlementTermDays)
  if (perk && supporterId && Number.isInteger(termDays) && termDays > 0) {
    const priorPerk = await findOne(payload, 'entitlements', {
      paymentIntent: { equals: evidence.paymentIntentId },
    }).catch(() => null)
    if (!priorPerk)
      await payload.create({
        collection: 'entitlements',
        data: {
          site: relationId(parentIntent.site),
          supporter: supporterId,
          paymentIntent: evidence.paymentIntentId,
          entitlement: perk,
          source: 'donation',
          startsAt: evidence.occurredAt,
          endsAt: new Date(Date.parse(evidence.occurredAt) + termDays * 86400000).toISOString(),
        },
        overrideAccess: true,
      })
  }
  return { outcome: 'settled' as const, donationId: created.id }
}

/** Idempotent shared correction path for provider refunds, disputes, and cancellations. */
export async function reverseDonation(
  payload: PayloadLike,
  input: {
    donationId: string
    eventKey: string
    kind: 'refunded' | 'partially-refunded' | 'disputed' | 'cancelled'
    occurredAt: string
    amountMinor?: string
    evidence?: Record<string, unknown>
  },
) {
  if (!input.eventKey || Number.isNaN(Date.parse(input.occurredAt)))
    throw new Error('A reversal needs a unique event key and valid timestamp.')
  const donation = await payload.findByID({
    collection: 'donations',
    id: input.donationId,
    depth: 1,
    overrideAccess: true,
  })
  if (!donation) throw new Error('Donation was not found.')
  const prior = await findOne(payload, 'donation-events', { eventKey: input.eventKey })
  if (prior) return { outcome: 'duplicate' as const, donationId: donation.id }
  if (
    input.kind === 'partially-refunded' &&
    (!input.amountMinor || !/^[1-9][0-9]*$/.test(input.amountMinor))
  )
    throw new Error('A partial refund needs a positive amount in minor units.')
  const next =
    input.kind === 'disputed'
      ? 'disputed'
      : input.kind === 'partially-refunded'
        ? 'partially-refunded'
        : 'refunded'
  await payload.create({
    collection: 'donation-events',
    data: {
      donation: donation.id,
      eventKey: input.eventKey,
      kind: input.kind,
      occurredAt: input.occurredAt,
      evidence: {
        ...(input.evidence ?? {}),
        ...(input.amountMinor ? { amountMinor: input.amountMinor } : {}),
      },
    },
    overrideAccess: true,
  })
  if (donation.lifecycle !== next)
    await payload.update({
      collection: 'donations',
      id: donation.id,
      data: { lifecycle: next },
      overrideAccess: true,
    })
  const entitlements = await payload.find({
    collection: 'entitlements',
    where: { paymentIntent: { equals: relationId(donation.paymentIntent) } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  for (const entitlement of entitlements.docs ?? [])
    if (!entitlement.revokedAt)
      await payload.update({
        collection: 'entitlements',
        id: entitlement.id,
        data: { revokedAt: input.occurredAt },
        overrideAccess: true,
      })
  const supporterId = relationId(donation.supporter)
  const supporter = supporterId
    ? await payload
        .findByID({ collection: 'supporters', id: supporterId, depth: 0, overrideAccess: true })
        .catch(() => null)
    : null
  const memberId = relationId(supporter?.member)
  if (memberId) {
    const key = `donation:${input.kind}:${input.eventKey}`
    const priorActivity = await findOne(payload, 'activity-events', {
      and: [
        { site: { equals: relationId(donation.site) } },
        { type: { equals: `donation.${input.kind}` } },
        { 'object.noticeKey': { equals: key } },
      ],
    })
    const activity =
      priorActivity ??
      (await payload.create({
        collection: 'activity-events',
        data: {
          site: relationId(donation.site),
          type: `donation.${input.kind}`,
          actor: { system: true },
          object: {
            noticeKey: key,
            donationId: String(donation.id),
            title: 'Donation update',
            message:
              input.kind === 'disputed'
                ? 'A donation payment is under dispute; related supporter benefits have been paused.'
                : 'A donation payment was reversed; related supporter benefits have ended.',
          },
          occurredAt: input.occurredAt,
        },
        overrideAccess: true,
      }))
    const notification = await findOne(payload, 'notifications', {
      and: [
        { activityEvent: { equals: String(activity.id) } },
        { recipientMember: { equals: memberId } },
      ],
    })
    if (!notification)
      await payload.create({
        collection: 'notifications',
        data: {
          activityEvent: activity.id,
          recipientMember: memberId,
          status: 'unread',
          channels: ['in-app'],
        },
        overrideAccess: true,
      })
  }
  return { outcome: 'reversed' as const, donationId: donation.id, lifecycle: next }
}

function supporterFor(intent: any, subscription: any): string {
  return relationId(subscription.supporter) || String(intent.donorSnapshot?.memberId ?? '')
}

async function resolveSupporter(
  payload: PayloadLike,
  intent: any,
  payment: any,
): Promise<string | undefined> {
  const memberId = String(intent.donorSnapshot?.memberId ?? relationId(payment.owner) ?? '')
  const siteId = relationId(intent.site)
  if (memberId) {
    const found = await findOne(payload, 'supporters', {
      and: [{ site: { equals: siteId } }, { member: { equals: memberId } }],
    })
    if (found) return String(found.id)
    return String(
      (
        await payload.create({
          collection: 'supporters',
          data: {
            site: siteId,
            member: memberId,
            displayName: intent.donorSnapshot?.guestName ?? intent.publicDisplayName ?? 'Supporter',
            visibilityPreference: intent.recognition,
          },
          overrideAccess: true,
        })
      ).id,
    )
  }
  const email = String(intent.donorSnapshot?.email ?? '')
    .trim()
    .toLowerCase()
  if (!email) return undefined
  const emailHash = createHash('sha256').update(email).digest('hex')
  const found = await findOne(payload, 'supporters', {
    and: [{ site: { equals: siteId } }, { emailHash: { equals: emailHash } }],
  })
  if (found) return String(found.id)
  return String(
    (
      await payload.create({
        collection: 'supporters',
        data: {
          site: siteId,
          emailHash,
          displayName: intent.donorSnapshot?.guestName ?? intent.publicDisplayName ?? 'Supporter',
          visibilityPreference: intent.recognition,
        },
        overrideAccess: true,
      })
    ).id,
  )
}

async function findOne(
  payload: PayloadLike,
  collection: string,
  where: unknown,
): Promise<any | null> {
  const result = await payload.find({ collection, where, limit: 1, depth: 0, overrideAccess: true })
  return result.docs?.[0] ?? null
}

async function createOnce(
  payload: PayloadLike,
  collection: string,
  where: unknown,
  data: any,
): Promise<any> {
  try {
    return await payload.create({ collection, data, overrideAccess: true })
  } catch (error) {
    const raced = await findOne(payload, collection, where)
    if (raced) return raced
    throw error
  }
}
