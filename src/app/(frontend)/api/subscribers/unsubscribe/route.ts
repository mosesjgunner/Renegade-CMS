import config from '@payload-config'
import { getPayload } from 'payload'
import { suppressSubscriber } from '@/modules/audience/service'
import { verifyAudienceToken } from '@/modules/audience/contracts'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string }
  const value = verifyAudienceToken(body.token ?? '', process.env.PAYLOAD_SECRET ?? '')
  if (!value) return Response.json({ error: 'Invalid unsubscribe link.' }, { status: 400 })
  const [siteId, email] = value.split('|')
  if (!siteId || !email)
    return Response.json({ error: 'Invalid unsubscribe link.' }, { status: 400 })
  await suppressSubscriber(await getPayload({ config }), { siteId, email, reason: 'unsubscribe' })
  return Response.json({ status: 'unsubscribed' })
}
