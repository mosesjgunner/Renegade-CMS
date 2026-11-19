import { resolveSiteSettings } from '@/modules/core/site-settings'
import config from '@payload-config'
import { getPayload } from 'payload'
import {
  digest,
  enforceAuthRateLimit,
  issueMagicLink,
  MAGIC_LINK_TTL_MS,
} from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
import { boundaryFrom } from '@/modules/email/delivery'
import { dispatchEmailIntent, enqueueEmailIntent } from '@/modules/email/outbox'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const throttle = enforceAuthRateLimit(clientIp)
  if (!throttle.allowed) {
    return Response.json(
      { status: 'Too many requests. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(throttle.retryAfter) } },
    )
  }
  const payload = await getPayload({ config })
  const result = await issueMagicLink(payload as never, body.email ?? '')
  const runtime = loadConfig()
  const accountFrom = boundaryFrom('account', runtime)
  if (result.token && accountFrom) {
    const url = new URL('/member-auth/verify', runtime.appUrl)
    url.searchParams.set('token', result.token)
    try {
      // RC3-EMAIL-01: the sign-in email is a durable intent BEFORE the
      // response is sent. A failed or interrupted send is recovered by the
      // account outbox sweep and stays operator-visible; the adapter result
      // is never discarded again.
      const intent = await enqueueEmailIntent(payload as never, {
        purpose: 'member-sign-in',
        recipientEmail: body.email?.trim() ?? '',
        subject: `Your ${(await resolveSiteSettings(payload)).siteName} member sign-in link`,
        payload: { text: `Use this single-use link to sign in: ${url.toString()}` },
        idempotencyKey: `member-link:${result.token.slice(0, 12)}`,
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
        fromIdentity: accountFrom,
      })
      await dispatchEmailIntent(payload as never, String(intent.id), runtime).catch(() => 'unknown')
    } catch {
      // Compensating action (EMAIL_CONTRACTS §2): if the intent could not be
      // made durable, revoke the just-issued token rather than leave a
      // success-shaped response pointing at mail that can never be recovered.
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
  // Delivery is intentionally capability-gated. Tokens are never returned outside test mode.
  return Response.json({
    status: 'If an eligible address can receive mail, a sign-in link will arrive.',
    testToken: process.env.NODE_ENV === 'test' ? result.token : undefined,
  })
}
