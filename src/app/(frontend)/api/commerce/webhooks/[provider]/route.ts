/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { createHash } from 'node:crypto'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { configuredPaymentProvider, recurringProvider } from '@/modules/commerce/payment-provider'
import { applySubscriptionEvent } from '@/modules/commerce/subscription-contract'
import {
  queueBillingSystemNotice,
  recomputeSubscriptionEntitlements,
} from '@/modules/commerce/subscription-service'

/** Authenticate, normalize, and durably inbox the event. Financial mutations run in the ordered job. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = (await params).provider
  let adapter
  try {
    adapter = configuredPaymentProvider(provider)
  } catch {
    return NextResponse.json({ error: 'Adapter is not configured.' }, { status: 404 })
  }
  const raw = await request.text()
  if (raw.length > 1_000_000)
    return NextResponse.json({ error: 'Webhook body is too large.' }, { status: 413 })
  const signature =
    provider === 'stripe-test'
      ? (request.headers.get('stripe-signature') ?? '')
      : (request.headers.get('x-commerce-signature') ?? '')
  let subscriptionEvent = null
  let recurringAdapter
  try {
    recurringAdapter = recurringProvider(adapter)
    subscriptionEvent = recurringAdapter.normalizeSignedSubscriptionWebhook(raw, signature)
  } catch {
    /* one-time-only adapters do not expose this capability */
  }
  if (subscriptionEvent) {
    const payload = await getPayload({ config })
    const db: any = payload
    const eventKey = `provider:${provider}:${subscriptionEvent.providerEventId}`
    const duplicate = await db.find({
      collection: 'subscription-events',
      where: { eventKey: { equals: eventKey } },
      limit: 1,
      overrideAccess: true,
    })
    if (duplicate.docs.length) return NextResponse.json({ received: true, replay: true })
    let eventSubscriptionReference = subscriptionEvent.subscriptionReference
    let subscriptionEventKind = subscriptionEvent.kind
    let paymentResolutionFailed = false
    if (
      !eventSubscriptionReference &&
      (subscriptionEvent.invoiceReference || subscriptionEvent.chargeReference)
    ) {
      try {
        const resolved = await recurringAdapter!.resolveSubscriptionPayment({
          invoiceReference: subscriptionEvent.invoiceReference,
          chargeReference: subscriptionEvent.chargeReference,
        })
        eventSubscriptionReference = resolved.subscriptionReference ?? undefined
        if (subscriptionEventKind === 'refund_recorded' && resolved.fullyRefunded)
          subscriptionEventKind = 'payment_refunded'
      } catch {
        paymentResolutionFailed = true
      }
    }
    if (paymentResolutionFailed)
      return NextResponse.json(
        { error: 'Subscription payment event could not be reconciled.' },
        { status: 503 },
      )
    const match = subscriptionEvent.subscriptionId
      ? {
          and: [
            { id: { equals: subscriptionEvent.subscriptionId } },
            { providerKey: { equals: provider } },
          ],
        }
      : {
          and: [
            { providerKey: { equals: provider } },
            { providerSubscriptionReference: { equals: eventSubscriptionReference } },
          ],
        }
    const result = await db.find({
      collection: 'subscriptions',
      where: match,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const row = result.docs[0]
    if (!row) return NextResponse.json({ received: true, correlated: false }, { status: 202 })
    if (
      row.providerSubscriptionReference &&
      eventSubscriptionReference &&
      row.providerSubscriptionReference !== eventSubscriptionReference
    )
      return NextResponse.json(
        { error: 'Provider subscription reference mismatch.' },
        { status: 409 },
      )
    const priorSequence = row.lastEventSequence == null ? undefined : Number(row.lastEventSequence)
    const current = {
      id: String(row.id),
      customerId: String(typeof row.supporter === 'object' ? row.supporter.id : row.supporter),
      siteId: String(typeof row.site === 'object' ? row.site.id : row.site),
      plan: row.planSnapshot,
      provider: { key: provider },
      state: row.state,
      source: row.source,
      currentPeriodStart: String(row.currentPeriodStart),
      currentPeriodEnd: String(row.currentPeriodEnd),
      cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
      version: Number(row.version ?? 1),
      ...(priorSequence !== undefined ? { lastEventSequence: priorSequence } : {}),
      ...(row.lastEventOccurredAt ? { lastEventOccurredAt: String(row.lastEventOccurredAt) } : {}),
    } as any
    const event = {
      id: eventKey,
      providerEventId: subscriptionEvent.providerEventId,
      subscriptionId: String(row.id),
      kind: subscriptionEventKind,
      occurredAt: subscriptionEvent.occurredAt,
      ...(subscriptionEvent.sequence !== undefined ? { sequence: subscriptionEvent.sequence } : {}),
      evidence: subscriptionEvent.evidence,
    }
    const next = applySubscriptionEvent(current, event)
    await db.create({
      collection: 'subscription-events',
      data: {
        site: typeof row.site === 'object' ? row.site.id : row.site,
        subscription: row.id,
        eventKey,
        providerEventId: subscriptionEvent.providerEventId,
        kind: subscriptionEventKind,
        occurredAt: subscriptionEvent.occurredAt,
        evidence: subscriptionEvent.evidence,
      },
      overrideAccess: true,
    })
    if (next.version !== current.version) {
      let projection: any = null
      if (eventSubscriptionReference) {
        try {
          projection = await recurringAdapter!.reconcileSubscription(eventSubscriptionReference)
        } catch {
          /* event remains durable; scheduled reconciliation will retry */
        }
      }
      const priceReference = subscriptionEvent.priceReference ?? projection?.priceReference
      let changedPlan: any = null
      if (priceReference) {
        const siteId = typeof row.site === 'object' ? String(row.site.id) : String(row.site)
        const plans = await db.find({
          collection: 'plan-revisions',
          where: { and: [{ site: { equals: siteId } }, { lifecycle: { equals: 'published' } }] },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        })
        changedPlan =
          plans.docs.find(
            (candidate: any) =>
              String(candidate.providerMappings?.[provider] ?? '') === priceReference &&
              String(candidate.id) !==
                String(
                  typeof row.planRevision === 'object' ? row.planRevision.id : row.planRevision,
                ),
          ) ?? null
      }
      const currentProviderPrice = String(row.planSnapshot?.providerMappings?.[provider] ?? '')
      const unmappedPrice = Boolean(
        priceReference && priceReference !== currentProviderPrice && !changedPlan,
      )
      const planSnapshot = changedPlan
        ? {
            id: String(changedPlan.id),
            planKey: String(changedPlan.planKey),
            revision: Number(changedPlan.revision),
            publishedAt: String(changedPlan.publishedAt),
            lifecycle: 'published',
            interval: changedPlan.interval,
            intervalCount: Number(changedPlan.intervalCount),
            amountMinor: String(changedPlan.amountMinor),
            currency: String(changedPlan.currency),
            trialDays: Number(changedPlan.trialDays ?? 0),
            trialEligibility: changedPlan.trialEligibility,
            entitlements: changedPlan.entitlements ?? [],
            cancelPolicy: changedPlan.cancelPolicy,
            changePolicy: changedPlan.changePolicy,
            taxPolicy: changedPlan.taxPolicy,
            providerMappings: changedPlan.providerMappings ?? {},
          }
        : row.planSnapshot
      const currentPeriodStart =
        subscriptionEvent.currentPeriodStart ??
        projection?.currentPeriodStart ??
        row.currentPeriodStart
      const currentPeriodEnd =
        subscriptionEvent.currentPeriodEnd ?? projection?.currentPeriodEnd ?? row.currentPeriodEnd
      const paymentHeld =
        subscriptionEventKind === 'payment_review' || subscriptionEventKind === 'payment_refunded'
      const nextState =
        paymentHeld || unmappedPrice
          ? 'paused'
          : projection?.state === 'active' &&
              (subscriptionEvent.cancelAtPeriodEnd ?? projection.cancelAtPeriodEnd)
            ? 'cancel_at_period_end'
            : (projection?.state ?? next.state)
      const paymentFailure =
        subscriptionEventKind === 'payment_review'
          ? { code: 'payment-disputed', providerEventId: eventKey }
          : subscriptionEventKind === 'payment_refunded'
            ? { code: 'payment-refunded', providerEventId: eventKey }
            : undefined
      await db.update({
        collection: 'subscriptions',
        id: row.id,
        data: {
          state: nextState,
          providerStatus: subscriptionEvent.status ?? projection?.state ?? row.providerStatus,
          providerCustomerReference:
            subscriptionEvent.customerReference ??
            projection?.customerReference ??
            row.providerCustomerReference,
          providerSubscriptionReference:
            eventSubscriptionReference ?? row.providerSubscriptionReference,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd:
            subscriptionEvent.cancelAtPeriodEnd ??
            projection?.cancelAtPeriodEnd ??
            next.cancelAtPeriodEnd,
          ...(nextState === 'active' ? { graceEnd: null, failure: null } : {}),
          ...(changedPlan ? { planRevision: changedPlan.id, planSnapshot } : {}),
          ...(unmappedPrice
            ? {
                failure: {
                  code: 'unmapped-provider-price',
                  providerPriceReference: priceReference,
                },
              }
            : {}),
          ...(paymentFailure ? { failure: paymentFailure } : {}),
          version: next.version,
          lastEventSequence: next.lastEventSequence,
          lastEventOccurredAt: next.lastEventOccurredAt,
        },
        context: { subscriptionLifecycleTransition: true },
        overrideAccess: true,
      })
      const supporterId =
        typeof row.supporter === 'object' ? String(row.supporter.id) : String(row.supporter)
      await recomputeSubscriptionEntitlements(db, {
        ...next,
        plan: planSnapshot,
        state: nextState,
        supporterId,
        customerId: supporterId,
        currentPeriodStart: String(currentPeriodStart),
        currentPeriodEnd: String(currentPeriodEnd),
        cancelAtPeriodEnd: Boolean(
          subscriptionEvent.cancelAtPeriodEnd ??
            projection?.cancelAtPeriodEnd ??
            next.cancelAtPeriodEnd,
        ),
        ...(row.graceEnd ? { graceEnd: String(row.graceEnd) } : {}),
      })
      if (['past_due', 'grace'].includes(String(row.state)) && nextState === 'active') {
        const supporter = await db
          .findByID({ collection: 'supporters', id: supporterId, depth: 0, overrideAccess: true })
          .catch(() => null)
        await queueBillingSystemNotice(db, {
          siteId: typeof row.site === 'object' ? String(row.site.id) : String(row.site),
          memberId: String(
            typeof supporter?.member === 'object' ? supporter.member.id : (supporter?.member ?? ''),
          ),
          subscriptionId: String(row.id),
          noticeKey: `recovered:${eventKey}`,
          kind: 'billing.payment_recovered',
          message: 'Your subscription payment recovered and your access is active again.',
        })
      }
      if (paymentHeld) {
        const supporter = await db
          .findByID({ collection: 'supporters', id: supporterId, depth: 0, overrideAccess: true })
          .catch(() => null)
        const review = subscriptionEventKind === 'payment_review'
        await queueBillingSystemNotice(db, {
          siteId: typeof row.site === 'object' ? String(row.site.id) : String(row.site),
          memberId: String(
            typeof supporter?.member === 'object' ? supporter.member.id : (supporter?.member ?? ''),
          ),
          subscriptionId: String(row.id),
          noticeKey: `${subscriptionEventKind}:${eventKey}`,
          kind: review ? 'billing.payment_disputed' : 'billing.payment_refunded',
          message: review
            ? 'A payment dispute was reported. Subscription access is paused while our billing team reviews it.'
            : 'A subscription payment was fully refunded, so access is paused while the subscription is reviewed.',
        })
      }
    }
    return NextResponse.json({ received: true, subscriptionId: row.id }, { status: 202 })
  }
  const event = adapter.normalizeSignedWebhook(raw, signature)
  if (!event)
    return NextResponse.json({ error: 'Invalid webhook signature or event.' }, { status: 401 })

  const payload = await getPayload({ config })
  const db: any = payload
  const replay = await db.find({
    collection: 'payment-webhook-events',
    where: {
      and: [
        { providerKey: { equals: provider } },
        { providerEventId: { equals: event.providerEventId } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (replay.docs.length) return NextResponse.json({ received: true, replay: true })

  const attemptId = String(event.sanitizedEvidence.attemptId ?? '')
  const attemptResult = await db.find({
    collection: 'payment-attempts',
    where: attemptId
      ? { id: { equals: attemptId } }
      : {
          and: [
            { providerKey: { equals: provider } },
            event.providerPaymentReference
              ? { providerPaymentReference: { equals: event.providerPaymentReference } }
              : { providerReference: { equals: event.providerReference } },
          ],
        },
    limit: 1,
    overrideAccess: true,
  })
  const attempt = attemptResult.docs[0]
  if (!attempt || attempt.providerKey !== adapter.key)
    return NextResponse.json(
      { error: 'Webhook cannot be correlated to a payment attempt.' },
      { status: 202 },
    )

  const merchantId =
    typeof attempt.merchantConnection === 'object'
      ? String(attempt.merchantConnection.id)
      : String(attempt.merchantConnection)
  const inbox: any = await db.create({
    collection: 'payment-webhook-events',
    data: {
      merchantConnection: merchantId,
      providerKey: provider,
      providerEventId: event.providerEventId,
      payloadHash: createHash('sha256').update(raw).digest('hex'),
      verifiedAt: new Date().toISOString(),
      occurredAt: event.occurredAt,
      sequence: event.sequence,
      normalizedKind: event.kind,
      providerReference: attempt.providerReference,
      sanitizedEvidence: {
        ...event.sanitizedEvidence,
        attemptId: String(attempt.id),
        ...(event.providerPaymentReference
          ? { providerPaymentReference: event.providerPaymentReference }
          : {}),
        ...(event.amountMinor ? { amountMinor: event.amountMinor } : {}),
        ...(event.currency ? { currency: event.currency } : {}),
      },
      processingState: 'received',
      attempts: 0,
    },
    overrideAccess: true,
  })
  await (payload.jobs as any).queue({
    task: 'commerce-process-payment-event',
    input: { webhookEventId: String(inbox.id) },
    queue: 'commerce',
  })
  return NextResponse.json({ received: true }, { status: 202 })
}
