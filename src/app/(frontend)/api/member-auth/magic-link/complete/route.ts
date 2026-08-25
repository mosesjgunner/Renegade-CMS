import config from '@payload-config'
import { getPayload } from 'payload'
import { consumeMagicLink, memberSessionCookie } from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string }
  const result = await consumeMagicLink((await getPayload({ config })) as never, body.token ?? '')
  if (!result)
    return Response.json({ error: 'This sign-in link is invalid or expired.' }, { status: 400 })
  return Response.json(
    { status: 'ok' },
    {
      headers: {
        'set-cookie': memberSessionCookie(result.sessionToken, loadConfig().secureCookies),
      },
    },
  )
}
