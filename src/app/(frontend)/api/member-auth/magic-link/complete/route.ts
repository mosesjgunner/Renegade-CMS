import config from '@payload-config'
import { getPayload } from 'payload'
import {
  consumeMagicLink,
  csrfCookie,
  issueCsrfToken,
  memberSessionCookie,
  resolveCommunityRegistrationPolicy,
} from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; inviteCode?: string }
  const payload = await getPayload({ config })
  const policy = await resolveCommunityRegistrationPolicy(payload as never)
  const result = await consumeMagicLink(payload as never, body.token ?? '', new Date(), {
    policy,
    hasInvite: Boolean(body.inviteCode),
  })
  if (!result)
    return Response.json({ error: 'This sign-in link is invalid or expired.' }, { status: 400 })
  if (result.pendingApproval)
    return Response.json({
      status: 'pending-approval',
      message: 'Your registration is awaiting staff approval.',
    })
  const secure = loadConfig().secureCookies
  const csrfToken = issueCsrfToken()
  return Response.json(
    { status: 'ok' },
    {
      headers: [
        ['set-cookie', memberSessionCookie(result.sessionToken, secure)],
        ['set-cookie', csrfCookie(csrfToken, secure)],
      ],
    },
  )
}

