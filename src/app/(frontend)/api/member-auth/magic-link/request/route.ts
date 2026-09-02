import config from '@payload-config'
import { getPayload } from 'payload'
import { issueMagicLink } from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
import { selectEmailDeliveryAdapter } from '@/modules/email/delivery'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const result = await issueMagicLink((await getPayload({ config })) as never, body.email ?? '')
  const runtime = loadConfig()
  if (result.token && runtime.email.from) {
    const url = new URL('/member-auth/verify', runtime.appUrl)
    url.searchParams.set('token', result.token)
    await selectEmailDeliveryAdapter(runtime).send({
      from: runtime.email.from,
      to: body.email?.trim() ?? '',
      subject: 'Your Renegade member sign-in link',
      text: `Use this single-use link to sign in: ${url.toString()}`,
      idempotencyKey: `member-link:${result.token.slice(0, 12)}`,
      category: 'transactional',
    })
  }
  // Delivery is intentionally capability-gated. Tokens are never returned outside test mode.
  return Response.json({
    status: 'If an eligible address can receive mail, a sign-in link will arrive.',
    testToken: process.env.NODE_ENV === 'test' ? result.token : undefined,
  })
}
