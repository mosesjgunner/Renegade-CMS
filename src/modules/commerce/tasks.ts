/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TaskConfig } from 'payload'
import { applyNormalizedPaymentEvent, receiptMessageSnapshot } from './payment-operations'
import {
  configuredPaymentProvider,
  recurringProvider,
  type NormalizedPaymentEvent,
} from './payment-provider'
import { finalizeVerifiedOrder } from './service'
import { queueBillingSystemNotice, recomputeSubscriptionEntitlements } from './subscription-service'
import { ingestDonationEvidence, reverseDonation } from './donation-ingestion'

const relationId = (value: any) =>
  typeof value === 'object' && value !== null ? String(value.id ?? '') : String(value ?? '')

async function quarantinePaymentAttempt(
  payload: any,
  attempt: any,
  reason: string,
  evidence: Record<string, unknown>,
) {
  const prior = await payload.find({
    collection: 'commerce-reconciliation-cases',
    where: {
      and: [
        { legacyType: { equals: 'payment-attempt' } },
        { legacyId: { equals: String(attempt.id) } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (!prior.docs.length)
    await payload.create({
      collection: 'commerce-reconciliation-cases',
      data: {
        site: relationId(attempt.site),
        legacyType: 'payment-attempt',
        legacyId: String(attempt.id),
        reason,
        evidence,
        status: 'quarantined',
        createdAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
}

async function queueReceipt(payload: any, input: { order: any; session: any; proposal: any }) {
  const cart = input.proposal
    ? null
    : await payload.findByID({
        collection: 'carts',
        id: relationId(input.session.cart),
        depth: 0,
        overrideAccess: true,
      })
  const email = String(input.proposal?.customer?.email ?? cart?.customerEmail ?? '')
  if (!email) return
  const receipt = input.order.receipt
  const key = `commerce-receipt:${input.order.id}:${receipt.receiptNumber}`
  const prior = await payload.find({
    collection: 'email-messages',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  const snapshot = receiptMessageSnapshot({
    orderNumber: input.order.orderNumber,
    receiptNumber: receipt.receiptNumber,
    recipientEmail: email,
    amountMinor: input.order.amountMinor,
    currency: input.order.currency,
  })
  const message =
    prior.docs[0] ??
    (await payload.create({
      collection: 'email-messages',
      data: {
        site: relationId(input.session.site),
        subject: snapshot.subject,
        purpose: snapshot.purpose,
        kind: 'transactional',
        status: 'queued',
        blocks: [
          { type: 'heading', text: snapshot.subject },
          {
            type: 'text',
            text: `Order ${input.order.orderNumber}: ${input.order.amountMinor} ${input.order.currency}`,
          },
        ],
        idempotencyKey: key,
      },
      overrideAccess: true,
    }))
  const deliveryPrior = await payload.find({
    collection: 'email-deliveries',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  if (deliveryPrior.docs.length) return
  const delivery = await payload.create({
    collection: 'email-deliveries',
    data: {
      message: message.id,
      recipientEmail: email,
      idempotencyKey: key,
      status: 'queued',
      messageSnapshot: snapshot,
    },
    overrideAccess: true,
  })
  await payload.jobs.queue({
    task: 'audience-email-delivery',
    input: { deliveryId: String(delivery.id) },
    queue: 'operations',
  })
}

/** Moves only stale open sessions; payment status remains webhook-authoritative. */
export const abandonCheckoutTask = {
  slug: 'commerce-abandon-checkouts',
  label: 'Expire abandoned checkout sessions',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 2, backoff: { delay: 1000, type: 'exponential' } },
  concurrency: () => 'commerce.abandon-checkouts',
  schedule: [{ cron: '0 */15 * * * *', queue: 'operations' }],
  handler: async ({ req }: { req: any }) => {
    const stale = await req.payload.find({
      collection: 'checkout-sessions',
      where: {
        and: [
          { state: { in: ['open', 'pending'] } },
          { expiresAt: { less_than_equal: new Date().toISOString() } },
        ],
      },
      limit: 100,
      overrideAccess: true,
    })
    for (const session of stale.docs)
      await req.payload.update({
        collection: 'checkout-sessions',
        id: session.id,
        data: { state: 'abandoned' },
        overrideAccess: true,
      })
    return { output: {} }
  },
} as unknown as TaskConfig

export const processPaymentEventTask = {
  slug: 'commerce-process-payment-event',
  label: 'Process verified payment provider event',
  inputSchema: [{ name: 'webhookEventId', type: 'text', required: true }],
  outputSchema: [],
  retries: { attempts: 5, backoff: { delay: 1000, type: 'exponential' } },
  // One durable lane preserves provider event ordering across processes; event IDs still deduplicate replays.
  concurrency: () => 'commerce.payment-events',
  handler: async ({ input, req }: { input: { webhookEventId: string }; req: any }) => {
    const inbox: any = await req.payload.findByID({
      collection: 'payment-webhook-events',
      id: input.webhookEventId,
      depth: 0,
      overrideAccess: true,
    })
    if (!inbox || inbox.processingState === 'processed') return { output: {} }
    await req.payload.update({
      collection: 'payment-webhook-events',
      id: inbox.id,
      data: { processingState: 'processing', attempts: Number(inbox.attempts ?? 0) + 1 },
      overrideAccess: true,
    })
    try {
      const attemptId = String(inbox.sanitizedEvidence?.attemptId ?? '')
      const attempt: any = await req.payload.findByID({
        collection: 'payment-attempts',
        id: attemptId,
        depth: 0,
        overrideAccess: true,
      })
      const normalized: NormalizedPaymentEvent = {
        providerEventId: inbox.providerEventId,
        providerReference: attempt.providerReference,
        ...(inbox.sanitizedEvidence?.providerPaymentReference
          ? { providerPaymentReference: String(inbox.sanitizedEvidence.providerPaymentReference) }
          : {}),
        kind: inbox.normalizedKind,
        ...(inbox.sanitizedEvidence?.amountMinor
          ? { amountMinor: String(inbox.sanitizedEvidence.amountMinor) }
          : {}),
        ...(inbox.sanitizedEvidence?.currency
          ? { currency: String(inbox.sanitizedEvidence.currency) }
          : {}),
        occurredAt: inbox.occurredAt ?? inbox.verifiedAt,
        ...(inbox.sequence !== undefined ? { sequence: Number(inbox.sequence) } : {}),
        sanitizedEvidence: inbox.sanitizedEvidence ?? {},
      }
      const next = applyNormalizedPaymentEvent(
        {
          id: String(attempt.id),
          checkoutSessionId: relationId(attempt.checkoutSession),
          proposalId: relationId(attempt.proposal),
          customerKey: '',
          siteId: relationId(attempt.site),
          amountMinor: attempt.amountMinor,
          currency: attempt.currency,
          attempt: Number(attempt.attempt),
          state: attempt.state,
          providerReference: attempt.providerReference,
          providerPaymentReference: attempt.providerPaymentReference,
          refundedAmountMinor: attempt.refundedAmountMinor ?? '0',
          lastProviderSequence: attempt.lastProviderSequence,
          processedEventIds: attempt.processedEventIds ?? [],
        },
        normalized,
      )
      const terminalSuccessConflict =
        ['failed', 'cancelled'].includes(attempt.state) && normalized.kind === 'succeeded'
      const amountOrCurrencyMismatch =
        normalized.kind === 'succeeded' &&
        ((normalized.amountMinor && normalized.amountMinor !== attempt.amountMinor) ||
          (normalized.currency && normalized.currency !== attempt.currency))
      await req.payload.update({
        collection: 'payment-attempts',
        id: attempt.id,
        data: {
          state: next.state,
          providerPaymentReference: next.providerPaymentReference,
          lastProviderSequence: next.lastProviderSequence,
          processedEventIds: next.processedEventIds,
          lastReconciledAt: new Date().toISOString(),
          ...(next.state === 'unknown'
            ? {
                unknownSince: attempt.unknownSince ?? new Date().toISOString(),
                nextReconcileAt: new Date().toISOString(),
                ...(terminalSuccessConflict
                  ? {
                      failure: {
                        code: 'terminal-success-conflict',
                        message:
                          'Provider success conflicts with a locally terminal attempt; manual reconciliation is required.',
                      },
                    }
                  : {}),
                ...(amountOrCurrencyMismatch
                  ? { failure: { code: 'amount-or-currency-mismatch' } }
                  : {}),
              }
            : {}),
        },
        overrideAccess: true,
      })
      if (terminalSuccessConflict || amountOrCurrencyMismatch)
        await quarantinePaymentAttempt(
          req.payload,
          attempt,
          terminalSuccessConflict ? 'terminal-success-conflict' : 'amount-or-currency-mismatch',
          {
            providerEventId: normalized.providerEventId,
            providerReference: normalized.providerReference,
            amountMinor: normalized.amountMinor ?? null,
            currency: normalized.currency ?? null,
          },
        )
      const intent: any = await req.payload.findByID({
        collection: 'payment-intents',
        id: relationId(attempt.paymentIntent),
        depth: 1,
        overrideAccess: true,
      })
      const session: any =
        typeof intent.checkoutSession === 'object'
          ? intent.checkoutSession
          : await req.payload.findByID({
              collection: 'checkout-sessions',
              id: intent.checkoutSession,
              depth: 1,
              overrideAccess: true,
            })
      const intentState =
        next.state === 'succeeded'
          ? 'paid'
          : next.state === 'action-required'
            ? 'requires-action'
            : next.state === 'processing' || next.state === 'unknown'
              ? 'pending'
              : next.state === 'partially-refunded'
                ? 'paid'
                : next.state
      await req.payload.update({
        collection: 'payment-intents',
        id: intent.id,
        data: { state: intentState },
        overrideAccess: true,
      })
      await ingestDonationEvidence(req.payload, {
        providerKey: String(inbox.providerKey),
        providerEventId: String(inbox.providerEventId),
        paymentIntentId: String(intent.id),
        state:
          next.state === 'succeeded'
            ? 'settled'
            : ['failed', 'cancelled'].includes(next.state)
              ? 'failed'
              : ['processing', 'action-required'].includes(next.state)
                ? 'pending'
                : 'unknown',
        occurredAt: String(inbox.occurredAt ?? inbox.verifiedAt),
        verifiedAt: String(inbox.verifiedAt),
        amountMinor: normalized.amountMinor,
        currency: normalized.currency,
        evidence: {
          ...(inbox.sanitizedEvidence ?? {}),
          subscriptionReference: inbox.sanitizedEvidence?.subscriptionReference,
        },
      })
      if (['partially-refunded', 'refunded', 'disputed', 'cancelled'].includes(next.state)) {
        const donationResult = await req.payload.find({
          collection: 'donations',
          where: { paymentIntent: { equals: String(intent.id) } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const donation = donationResult.docs[0]
        if (donation)
          await reverseDonation(req.payload, {
            donationId: String(donation.id),
            eventKey: `provider:${inbox.providerKey}:${inbox.providerEventId}:donation-reversal`,
            kind:
              next.state === 'disputed'
                ? 'disputed'
                : next.state === 'partially-refunded'
                  ? 'partially-refunded'
                  : 'refunded',
            ...(next.state === 'partially-refunded'
              ? { amountMinor: String(inbox.sanitizedEvidence?.amountMinor ?? '') }
              : {}),
            occurredAt: String(inbox.occurredAt ?? inbox.verifiedAt),
            evidence: { providerKey: inbox.providerKey, providerEventId: inbox.providerEventId },
          })
      }
      if (!['partially-refunded', 'refunded', 'disputed'].includes(next.state))
        await req.payload.update({
          collection: 'checkout-sessions',
          id: session.id,
          data: {
            state:
              next.state === 'succeeded'
                ? 'completed'
                : next.state === 'failed'
                  ? 'failed'
                  : next.state === 'cancelled'
                    ? 'cancelled'
                    : 'pending',
          },
          overrideAccess: true,
        })
      if (next.state === 'succeeded') {
        const transactionID = await req.payload.db.beginTransaction()
        const transactionReq = transactionID ? { ...req, transactionID } : req
        const transactionalPayload = transactionID
          ? new Proxy(req.payload, {
              get(target, property) {
                const value = target[property]
                return ['find', 'findByID', 'create', 'update'].includes(String(property)) &&
                  typeof value === 'function'
                  ? (options: any) => value.call(target, { ...options, req: transactionReq })
                  : value
              },
            })
          : req.payload
        let finalized
        try {
          finalized = await finalizeVerifiedOrder(transactionalPayload, {
            intent: {
              ...intent,
              providerKey: attempt.providerKey,
              providerReference: attempt.providerReference,
            },
            session,
            merchantId: relationId(attempt.merchantConnection),
            verifiedAt: inbox.verifiedAt,
          })
          if (transactionID) await req.payload.db.commitTransaction(transactionID)
        } catch (error) {
          if (transactionID) await req.payload.db.rollbackTransaction(transactionID)
          throw error
        }
        const order = finalized.order
        const proposal = relationId(session.proposal)
          ? await req.payload.findByID({
              collection: 'checkout-proposals',
              id: relationId(session.proposal),
              depth: 0,
              overrideAccess: true,
            })
          : null
        await queueReceipt(req.payload, { order, session, proposal })
      }
      if (next.state === 'disputed') {
        const orders = await req.payload.find({
          collection: 'orders',
          where: { checkoutSession: { equals: session.id } },
          limit: 1,
          overrideAccess: true,
        })
        const order = orders.docs[0]
        if (order) {
          const disputeRef = String(inbox.sanitizedEvidence?.objectId ?? inbox.providerEventId)
          const prior = await req.payload.find({
            collection: 'commerce-disputes',
            where: { providerDisputeReference: { equals: disputeRef } },
            limit: 1,
            overrideAccess: true,
          })
          if (!prior.docs.length)
            await req.payload.create({
              collection: 'commerce-disputes',
              data: {
                site: order.site,
                publication: order.publication,
                space: order.space,
                order: order.id,
                paymentAttempt: attempt.id,
                providerDisputeReference: disputeRef,
                amountMinor: String(inbox.sanitizedEvidence?.amountMinor ?? attempt.amountMinor),
                currency: String(inbox.sanitizedEvidence?.currency ?? attempt.currency),
                state: 'open',
                sanitizedEvidence: inbox.sanitizedEvidence,
                auditLog: [{ kind: 'provider-dispute-opened', at: inbox.verifiedAt }],
              },
              overrideAccess: true,
            })
          await req.payload.update({
            collection: 'orders',
            id: order.id,
            data: {
              state: 'exception',
              exception: { code: 'payment-disputed', disputeReference: disputeRef },
            },
            overrideAccess: true,
          })
        }
      }
      if (['partially-refunded', 'refunded'].includes(next.state)) {
        const orders = await req.payload.find({
          collection: 'orders',
          where: { checkoutSession: { equals: session.id } },
          limit: 1,
          overrideAccess: true,
        })
        const order = orders.docs[0]
        if (order) {
          const providerRefundReference = String(
            inbox.sanitizedEvidence?.objectId ?? inbox.providerEventId,
          )
          const prior = await req.payload.find({
            collection: 'commerce-refunds',
            where: { providerRefundReference: { equals: providerRefundReference } },
            limit: 1,
            overrideAccess: true,
          })
          const amountMinor = String(
            inbox.sanitizedEvidence?.amountMinor ??
              (next.state === 'refunded' ? attempt.amountMinor : '0'),
          )
          if (!prior.docs.length && amountMinor !== '0')
            await req.payload.create({
              collection: 'commerce-refunds',
              data: {
                site: order.site,
                publication: order.publication,
                space: order.space,
                order: order.id,
                paymentAttempt: attempt.id,
                idempotencyKey: `provider-refund:${attempt.providerKey}:${providerRefundReference}`,
                amountMinor,
                currency: attempt.currency,
                kind: next.state === 'refunded' ? 'full' : 'partial',
                state: 'succeeded',
                reason: 'Provider-originated refund evidence',
                requestedBy: 'provider',
                providerRefundReference,
                providerEvidence: inbox.sanitizedEvidence,
                downstreamPolicy: { fulfillment: 'manual-review' },
                auditLog: [{ kind: 'provider-refund-observed', at: inbox.verifiedAt }],
              },
              overrideAccess: true,
            })
          await req.payload.update({
            collection: 'orders',
            id: order.id,
            data: {
              state: next.state === 'refunded' ? 'refunded' : order.state,
              refundExtension: {
                state: next.state === 'refunded' ? 'full' : 'partial',
                latestProviderEventId: inbox.providerEventId,
              },
              transitionLog: [
                ...(order.transitionLog ?? []),
                { kind: next.state, providerEventId: inbox.providerEventId, at: inbox.verifiedAt },
              ],
            },
            overrideAccess: true,
          })
        }
      }
      await req.payload.update({
        collection: 'payment-webhook-events',
        id: inbox.id,
        data: {
          processingState: 'processed',
          processedAt: new Date().toISOString(),
          outcome: { paymentAttemptId: attempt.id, state: next.state },
        },
        overrideAccess: true,
      })
      return { output: {} }
    } catch (error) {
      await req.payload.update({
        collection: 'payment-webhook-events',
        id: inbox.id,
        data: {
          processingState: 'failed',
          lastError:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Payment event processing failed.',
        },
        overrideAccess: true,
      })
      throw error
    }
  },
} as unknown as TaskConfig

export const reconcilePaymentsTask = {
  slug: 'commerce-reconcile-payments',
  label: 'Reconcile pending and unknown payment attempts',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 3, backoff: { delay: 5000, type: 'exponential' } },
  concurrency: () => 'commerce.reconcile-payments',
  schedule: [{ cron: '0 */5 * * * *', queue: 'commerce' }],
  handler: async ({ req }: { req: any }) => {
    const pending = await req.payload.find({
      collection: 'payment-attempts',
      where: { state: { in: ['processing', 'unknown'] } },
      limit: 100,
      sort: 'createdAt',
      overrideAccess: true,
    })
    for (const attempt of pending.docs as any[]) {
      try {
        const provider = configuredPaymentProvider(attempt.providerKey)
        let payment
        if (attempt.providerReference) payment = await provider.reconcile(attempt.providerReference)
        else {
          // Unknown creation is recovered only through the same provider idempotency key and immutable request.
          // It is never retried as a fresh payable attempt.
          const session: any = await req.payload.findByID({
            collection: 'checkout-sessions',
            id: relationId(attempt.checkoutSession),
            depth: 0,
            overrideAccess: true,
          })
          const proposal: any = relationId(attempt.proposal)
            ? await req.payload.findByID({
                collection: 'checkout-proposals',
                id: relationId(attempt.proposal),
                depth: 0,
                overrideAccess: true,
              })
            : null
          const origin = process.env.APP_URL ?? 'http://localhost:3000'
          const successUrl = new URL('/checkout/return', origin)
          successUrl.searchParams.set('session', String(session.id))
          const cancelUrl = new URL('/checkout/cancel', origin)
          cancelUrl.searchParams.set('session', String(session.id))
          payment = await provider.createHostedCheckout({
            attemptId: String(attempt.id),
            idempotencyKey: attempt.idempotencyKey,
            amountMinor: attempt.amountMinor,
            currency: attempt.currency,
            description: `Order ${session.id}`,
            successUrl: successUrl.toString(),
            cancelUrl: cancelUrl.toString(),
            expiresAt: attempt.expiresAt,
            ...(proposal?.customer?.email
              ? { customerEmail: String(proposal.customer.email) }
              : {}),
            metadata: {
              renegade_attempt_id: String(attempt.id),
              renegade_session_id: String(session.id),
              renegade_site_id: relationId(attempt.site),
            },
          })
        }
        if (payment.amountMinor !== attempt.amountMinor || payment.currency !== attempt.currency) {
          await req.payload.update({
            collection: 'payment-attempts',
            id: attempt.id,
            data: {
              state: 'unknown',
              failure: { code: 'amount-or-currency-mismatch' },
              lastReconciledAt: new Date().toISOString(),
            },
            overrideAccess: true,
          })
          continue
        }
        if (
          attempt.failure?.code === 'terminal-success-conflict' &&
          payment.state === 'succeeded'
        ) {
          await req.payload.update({
            collection: 'payment-attempts',
            id: attempt.id,
            data: {
              state: 'unknown',
              lastReconciledAt: new Date().toISOString(),
              nextReconcileAt: null,
            },
            overrideAccess: true,
          })
          await quarantinePaymentAttempt(req.payload, attempt, 'amount-or-currency-mismatch', {
            providerReference: payment.providerReference,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            source: 'provider-reconciliation',
          })
          continue
        }
        await req.payload.update({
          collection: 'payment-attempts',
          id: attempt.id,
          data: {
            state: payment.state,
            providerReference: payment.providerReference,
            providerPaymentReference: payment.providerPaymentReference,
            lastReconciledAt: new Date().toISOString(),
            nextReconcileAt:
              payment.state === 'processing' ? new Date(Date.now() + 300_000).toISOString() : null,
          },
          overrideAccess: true,
        })
        if (!['initiated', 'unknown'].includes(payment.state)) {
          const eventId = `reconcile:${attempt.id}:${payment.state}`
          const existing = await req.payload.find({
            collection: 'payment-webhook-events',
            where: {
              and: [
                { providerKey: { equals: attempt.providerKey } },
                { providerEventId: { equals: eventId } },
              ],
            },
            limit: 1,
            overrideAccess: true,
          })
          if (!existing.docs.length) {
            const inbox = await req.payload.create({
              collection: 'payment-webhook-events',
              data: {
                merchantConnection: relationId(attempt.merchantConnection),
                providerKey: attempt.providerKey,
                providerEventId: eventId,
                payloadHash: `reconciliation:${attempt.id}`,
                verifiedAt: new Date().toISOString(),
                occurredAt: payment.observedAt,
                normalizedKind: payment.state,
                providerReference: payment.providerReference,
                sanitizedEvidence: {
                  attemptId: String(attempt.id),
                  providerPaymentReference: payment.providerPaymentReference ?? '',
                  amountMinor: payment.amountMinor,
                  currency: payment.currency,
                  source: 'provider-reconciliation',
                },
                processingState: 'received',
                attempts: 0,
              },
              overrideAccess: true,
            })
            await req.payload.jobs.queue({
              task: 'commerce-process-payment-event',
              input: { webhookEventId: String(inbox.id) },
              queue: 'commerce',
            })
          }
        }
      } catch (error) {
        await req.payload.update({
          collection: 'payment-attempts',
          id: attempt.id,
          data: {
            state: 'unknown',
            lastReconciledAt: new Date().toISOString(),
            nextReconcileAt: new Date(Date.now() + 300_000).toISOString(),
            failure: {
              code: 'reconciliation-failed',
              message: error instanceof Error ? error.message.slice(0, 300) : 'failed',
            },
          },
          overrideAccess: true,
        })
      }
    }
    return { output: {} }
  },
} as unknown as TaskConfig

export const reconcileSubscriptionsTask = {
  slug: 'commerce-reconcile-subscriptions',
  label: 'Reconcile subscription grace periods and entitlements',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 3, backoff: { delay: 5000, type: 'exponential' } },
  concurrency: () => 'commerce.reconcile-subscriptions',
  schedule: [{ cron: '0 * * * *', queue: 'commerce' }],
  handler: async ({ req }: { req: any }) => {
    const now = new Date()
    const rows = await req.payload.find({
      collection: 'subscriptions',
      where: { state: { in: ['active', 'trialing', 'past_due', 'grace', 'cancel_at_period_end'] } },
      limit: 500,
      depth: 1,
      overrideAccess: true,
    })
    const graceHours = Math.max(0, Math.min(24 * 30, Number(process.env.BILLING_GRACE_HOURS ?? 72)))
    for (const row of rows.docs as any[]) {
      let state = row.state
      let currentPeriodStart = String(row.currentPeriodStart)
      let currentPeriodEnd = String(row.currentPeriodEnd)
      let cancelAtPeriodEnd = Boolean(row.cancelAtPeriodEnd)
      let providerStatus = row.providerStatus
      let graceEndValue: string | null = row.graceEnd ? String(row.graceEnd) : null
      let planSnapshot = row.planSnapshot
      let planRevisionId = relationId(row.planRevision)
      if (row.source === 'provider' && row.providerSubscriptionReference) {
        try {
          const provider = recurringProvider(configuredPaymentProvider(String(row.providerKey)))
          const projection = await provider.reconcileSubscription(
            String(row.providerSubscriptionReference),
          )
          currentPeriodStart = projection.currentPeriodStart
          currentPeriodEnd = projection.currentPeriodEnd
          cancelAtPeriodEnd = projection.cancelAtPeriodEnd
          providerStatus = projection.state
          state =
            projection.state === 'active' && cancelAtPeriodEnd
              ? 'cancel_at_period_end'
              : projection.state
          if (projection.state === 'active') graceEndValue = null
          const providerPrice = String(projection.priceReference ?? '')
          const currentPrice = String(planSnapshot?.providerMappings?.[row.providerKey] ?? '')
          if (providerPrice && providerPrice !== currentPrice) {
            const siteId = relationId(row.site)
            const plans = await req.payload.find({
              collection: 'plan-revisions',
              where: {
                and: [{ site: { equals: siteId } }, { lifecycle: { equals: 'published' } }],
              },
              limit: 1000,
              depth: 0,
              overrideAccess: true,
            })
            const mapped = (plans.docs as any[]).find(
              (plan) => String(plan.providerMappings?.[row.providerKey] ?? '') === providerPrice,
            )
            if (mapped) {
              planRevisionId = String(mapped.id)
              planSnapshot = {
                id: String(mapped.id),
                planKey: String(mapped.planKey),
                revision: Number(mapped.revision),
                publishedAt: String(mapped.publishedAt),
                lifecycle: 'published',
                interval: mapped.interval,
                intervalCount: Number(mapped.intervalCount),
                amountMinor: String(mapped.amountMinor),
                currency: String(mapped.currency),
                trialDays: Number(mapped.trialDays ?? 0),
                trialEligibility: mapped.trialEligibility,
                entitlements: mapped.entitlements ?? [],
                cancelPolicy: mapped.cancelPolicy,
                changePolicy: mapped.changePolicy,
                taxPolicy: mapped.taxPolicy,
                providerMappings: mapped.providerMappings ?? {},
              }
            } else state = 'paused'
          }
        } catch {
          /* retain the last known projection and retry at the next scheduled run */
        }
      }
      const end = Date.parse(currentPeriodEnd)
      let graceEnd = graceEndValue ? Date.parse(graceEndValue) : NaN
      if (state === 'past_due' && !Number.isFinite(graceEnd)) {
        state = graceHours ? 'grace' : 'expired'
        graceEndValue = graceHours
          ? new Date(now.getTime() + graceHours * 3600000).toISOString()
          : null
        graceEnd = graceEndValue ? Date.parse(graceEndValue) : NaN
      } else if (state === 'past_due' && Number.isFinite(graceEnd) && now.getTime() < graceEnd) {
        state = 'grace'
      } else if (state === 'grace' && Number.isFinite(graceEnd) && now.getTime() >= graceEnd) {
        state = 'expired'
      } else if (state === 'cancel_at_period_end' && Number.isFinite(end) && now.getTime() >= end) {
        state = 'canceled'
        cancelAtPeriodEnd = false
      } else if (
        ['active', 'trialing'].includes(state) &&
        Number.isFinite(end) &&
        now.getTime() >= end
      ) {
        state = 'expired'
      }
      const supporterId = relationId(row.supporter)
      let billingMemberId =
        typeof row.supporter === 'object' ? relationId(row.supporter.member) : ''
      if (!billingMemberId && supporterId) {
        const supporter = await req.payload
          .findByID({ collection: 'supporters', id: supporterId, depth: 0, overrideAccess: true })
          .catch(() => null)
        billingMemberId = relationId(supporter?.member)
      }
      await recomputeSubscriptionEntitlements(req.payload, {
        id: String(row.id),
        customerId: supporterId,
        supporterId,
        siteId: relationId(row.site),
        plan: planSnapshot,
        provider: {
          key: String(row.providerKey),
          subscriptionRef: row.providerSubscriptionReference,
          status: row.providerStatus,
        },
        state,
        source: row.source,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        ...(row.trialEnd ? { trialEnd: String(row.trialEnd) } : {}),
        ...(graceEndValue ? { graceEnd: graceEndValue } : {}),
        createdAt: String(row.createdAt),
        updatedAt: String(row.updatedAt),
        version: Number(row.version ?? 1),
      })
      await req.payload.update({
        collection: 'subscriptions',
        id: row.id,
        data: {
          lastReconciledAt: now.toISOString(),
          state,
          providerStatus,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          graceEnd: graceEndValue,
          ...(planRevisionId !== relationId(row.planRevision)
            ? { planRevision: planRevisionId, planSnapshot }
            : {}),
        },
        ...(planRevisionId !== relationId(row.planRevision)
          ? { context: { subscriptionLifecycleTransition: true } }
          : {}),
        overrideAccess: true,
      })
      if (['past_due', 'grace'].includes(state)) {
        const reminderHours = Math.max(
          1,
          Math.min(168, Number(process.env.BILLING_REMINDER_HOURS ?? 24)),
        )
        const bucket = Math.floor(now.getTime() / (reminderHours * 3600000))
        await queueBillingSystemNotice(req.payload, {
          siteId: relationId(row.site),
          memberId: billingMemberId,
          subscriptionId: String(row.id),
          noticeKey: `dunning:${row.id}:${bucket}`,
          kind: 'billing.payment_action_required',
          message:
            state === 'grace'
              ? `Your renewal needs attention. Access is scheduled to end ${graceEndValue ?? currentPeriodEnd}. Update your payment method to keep access.`
              : 'Your subscription renewal failed. Please update your payment method.',
        })
      }
      if (state === 'expired' && row.state !== 'expired')
        await queueBillingSystemNotice(req.payload, {
          siteId: relationId(row.site),
          memberId: billingMemberId,
          subscriptionId: String(row.id),
          noticeKey: `expired:${row.id}`,
          kind: 'billing.access_expired',
          message:
            'Your subscription access has ended. Renew from billing settings to restore access.',
        })
    }
    return { output: {} }
  },
} as unknown as TaskConfig

export const commerceTasks = [
  abandonCheckoutTask,
  processPaymentEventTask,
  reconcilePaymentsTask,
  reconcileSubscriptionsTask,
]
