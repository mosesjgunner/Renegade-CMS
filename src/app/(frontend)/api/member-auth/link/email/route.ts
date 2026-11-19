import config from '@payload-config'
import { getPayload } from 'payload'

import {
  currentMember,
  digest,
  MAGIC_LINK_TTL_MS,
  readMemberSession,
  requestEmailLink,
  verifyCsrf,
} from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
import { boundaryFrom } from '@/modules/email/delivery'
import { dispatchEmailIntent, enqueueEmailIntent } from '@/modules/email/outbox'
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
  const accountFrom = boundaryFrom('account', runtime)
  if (result.token && accountFrom) {
    const url = new URL('/member-auth/link/verify', runtime.appUrl)
    url.searchParams.set('token', result.token)
    try {
      // RC3-EMAIL-01: durable intent before responding (see magic-link route).
      const intent = await enqueueEmailIntent(payload as never, {
        purpose: 'member-email-link',
        recipientEmail: body.email?.trim() ?? '',
        subject: `Confirm this email for your ${(await resolveSiteSettings(payload)).siteName} account`,
        payload: {
          text: `Use this single-use link to confirm this email address: ${url.toString()}`,
        },
        idempotencyKey: `member-link-confirm:${result.token.slice(0, 12)}`,
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
        fromIdentity: accountFrom,
      })
      await dispatchEmailIntent(payload as never, String(intent.id), runtime).catch(() => 'unknown')
    } catch {
      const orphan = await payload.find({
        collection: 'identity-tokens',
        where: { tokenHash: { equals: digest(result.token) } },
        limit: 1,
        overrideAccess: true,
      })
      if (orphan.docs[0]) {
        await payload.delete({
          collection: 'identity-tokens',
          id: String(orphan.docs[0].id),
          overrideAccess: true,
        })
      }
    }
  }
  return Response.json({
    status: 'If this address can receive mail, a confirmation link will arrive.',
    testToken: process.env.NODE_ENV === 'test' ? result.token : undefined,
  })
}
