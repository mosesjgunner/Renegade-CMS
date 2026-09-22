import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession, requestEmailLink, verifyCsrf } from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
import { selectEmailDeliveryAdapter } from '@/modules/email/delivery'
import { resolveSiteSettings } from '@/modules/core/site-settings'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Missing or invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const result = await requestEmailLink(payload as never, memberId, body.email ?? '')
  const runtime = loadConfig()
  if (result.token && runtime.email.from) {
    const url = new URL('/member-auth/link/verify', runtime.appUrl)
    url.searchParams.set('token', result.token)
    await selectEmailDeliveryAdapter(runtime).send({
      from: runtime.email.from,
      to: body.email?.trim() ?? '',
      subject: `Confirm this email for your ${(await resolveSiteSettings(payload)).siteName} account`,
      text: `Use this single-use link to confirm this email address: ${url.toString()}`,
      idempotencyKey: `member-link-confirm:${result.token.slice(0, 12)}`,
      category: 'transactional',
    })
  }
  return Response.json({
    status: 'If this address can receive mail, a confirmation link will arrive.',
    testToken: process.env.NODE_ENV === 'test' ? result.token : undefined,
  })
}
