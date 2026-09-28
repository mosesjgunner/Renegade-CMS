/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { financeDashboardSummary } from '@/modules/commerce/payment-operations'
import { configuredPaymentProvider } from '@/modules/commerce/payment-provider'
import { canManageAdminSite } from '@/modules/admin/site-access'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const db: any = payload
  const auth = await payload.auth({ headers: request.headers })
  if (!staffOnly(auth.user)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  if (auth.user?.role === 'staff' && !siteId)
    return NextResponse.json({ error: 'Choose an assigned site.' }, { status: 400 })
  if (siteId && !canManageAdminSite(auth.user, siteId))
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

  const rawDateRange = url.searchParams.get('dateRange')
  const dateRange = (
    ['24h', '7d', '30d', 'all'].includes(String(rawDateRange)) ? rawDateRange : '30d'
  ) as '24h' | '7d' | '30d' | 'all'
  const now = new Date()
  const dateFromMs =
    dateRange === '24h'
      ? now.getTime() - 24 * 3600 * 1000
      : dateRange === '7d'
        ? now.getTime() - 7 * 86400 * 1000
        : dateRange === '30d'
          ? now.getTime() - 30 * 86400 * 1000
          : null
  const dateFilter = dateFromMs
    ? { createdAt: { greater_than_equal: new Date(dateFromMs).toISOString() } }
    : undefined

  const baseWhere = siteId ? { site: { equals: siteId } } : undefined
  const attemptsWhere =
    baseWhere && dateFilter
      ? { and: [{ site: { equals: siteId } }, dateFilter] }
      : baseWhere || dateFilter

  const merchantIds = siteId
    ? (
        await db.find({
          collection: 'merchant-connections',
          where: { site: { equals: siteId } },
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
      ).docs.map((row: any) => row.id)
    : []
  const [attempts, refunds, disputes, inbox, reconciliationCases] = await Promise.all([
    db.find({
      collection: 'payment-attempts',
      where: attemptsWhere,
      limit: 500,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }),
    db.find({
      collection: 'commerce-refunds',
      where: baseWhere,
      limit: 100,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }),
    db.find({
      collection: 'commerce-disputes',
      where: baseWhere,
      limit: 100,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }),
    db.find({
      collection: 'payment-webhook-events',
      where: siteId
        ? {
            and: [
              { processingState: { in: ['failed', 'gap'] } },
              {
                merchantConnection: {
                  in: merchantIds.length ? merchantIds : ['00000000-0000-0000-0000-000000000000'],
                },
              },
            ],
          }
        : { processingState: { in: ['failed', 'gap'] } },
      limit: 100,
      sort: '-verifiedAt',
      depth: 0,
      overrideAccess: true,
    }),
    db.find({
      collection: 'commerce-reconciliation-cases',
      where: siteId
        ? { and: [{ site: { equals: siteId } }, { status: { equals: 'quarantined' } }] }
        : { status: { equals: 'quarantined' } },
      limit: 100,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }),
  ])
  const providerKeys = [...new Set((attempts.docs as any[]).map((row) => row.providerKey))]
  const health = await Promise.all(
    providerKeys.map(async (key) => {
      try {
        return { providerKey: key, ...(await configuredPaymentProvider(key).readiness()) }
      } catch (error) {
        return {
          providerKey: key,
          ready: false,
          health: 'unavailable',
          reason: error instanceof Error ? error.message : 'unavailable',
        }
      }
    }),
  )
  return NextResponse.json(
    {
      summary: financeDashboardSummary(
        (attempts.docs as any[]).map((row) => ({
          state: row.state,
          amountMinor: row.amountMinor,
          currency: row.currency,
          createdAt: row.createdAt,
          reconciledAt: row.lastReconciledAt,
        })),
      ),
      summaryScope: {
        sampled: attempts.hasNextPage,
        rows: attempts.docs.length,
        totalRows: attempts.totalDocs,
        dateRange,
        dateFrom: dateFromMs ? new Date(dateFromMs).toISOString() : null,
        dateTo: now.toISOString(),
      },
      health,
      pendingActions: (attempts.docs as any[])
        .filter((row) => ['unknown', 'failed', 'processing'].includes(row.state))
        .slice(0, 50)
        .map((row) => ({
          id: row.id,
          state: row.state,
          amountMinor: row.amountMinor,
          currency: row.currency,
          createdAt: row.createdAt,
          safeActions:
            row.state === 'unknown'
              ? ['reconcile']
              : row.state === 'failed'
                ? ['retry', 'inspect']
                : ['inspect'],
        })),
      refunds: (refunds.docs as any[]).map((row) => ({
        id: row.id,
        state: row.state,
        amountMinor: row.amountMinor,
        currency: row.currency,
        createdAt: row.createdAt,
      })),
      disputes: (disputes.docs as any[]).map((row) => ({
        id: row.id,
        state: row.state,
        amountMinor: row.amountMinor,
        currency: row.currency,
        deadlineAt: row.deadlineAt ?? null,
      })),
      webhookFailures: (inbox.docs as any[]).map((row) => ({
        id: row.id,
        state: row.processingState,
        providerKey: row.providerKey,
        verifiedAt: row.verifiedAt,
        error: row.lastError ?? null,
      })),
      reconciliationCases: (reconciliationCases.docs as any[]).map((row) => ({
        id: row.id,
        reason: row.reason,
        createdAt: row.createdAt,
        status: row.status,
      })),
      disclaimer:
        'Operational ledger totals; not certified accounting or provider settlement balances.',
      disclosures: {
        nonSettlement:
          'Operational ledger totals; not certified accounting or provider settlement balances. External payment providers operate under sandbox API contracts. Local ledger entries marked provider-confirmed represent operational API captures only; never simulate a confirmed settlement as real money or bank deposit.',
        taxAndDeductibility:
          'Direct donations, memberships, and digital orders are not tax-deductible unless the operating organization holds certified 501(c)(3) or jurisdictional charitable status with formal donor receipting. Local sales tax and VAT are estimated where configured and do not represent certified tax advice.',
        analyticsLatency:
          'Attribution funnels and conversion rollups reflect pipeline batching latency (typically 5-15 minutes). Traffic lacking cryptographic consent (DNT/GPC headers or consent opt-out) is strictly omitted from conversion attribution to prevent false certainty.',
        providerLimitations:
          'Provider sandbox mode enabled where supported. Fiat settlement and automated bank payouts are strictly disconnected.',
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
