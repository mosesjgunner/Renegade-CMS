import config from '@payload-config'
import { getPayload } from 'payload'
import { issueMagicLink } from '@/modules/identity/member-identity'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const result = await issueMagicLink((await getPayload({ config })) as never, body.email ?? '')
  // Delivery is intentionally capability-gated. Tokens are never returned outside test mode.
  return Response.json({
    status: 'If an eligible address can receive mail, a sign-in link will arrive.',
    testToken: process.env.NODE_ENV === 'test' ? result.token : undefined,
  })
}
