import config from '@payload-config'
import { getPayload } from 'payload'
import { verifyEmailWebhookSignature } from '@/modules/audience/contracts'
import { processProviderSuppressionEvent } from '@/modules/audience/service'

export async function POST(request: Request) {
  const raw = await request.text()
  if (
    !verifyEmailWebhookSignature(
      raw,
      request.headers.get('x-audience-signature') ?? '',
      process.env.EMAIL_WEBHOOK_SECRET,
    )
  )
    return Response.json({ error: 'Invalid provider signature.' }, { status: 401 })
  const body = JSON.parse(raw) as {
    siteId?: string
    email?: string
    event?: 'bounce' | 'complaint' | 'unsubscribe'
    provider?: string
    providerMessageId?: string
  }
  if (
    !body.siteId ||
    !body.email ||
    !body.providerMessageId ||
    !['bounce', 'complaint', 'unsubscribe'].includes(body.event ?? '')
  )
    return Response.json({ error: 'Invalid provider event.' }, { status: 400 })
  try {
    await processProviderSuppressionEvent(await getPayload({ config }), {
      siteId: body.siteId,
      email: body.email,
      event: body.event!,
      provider: body.provider,
      providerMessageId: body.providerMessageId,
    })
  } catch {
    return Response.json({ error: 'Provider event does not match a delivery.' }, { status: 400 })
  }
  return Response.json({ accepted: true })
}
