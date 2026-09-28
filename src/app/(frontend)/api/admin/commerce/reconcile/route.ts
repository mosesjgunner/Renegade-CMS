/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canManageAdminSite } from '@/modules/admin/site-access'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!['owner', 'administrator', 'staff'].includes(String((auth.user as any)?.role)))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const siteId = new URL(request.url).searchParams.get('siteId')
  if ((auth.user as any)?.role === 'staff' && !siteId)
    return NextResponse.json({ error: 'Choose an assigned site.' }, { status: 400 })
  if (siteId && !canManageAdminSite(auth.user, siteId))
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  let body: any = {}
  try {
    body = await request.json()
  } catch {
    // Body is optional for general reconciliation trigger
  }

  const webhookEventId = body?.webhookEventId ? String(body.webhookEventId) : null
  const attemptId =
    body?.paymentAttemptId || body?.attemptId
      ? String(body.paymentAttemptId || body.attemptId)
      : null

  if (webhookEventId) {
    const event: any = await (payload as any)
      .findByID({
        collection: 'payment-webhook-events',
        id: webhookEventId,
        depth: 1,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!event) return NextResponse.json({ error: 'Webhook event not found.' }, { status: 404 })

    const connectionSite = event.merchantConnection?.site
      ? typeof event.merchantConnection.site === 'object'
        ? event.merchantConnection.site.id
        : event.merchantConnection.site
      : null

    if (siteId && connectionSite && String(connectionSite) !== siteId)
      return NextResponse.json(
        { error: 'Webhook event does not belong to the selected site.' },
        { status: 403 },
      )

    await (payload as any).update({
      collection: 'payment-webhook-events',
      id: event.id,
      data: {
        processingState: 'received',
        lastError: null,
      },
      overrideAccess: true,
    })

    const job = await (payload.jobs as any).queue({
      task: 'commerce-process-payment-event',
      input: { webhookEventId: String(event.id) },
      queue: 'commerce',
    })
    return NextResponse.json(
      { queued: true, webhookEventId: String(event.id), jobId: String(job.id) },
      { status: 202 },
    )
  }

  if (attemptId) {
    const attempt: any = await (payload as any)
      .findByID({
        collection: 'payment-attempts',
        id: attemptId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!attempt) return NextResponse.json({ error: 'Payment attempt not found.' }, { status: 404 })

    const attemptSite = typeof attempt.site === 'object' ? attempt.site?.id : attempt.site
    if (siteId && attemptSite && String(attemptSite) !== siteId)
      return NextResponse.json(
        { error: 'Payment attempt does not belong to the selected site.' },
        { status: 403 },
      )

    const job = await (payload.jobs as any).queue({
      task: 'commerce-reconcile-payments',
      input: { attemptId, ...(siteId ? { siteId } : {}) },
      queue: 'commerce',
    })
    return NextResponse.json({ queued: true, attemptId, jobId: String(job.id) }, { status: 202 })
  }

  const job = await (payload.jobs as any).queue({
    task: 'commerce-reconcile-payments',
    input: { ...(siteId ? { siteId } : {}) },
    queue: 'commerce',
  })
  return NextResponse.json({ queued: true, jobId: String(job.id) }, { status: 202 })
}
