/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { createHash } from 'node:crypto'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  queueBillingSystemNotice,
  recomputeSubscriptionEntitlements,
} from '@/modules/commerce/subscription-service'

const staffOnly = (role: unknown) => ['owner', 'administrator', 'staff'].includes(String(role))
const fingerprint = (
  memberId: string,
  planId: string,
  expiresAt: string,
  reason: string,
  source: string,
) =>
  createHash('sha256')
    .update(`${memberId}|${planId}|${expiresAt}|${reason.trim()}|${source}`)
    .digest('hex')

/** Explicit complimentary agreement; it never creates or implies a payment. */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staffOnly((auth.user as any)?.role))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const input = await request.json()
  const memberId = String(input.memberId ?? ''),
    planId = String(input.planRevisionId ?? ''),
    expiresAt = String(input.expiresAt ?? ''),
    reason = String(input.reason ?? '').trim()
  if (
    !memberId ||
    !planId ||
    !reason ||
    reason.length < 8 ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now()
  )
    return NextResponse.json(
      {
        error:
          'memberId, planRevisionId, a future expiresAt, and a reason of at least eight characters are required.',
      },
      { status: 400 },
    )
  const source = input.source === 'migration' ? 'migration' : 'complimentary'
  const siteId = String(input.siteId ?? '')
  const plan: any = await (payload as any)
    .findByID({ collection: 'plan-revisions', id: planId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (
    !plan ||
    String(typeof plan.site === 'object' ? plan.site.id : plan.site) !== siteId ||
    plan.lifecycle !== 'published'
  )
    return NextResponse.json({ error: 'Published plan not found for this site.' }, { status: 404 })
  const previewHash = fingerprint(memberId, planId, expiresAt, reason, source)
  if (input.action === 'preview')
    return NextResponse.json({
      previewHash,
      memberId,
      plan: { id: plan.id, name: plan.name, entitlements: plan.entitlements },
      source,
      expiresAt,
      payment: null,
    })
  if (input.action !== 'grant' || input.previewHash !== previewHash)
    return NextResponse.json(
      { error: 'Review the grant preview and submit its previewHash to confirm.' },
      { status: 409 },
    )
  const db: any = payload
  const member = await db
    .findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  const supporters = await db.find({
    collection: 'supporters',
    where: { and: [{ site: { equals: siteId } }, { member: { equals: memberId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  let supporter = supporters.docs[0]
  if (!supporter)
    supporter = await db.create({
      collection: 'supporters',
      data: { site: siteId, member: memberId, displayName: '', providerReferences: [] },
      overrideAccess: true,
    })
  const idempotencyKey = String(input.idempotencyKey ?? '').trim()
  if (!idempotencyKey || idempotencyKey.length > 160)
    return NextResponse.json({ error: 'A bounded Idempotency-Key is required.' }, { status: 400 })
  const grantKey = `${source}:${createHash('sha256').update(`${siteId}|${memberId}|${idempotencyKey}`).digest('hex')}`
  const previous = await db.find({
    collection: 'subscriptions',
    where: { checkoutKey: { equals: grantKey } },
    limit: 1,
    overrideAccess: true,
  })
  if (previous.docs.length) {
    await queueBillingSystemNotice(db, {
      siteId,
      memberId,
      subscriptionId: String(previous.docs[0].id),
      noticeKey: `grant:${grantKey}`,
      kind: 'billing.grant_issued',
      message: `A ${source === 'migration' ? 'grandfathered' : 'complimentary'} access grant is active until ${expiresAt}. Reason: ${reason}`,
    })
    return NextResponse.json({ subscriptionId: previous.docs[0].id, replay: true })
  }
  const now = new Date().toISOString()
  const snapshot = {
    id: String(plan.id),
    planKey: String(plan.planKey),
    revision: Number(plan.revision),
    publishedAt: String(plan.publishedAt),
    lifecycle: 'published' as const,
    interval: plan.interval,
    intervalCount: Number(plan.intervalCount),
    amountMinor: String(plan.amountMinor),
    currency: String(plan.currency),
    trialDays: 0,
    trialEligibility: 'none' as const,
    entitlements: plan.entitlements ?? [],
    cancelPolicy: plan.cancelPolicy,
    changePolicy: plan.changePolicy,
    taxPolicy: plan.taxPolicy,
    providerMappings: {},
  }
  const subscription = await db.create({
    collection: 'subscriptions',
    data: {
      site: siteId,
      supporter: supporter.id,
      planRevision: plan.id,
      planSnapshot: snapshot,
      providerKey: source,
      state: 'active',
      source,
      currentPeriodStart: now,
      currentPeriodEnd: expiresAt,
      cancelAtPeriodEnd: false,
      version: 1,
      checkoutKey: grantKey,
      settings: { reason, grantedBy: String((auth.user as any)?.id ?? '') },
    },
    overrideAccess: true,
  })
  const eventKey = `staff-grant:${grantKey}`
  await db.create({
    collection: 'subscription-events',
    data: {
      site: siteId,
      subscription: subscription.id,
      eventKey,
      kind: 'activated',
      occurredAt: now,
      evidence: { reason, grantedBy: String((auth.user as any)?.id ?? ''), source, expiresAt },
    },
    overrideAccess: true,
  })
  await recomputeSubscriptionEntitlements(db, {
    id: String(subscription.id),
    customerId: String(supporter.id),
    supporterId: String(supporter.id),
    siteId,
    plan: snapshot,
    provider: { key: source },
    state: 'active',
    source,
    currentPeriodStart: now,
    currentPeriodEnd: expiresAt,
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
    version: 1,
  })
  await queueBillingSystemNotice(db, {
    siteId,
    memberId,
    subscriptionId: String(subscription.id),
    noticeKey: `grant:${grantKey}`,
    kind: 'billing.grant_issued',
    message: `A ${source === 'migration' ? 'grandfathered' : 'complimentary'} access grant is active until ${expiresAt}. Reason: ${reason}`,
  })
  return NextResponse.json({ subscriptionId: subscription.id, source, expiresAt }, { status: 201 })
}
