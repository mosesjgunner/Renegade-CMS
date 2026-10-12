import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'

const relationId = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const { eventId } = await context.params
  const event = await payload
    .findByID({ collection: 'payment-webhook-events', id: eventId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const merchant = await payload
    .findByID({
      collection: 'merchant-connections',
      id: relationId(event.merchantConnection),
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!merchant || !(await checkOperatorSiteAccess(payload, user, relationId(merchant.site))))
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  if (event.processingState !== 'failed' || !event.verifiedAt || !event.payloadHash)
    return NextResponse.json(
      { error: 'Only failed, verified payment events can be retried.' },
      { status: 409 },
    )
  const evidence = event.sanitizedEvidence as { attemptId?: unknown } | null
  const attemptId = String(evidence?.attemptId ?? '')
  const attempt = attemptId
    ? await payload
        .findByID({ collection: 'payment-attempts', id: attemptId, depth: 0, overrideAccess: true })
        .catch(() => null)
    : null
  if (
    !attempt ||
    relationId(attempt.site) !== relationId(merchant.site) ||
    relationId(attempt.merchantConnection) !== String(merchant.id)
  )
    return NextResponse.json(
      { error: 'The verified event has no matching payment attempt.' },
      { status: 409 },
    )
  const job = await payload.jobs.queue({
    task: 'commerce-process-payment-event',
    input: { webhookEventId: eventId, requestedBy: String(user.id) },
    queue: 'commerce',
  })
  return NextResponse.json(
    { queued: true, jobId: String(job.id), eventId },
    { status: 202, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
