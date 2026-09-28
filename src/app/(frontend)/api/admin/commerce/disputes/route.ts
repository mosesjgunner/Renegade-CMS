/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
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

  const stateFilter = url.searchParams.get('state')
  const where: any = siteId
    ? stateFilter
      ? { and: [{ site: { equals: siteId } }, { state: { equals: stateFilter } }] }
      : { site: { equals: siteId } }
    : stateFilter
      ? { state: { equals: stateFilter } }
      : undefined

  const disputes = await db.find({
    collection: 'commerce-disputes',
    where,
    limit: 100,
    sort: '-createdAt',
    depth: 1,
    overrideAccess: true,
  })

  return NextResponse.json({
    disputes: disputes.docs.map((doc: any) => ({
      id: doc.id,
      orderId: typeof doc.order === 'object' ? doc.order?.id : doc.order,
      paymentAttemptId:
        typeof doc.paymentAttempt === 'object' ? doc.paymentAttempt?.id : doc.paymentAttempt,
      providerDisputeReference: doc.providerDisputeReference,
      amountMinor: doc.amountMinor,
      currency: doc.currency,
      state: doc.state,
      reason: doc.reason ?? null,
      deadlineAt: doc.deadlineAt ?? null,
      sanitizedEvidence: doc.sanitizedEvidence ?? {},
      auditLog: doc.auditLog ?? [],
      createdAt: doc.createdAt,
    })),
    totalDocs: disputes.totalDocs,
  })
}

export async function PATCH(request: Request) {
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

  const body = (await request.json().catch(() => ({}))) as {
    disputeId?: string
    action?: 'submit-evidence' | 'update-status'
    state?: 'open' | 'under-review' | 'won' | 'lost' | 'closed'
    evidenceText?: string
    evidenceFiles?: string[]
  }

  const disputeId = String(body.disputeId ?? '')
  if (!disputeId) return NextResponse.json({ error: 'disputeId is required.' }, { status: 400 })

  const dispute: any = await db
    .findByID({
      collection: 'commerce-disputes',
      id: disputeId,
      depth: 1,
      overrideAccess: true,
    })
    .catch(() => null)

  if (!dispute) return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 })

  const disputeSite = typeof dispute.site === 'object' ? dispute.site?.id : dispute.site
  if (!canManageAdminSite(auth.user, disputeSite) || (siteId && String(disputeSite) !== siteId))
    return NextResponse.json({ error: 'Dispute site access denied.' }, { status: 403 })

  const actorId = String((auth.user as any)?.id ?? '')
  const now = new Date().toISOString()
  const audit = Array.isArray(dispute.auditLog) ? dispute.auditLog : []

  if (body.action === 'submit-evidence') {
    const evidenceText = String(body.evidenceText ?? '').trim()
    if (!evidenceText)
      return NextResponse.json({ error: 'Evidence text is required.' }, { status: 400 })

    const updated = await db.update({
      collection: 'commerce-disputes',
      id: dispute.id,
      data: {
        state: 'under-review',
        sanitizedEvidence: {
          ...(dispute.sanitizedEvidence ?? {}),
          operatorSubmission: {
            text: evidenceText,
            files: body.evidenceFiles ?? [],
            submittedBy: actorId,
            submittedAt: now,
          },
        },
        auditLog: [
          ...audit,
          {
            kind: 'evidence-submitted',
            actorId,
            at: now,
            evidenceSummary: evidenceText.slice(0, 100),
          },
        ],
      },
      overrideAccess: true,
    })

    return NextResponse.json({ dispute: updated })
  }

  if (body.action === 'update-status') {
    const targetState = body.state
    if (!targetState || !['open', 'under-review', 'won', 'lost', 'closed'].includes(targetState))
      return NextResponse.json({ error: 'Valid dispute state is required.' }, { status: 400 })

    const orderId = typeof dispute.order === 'object' ? dispute.order?.id : dispute.order
    const updated = await db.update({
      collection: 'commerce-disputes',
      id: dispute.id,
      data: {
        state: targetState,
        auditLog: [
          ...audit,
          {
            kind: `status-changed-to-${targetState}`,
            previousState: dispute.state,
            newState: targetState,
            actorId,
            at: now,
          },
        ],
      },
      overrideAccess: true,
    })

    if (orderId && ['won', 'lost'].includes(targetState)) {
      const order = await db
        .findByID({
          collection: 'orders',
          id: orderId,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)

      if (order) {
        if (targetState === 'won') {
          await db.update({
            collection: 'orders',
            id: order.id,
            data: {
              state: 'paid',
              exception: null,
              transitionLog: [
                ...(order.transitionLog ?? []),
                { kind: 'dispute-won', disputeId: dispute.id, at: now, actorId },
              ],
            },
            overrideAccess: true,
          })
        } else if (targetState === 'lost') {
          await db.update({
            collection: 'orders',
            id: order.id,
            data: {
              state: 'exception',
              exception: {
                code: 'dispute-lost',
                disputeReference: dispute.providerDisputeReference,
              },
              transitionLog: [
                ...(order.transitionLog ?? []),
                { kind: 'dispute-lost', disputeId: dispute.id, at: now, actorId },
              ],
            },
            overrideAccess: true,
          })
          // Revoke entitlements upon confirmed lost dispute / reversal
          const grants = await db.find({
            collection: 'digital-delivery-grants',
            where: { order: { equals: order.id } },
            limit: 100,
            overrideAccess: true,
          })
          for (const grant of grants.docs as any[]) {
            await db.update({
              collection: 'digital-delivery-grants',
              id: grant.id,
              data: { state: 'revoked' },
              overrideAccess: true,
            })
          }
          const entitlements = await db.find({
            collection: 'entitlements',
            where: { source: { in: [String(order.id), String(order.orderNumber)] } },
            limit: 100,
            overrideAccess: true,
          })
          for (const entitlement of entitlements.docs as any[]) {
            await db.update({
              collection: 'entitlements',
              id: entitlement.id,
              data: { revokedAt: now },
              overrideAccess: true,
            })
          }
        }
      }
    }

    return NextResponse.json({ dispute: updated })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
