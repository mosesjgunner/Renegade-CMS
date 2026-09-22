import config from '@payload-config'
import { getPayload } from 'payload'

import { confirmEmailLink } from '@/modules/identity/member-identity'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string }
  const payload = await getPayload({ config })
  const confirmed = await confirmEmailLink(payload as never, body.token ?? '')
  if (!confirmed)
    return Response.json({ error: 'This confirmation link is invalid or expired.' }, { status: 400 })
  return Response.json({ status: 'ok' })
}
