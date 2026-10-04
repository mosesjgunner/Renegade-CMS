import config from '@payload-config'
import { getPayload } from 'payload'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role)))
    return Response.json({ error: 'Staff access required.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  try {
    const delivery = await payload.findByID({
      collection: 'email-deliveries',
      id: String(body.deliveryId ?? ''),
      depth: 0,
      overrideAccess: false,
      user,
    })
    const outcome = delivery.outcome as { retryable?: boolean; code?: string } | null
    if (
      !['failed', 'dead-letter', 'queued'].includes(delivery.status) ||
      !(outcome?.retryable || outcome?.code === 'email_capability_disabled')
    )
      return Response.json({ error: 'This outcome cannot be safely retried.' }, { status: 409 })
    await payload.update({
      collection: 'email-deliveries',
      id: delivery.id,
      data: { status: 'queued' },
      overrideAccess: false,
      user,
    })
    await payload.jobs.queue({
      task: 'audience-email-delivery',
      input: { deliveryId: String(delivery.id) },
      queue: 'operations',
    })
    return Response.json({ status: 'queued' })
  } catch {
    return Response.json({ error: 'Delivery unavailable.' }, { status: 400 })
  }
}
