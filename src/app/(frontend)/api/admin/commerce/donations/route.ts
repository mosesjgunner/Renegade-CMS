/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { calculateDonationProgress } from '@/modules/commerce/donations'

const allowed = ['owner', 'administrator', 'staff']
const rel = (value: any) => String(typeof value === 'object' && value ? value.id : (value ?? ''))

export async function GET(request: Request) {
  const payload: any = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!allowed.includes(String((auth.user as any)?.role)))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const donations = await payload.find({
    collection: 'donations',
    limit: 10000,
    depth: 0,
    overrideAccess: true,
    sort: '-createdAt',
  })
  const campaigns = await payload.find({
    collection: 'donation-campaigns',
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })
  const allDonations = donations.docs as any[]
  const events = await payload.find({
    collection: 'donation-events',
    limit: 20000,
    depth: 0,
    overrideAccess: true,
  })
  const reversed = new Map<string, bigint>()
  for (const event of events.docs as any[])
    if (event.kind === 'partially-refunded') {
      const id = rel(event.donation)
      reversed.set(
        id,
        (reversed.get(id) ?? 0n) + BigInt(String(event.evidence?.amountMinor ?? '0')),
      )
    }
  const projections = allDonations.map((row) => ({
    ...row,
    reversedAmountMinor: String(reversed.get(String(row.id)) ?? 0n),
  }))
  const currencies = [...new Set(allDonations.map((row) => String(row.currency)))]
  const metrics = Object.fromEntries(
    currencies.map((currency) => [currency, calculateDonationProgress(projections, currency)]),
  )
  const rows = allDonations.map((row) => ({
    id: String(row.id),
    supporterId: rel(row.supporter),
    campaignId: rel(row.campaign),
    paymentIntentId: rel(row.paymentIntent),
    settledAt: row.receiptSnapshot?.settledAt ?? row.createdAt,
    amountMinor: row.baseAmountMinor,
    reversedAmountMinor: String(reversed.get(String(row.id)) ?? 0n),
    feeCoveredAmountMinor: row.feeCoveredAmountMinor,
    currency: row.currency,
    designation: row.designation ?? '',
    recurrence: row.receiptSnapshot?.recurrence ?? '',
    lifecycle: row.lifecycle,
    recognition: row.recognition,
    donor:
      row.recognition === 'public'
        ? row.publicDisplayName
        : row.recognition === 'anonymous'
          ? 'Anonymous'
          : 'Private',
    receiptSnapshot: row.receiptSnapshot ?? null,
  }))
  const format = new URL(request.url).searchParams.get('format')
  if (format === 'csv') {
    const columns = [
      'id',
      'campaignId',
      'paymentIntentId',
      'settledAt',
      'amountMinor',
      'feeCoveredAmountMinor',
      'currency',
      'designation',
      'recurrence',
      'lifecycle',
      'recognition',
      'donor',
    ]
    const esc = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    return new Response(
      [
        columns.join(','),
        ...rows.map((row) => columns.map((column) => esc((row as any)[column])).join(',')),
      ].join('\r\n'),
      {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="donation-reconciliation.csv"',
          'Cache-Control': 'no-store',
        },
      },
    )
  }
  return NextResponse.json(
    {
      metricsByCurrency: metrics,
      campaigns: (campaigns.docs as any[]).map((row) => ({
        id: String(row.id),
        title: row.title,
        currency: row.currency,
        progress: calculateDonationProgress(
          projections.filter((gift: any) => rel(gift.campaign) === String(row.id)),
          row.currency,
          row.goalAmountMinor,
        ),
      })),
      reconciliation: rows,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PATCH(request: Request) {
  const payload: any = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!allowed.includes(String((auth.user as any)?.role)))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const supporterId = String(body.supporterId ?? '')
  if (!supporterId) return NextResponse.json({ error: 'supporterId is required.' }, { status: 400 })
  const supporter = await payload
    .findByID({ collection: 'supporters', id: supporterId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!supporter) return NextResponse.json({ error: 'Supporter not found.' }, { status: 404 })
  if (body.action === 'privacy') {
    if (!['public', 'anonymous', 'private'].includes(body.visibilityPreference))
      return NextResponse.json({ error: 'Invalid privacy preference.' }, { status: 400 })
    const updated = await payload.update({
      collection: 'supporters',
      id: supporterId,
      data: { visibilityPreference: body.visibilityPreference },
      overrideAccess: true,
    })
    return NextResponse.json({ supporterId, visibilityPreference: updated.visibilityPreference })
  }
  if (body.action === 'mask-retention') {
    await payload.update({
      collection: 'supporters',
      id: supporterId,
      data: {
        displayName: 'Privacy-masked supporter',
        emailHash: null,
        visibilityPreference: 'private',
      },
      overrideAccess: true,
    })
    return NextResponse.json({ supporterId, masked: true, financialAuditRecordsPreserved: true })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
