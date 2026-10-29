/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import { createLocalReq } from 'payload'
import { transactionPayload } from '../core/transaction-payload'
import { withExecutionLock } from '../operations/execution-lock'
import { configuredPaymentProvider, recurringProvider } from './payment-provider'
import {
  queueBillingSystemNotice,
  recomputeSubscriptionEntitlements,
  resolveProviderPlanChange,
  providerPlanChangeDue,
} from './subscription-service'

const id = (value: any) => String(value?.id ?? value ?? '')

/** Immutable signed invoice evidence is the ledger; later failed attempts cannot undo payment. */
export function subscriptionInvoices(events: any[]) {
  const invoices = new Map<string, any>()
  for (const event of [...events].sort((a, b) =>
    String(a.occurredAt).localeCompare(String(b.occurredAt)),
  )) {
    if (!['invoice_paid', 'invoice_failed'].includes(event.kind)) continue
    const reference = String(event.evidence?.invoiceReference ?? event.evidence?.objectId ?? '')
    if (!reference || invoices.get(reference)?.state === 'paid') continue
    invoices.set(reference, {
      reference,
      state: event.kind === 'invoice_paid' ? 'paid' : 'payment_failed',
      amountMinor: String(event.evidence?.amountMinor ?? '0'),
      currency: String(event.evidence?.currency ?? ''),
      occurredAt: event.occurredAt,
    })
  }
  return [...invoices.values()].reverse()
}

/** A grace deadline is anchored once, never moved forward by retries or a worker restart. */
export function billingDeadline(row: any, state: string, periodEnd: string, now: Date) {
  const hours = Number(process.env.BILLING_GRACE_HOURS ?? 72)
  const graceHours = Number.isFinite(hours) ? Math.max(0, Math.min(720, hours)) : 72
  let graceEnd = row.graceEnd ?? null
  if (['past_due', 'grace'].includes(state)) {
    if (!graceEnd) {
      const anchor = row.failure?.occurredAt ?? row.lastEventOccurredAt ?? periodEnd
      graceEnd = new Date(Date.parse(anchor) + graceHours * 3600000).toISOString()
    }
    state = Date.parse(graceEnd) > now.getTime() ? 'grace' : 'expired'
  } else if (state === 'active' || state === 'trialing') {
    graceEnd = null
    if (Date.parse(periodEnd) <= now.getTime()) state = 'expired'
  } else if (state === 'cancel_at_period_end' && Date.parse(periodEnd) <= now.getTime())
    state = 'canceled'
  return { state, graceEnd }
}

/** Webhooks and workers share the provider lock and atomic projection/ledger/grant/notice commit. */
export async function reconcileBillingSubscription(
  payload: any,
  subscriptionId: string,
  now = new Date(),
) {
  const initial = await payload.findByID({
    collection: 'subscriptions',
    id: subscriptionId,
    depth: 0,
    overrideAccess: true,
  })
  return withExecutionLock(payload, `subscription-events:${initial.providerKey}`, async () => {
    const transactionID = await payload.db.beginTransaction()
    if (!transactionID) throw new Error('Billing transaction unavailable.')
    const req = await createLocalReq({}, payload)
    req.transactionID = transactionID
    const db: any = transactionPayload(payload, req)
    try {
      const row = await db.findByID({
        collection: 'subscriptions',
        id: subscriptionId,
        depth: 0,
        overrideAccess: true,
      })
      let projection: any = null
      let unknown = false
      if (row.source === 'provider') {
        try {
          if (!row.providerSubscriptionReference) throw new Error('Not linked')
          projection = await recurringProvider(
            configuredPaymentProvider(row.providerKey),
          ).reconcileSubscription(row.providerSubscriptionReference)
        } catch {
          unknown = true
        }
      }
      let state = projection?.state ?? row.state
      let currentPeriodStart = projection?.currentPeriodStart ?? row.currentPeriodStart
      let currentPeriodEnd = projection?.currentPeriodEnd ?? row.currentPeriodEnd
      let cancelAtPeriodEnd = projection?.cancelAtPeriodEnd ?? row.cancelAtPeriodEnd
      if (state === 'active' && cancelAtPeriodEnd) state = 'cancel_at_period_end'
      let planSnapshot = row.planSnapshot,
        planRevision = id(row.planRevision)
      let failure = unknown
        ? {
            code: 'provider-state-unknown',
            previous:
              row.failure?.code === 'provider-state-unknown' ? row.failure.previous : row.failure,
          }
        : row.failure?.code === 'provider-state-unknown'
          ? row.failure.previous
          : row.failure
      const heldFailure = unknown ? failure?.previous : failure
      const held = ['payment-disputed', 'payment-refunded'].includes(String(heldFailure?.code))
      if (held) state = 'paused'
      if (projection?.priceReference) {
        const plans = await db.find({
          collection: 'plan-revisions',
          where: {
            and: [{ site: { equals: id(row.site) } }, { lifecycle: { equals: 'published' } }],
          },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        })
        const mapping: any = resolveProviderPlanChange(
          plans.docs,
          row.providerKey,
          projection.priceReference,
          String(row.planSnapshot.providerMappings?.[row.providerKey] ?? ''),
        )
        if (
          mapping.plan &&
          providerPlanChangeDue(row.planSnapshot, row.currentPeriodEnd, currentPeriodStart)
        ) {
          planRevision = id(mapping.plan)
          planSnapshot = { ...mapping.plan, id: planRevision }
        } else if (
          mapping.ambiguous ||
          projection.priceReference !== row.planSnapshot.providerMappings?.[row.providerKey]
        ) {
          state = 'paused'
          failure = { code: 'unmapped-provider-price' }
          currentPeriodStart = row.currentPeriodStart
          currentPeriodEnd = row.currentPeriodEnd
        }
      }
      const deadlineRow = {
        ...row,
        failure:
          row.failure?.code === 'provider-state-unknown' ? row.failure.previous : row.failure,
      }
      const deadline = billingDeadline(deadlineRow, state, currentPeriodEnd, now)
      state = deadline.state
      if (state === 'canceled') cancelAtPeriodEnd = false
      if (!unknown && ['active', 'trialing', 'cancel_at_period_end'].includes(state)) failure = null
      const changed =
        state !== row.state ||
        currentPeriodStart !== row.currentPeriodStart ||
        currentPeriodEnd !== row.currentPeriodEnd ||
        cancelAtPeriodEnd !== row.cancelAtPeriodEnd ||
        deadline.graceEnd !== (row.graceEnd ?? null) ||
        planRevision !== id(row.planRevision)
      const version = Number(row.version ?? 1) + (changed ? 1 : 0)
      await db.update({
        collection: 'subscriptions',
        id: row.id,
        data: {
          state,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          graceEnd: deadline.graceEnd,
          failure,
          providerStatus: unknown ? 'unknown' : (projection?.state ?? row.providerStatus),
          lastReconciledAt: now.toISOString(),
          version,
          ...(planRevision !== id(row.planRevision) ? { planRevision, planSnapshot } : {}),
        },
        context: { subscriptionLifecycleTransition: true },
        overrideAccess: true,
      })
      await recomputeSubscriptionEntitlements(db, {
        ...row,
        id: id(row),
        customerId: id(row.supporter),
        supporterId: id(row.supporter),
        siteId: id(row.site),
        plan: planSnapshot,
        provider: { key: row.providerKey },
        state,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        graceEnd: deadline.graceEnd,
        version,
      })
      if (changed) {
        const eventKey = `reconciled:${row.id}:${version}:${createHash('sha256')
          .update(JSON.stringify([state, currentPeriodEnd, planRevision]))
          .digest('hex')
          .slice(0, 16)}`
        await db.create({
          collection: 'subscription-events',
          data: {
            site: id(row.site),
            subscription: row.id,
            eventKey,
            kind: 'reconciled',
            occurredAt: now.toISOString(),
            evidence: {
              state,
              currentPeriodStart,
              currentPeriodEnd,
              graceEnd: deadline.graceEnd,
              providerState: unknown ? 'unknown' : projection?.state,
              planRevision,
            },
          },
          overrideAccess: true,
        })
      }
      if (['grace', 'past_due', 'expired'].includes(state)) {
        const supporter = await db.findByID({
          collection: 'supporters',
          id: id(row.supporter),
          depth: 0,
          overrideAccess: true,
        })
        const expired = state === 'expired'
        await queueBillingSystemNotice(db, {
          siteId: id(row.site),
          memberId: id(supporter.member),
          subscriptionId: id(row),
          noticeKey: `${expired ? 'expired' : 'dunning'}:${row.id}:${deadline.graceEnd ?? currentPeriodEnd}`,
          kind: expired ? 'billing.access_expired' : 'billing.payment_action_required',
          message: expired
            ? 'Your subscription access has ended. Visit billing settings to renew.'
            : `Your renewal needs attention. Payment grace ends ${deadline.graceEnd}. Update your payment method in billing settings.`,
        })
      }
      await payload.db.commitTransaction(transactionID)
      return { state, unknown }
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID)
      throw error
    }
  })
}
