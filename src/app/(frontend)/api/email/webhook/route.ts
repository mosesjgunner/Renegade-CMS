import { timingSafeEqual } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { suppressSubscriber } from '@/modules/audience/service'
import { audienceDigest } from '@/modules/audience/contracts'
export async function POST(request: Request) {
  const raw = await request.text()
  const secret = process.env.EMAIL_WEBHOOK_SECRET
  const actual = request.headers.get('x-audience-signature') ?? ''
  const expected = secret ? audienceDigest(`${secret}:${raw}`) : ''
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return Response.json({ error: 'Invalid provider signature.' }, { status: 401 })
  const body = JSON.parse(raw) as {
    siteId?: string
    email?: string
    event?: 'bounce' | 'complaint'
    provider?: string
  }
  if (!body.siteId || !body.email || !['bounce', 'complaint'].includes(body.event ?? ''))
    return Response.json({ error: 'Invalid provider event.' }, { status: 400 })
  await suppressSubscriber(await getPayload({ config }), {
    siteId: body.siteId,
    email: body.email,
    reason: body.event!,
    provider: body.provider,
  })
  return Response.json({ accepted: true })
}
