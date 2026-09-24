/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { financeDashboardSummary } from '@/modules/commerce/payment-operations'
import { configuredPaymentProvider } from '@/modules/commerce/payment-provider'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const db: any = payload
  const auth = await payload.auth({ headers: request.headers })
  if (!staffOnly(auth.user)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const siteId = new URL(request.url).searchParams.get('siteId')
  const where = siteId ? { site: { equals: siteId } } : undefined
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
      where,
      limit: 500,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }),
    db.find({
      collection: 'commerce-refunds',
      where,
      limit: 100,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }),
    db.find({
      collection: 'commerce-disputes',
      where,
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
          createdAt: row.createdAt,
          reconciledAt: row.lastReconciledAt,
        })),
      ),
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
          safeActions: row.state === 'unknown' ? ['reconcile'] : [],
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
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
