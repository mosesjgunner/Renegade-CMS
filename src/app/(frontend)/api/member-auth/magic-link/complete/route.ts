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
import { communitySiteForHost } from '@/modules/community/site-scope'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string }
  const payload = await getPayload({ config })
  const siteId = await communitySiteForHost(payload, request.headers.get('host')).catch(() => null)
  if (!siteId) return Response.json({ error: 'Community site unavailable.' }, { status: 404 })
  const policy = await resolveCommunityRegistrationPolicy(payload as never, siteId)
  const result = await consumeMagicLink(payload as never, body.token ?? '', new Date(), {
    policy,
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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token') ?? ''
  const payload = await getPayload({ config })
  const siteId = await communitySiteForHost(payload, request.headers.get('host')).catch(() => null)
  if (!siteId) return Response.json({ error: 'Community site unavailable.' }, { status: 404 })
  const policy = await resolveCommunityRegistrationPolicy(payload as never, siteId)
  const result = await consumeMagicLink(payload as never, token, new Date(), { policy })
  if (!result) {
    return Response.redirect(new URL('/member-auth?error=invalid-token', request.url))
  }
  if (result.pendingApproval) {
    return Response.redirect(new URL('/member-auth?status=pending-approval', request.url))
  }
  const secure = loadConfig().secureCookies
  const csrfToken = issueCsrfToken()
  const redirectResponse = Response.redirect(new URL('/members/settings', request.url), 302)
  redirectResponse.headers.append('set-cookie', memberSessionCookie(result.sessionToken, secure))
  redirectResponse.headers.append('set-cookie', csrfCookie(csrfToken, secure))
  return redirectResponse
}
