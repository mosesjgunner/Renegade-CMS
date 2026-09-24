/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  subscriptionMetrics,
  type EntitlementGrant,
  type Subscription,
} from '@/modules/commerce/subscription-contract'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!['owner', 'administrator', 'staff'].includes(String((auth.user as any)?.role)))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const db: any = payload
  const siteId = new URL(request.url).searchParams.get('siteId')
  const where = siteId ? { site: { equals: siteId } } : undefined
  const subscriptions = await db.find({
    collection: 'subscriptions',
    ...(where ? { where } : {}),
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  })
  const entitlements = await db.find({
    collection: 'entitlements',
    ...(where ? { where } : {}),
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })
  const normalized: Subscription[] = subscriptions.docs.map((row: any) => ({
    id: String(row.id),
    customerId: String(typeof row.supporter === 'object' ? row.supporter.id : row.supporter),
    siteId: String(typeof row.site === 'object' ? row.site.id : row.site),
    plan: row.planSnapshot,
    provider: {
      key: String(row.providerKey),
      subscriptionRef: row.providerSubscriptionReference,
      status: row.providerStatus,
    },
    state: row.state,
    source: row.source,
    currentPeriodStart: String(row.currentPeriodStart),
    currentPeriodEnd: String(row.currentPeriodEnd),
    cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
    ...(row.trialEnd ? { trialEnd: String(row.trialEnd) } : {}),
    ...(row.graceEnd ? { graceEnd: String(row.graceEnd) } : {}),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    version: Number(row.version ?? 1),
  }))
  const grants: EntitlementGrant[] = entitlements.docs
    .filter((row: any) => row.resource && row.capability)
    .map((row: any) => ({
      id: String(row.grantKey ?? row.id),
      subjectId: String(typeof row.supporter === 'object' ? (row.supporter.member ?? '') : ''),
      sourceId: String(row.source),
      resource: String(row.resource),
      capability: String(row.capability),
      siteId: String(typeof row.site === 'object' ? row.site.id : row.site),
      ...(row.scope ? { scope: String(row.scope) } : {}),
      startsAt: String(row.startsAt),
      ...(row.endsAt ? { endsAt: String(row.endsAt) } : {}),
      ...(row.limit != null ? { limit: Number(row.limit) } : {}),
      evidence: row.evidence ?? {},
      ...(row.revokedAt ? { revokedAt: String(row.revokedAt) } : {}),
    }))
  const now = new Date().toISOString()
  return NextResponse.json({
    metricsByCurrency: subscriptionMetrics(normalized, grants, now),
    operatorQueue: subscriptions.docs
      .filter((row: any) => ['past_due', 'grace', 'paused'].includes(String(row.state)))
      .map((row: any) => ({
        id: String(row.id),
        siteId: String(typeof row.site === 'object' ? row.site.id : row.site),
        state: String(row.state),
        currency: String(row.planSnapshot?.currency ?? ''),
        amountMinor: String(row.planSnapshot?.amountMinor ?? '0'),
        currentPeriodEnd: row.currentPeriodEnd,
        graceEnd: row.graceEnd ?? null,
        source: String(row.source),
        provider: String(row.providerKey),
        reason: row.failure?.code ?? null,
      })),
  })
}
