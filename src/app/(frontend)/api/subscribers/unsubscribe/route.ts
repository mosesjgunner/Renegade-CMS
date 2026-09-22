import config from '@payload-config'
import { getPayload } from 'payload'
import { authorizeAudienceAccess, suppressSubscriber } from '@/modules/audience/service'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string }
  const payload = await getPayload({ config })
  const claims = await authorizeAudienceAccess(payload, body.token ?? '', 'unsubscribe')
  if (!claims) return Response.json({ error: 'Invalid unsubscribe link.' }, { status: 400 })
  const subscriber = await payload.findByID({
    collection: 'subscribers',
    id: claims.subscriberId,
    depth: 0,
    overrideAccess: true,
  })
  await suppressSubscriber(payload, {
    siteId: claims.siteId,
    email: String((subscriber as { email: string }).email),
    reason: 'unsubscribe',
  })
  return Response.json({ status: 'unsubscribed' })
}
