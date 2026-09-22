import config from '@payload-config'
import { getPayload } from 'payload'

import { enforceAuthRateLimit } from '@/modules/identity/member-identity'
import { beginMemberPasskeyLogin } from '@/modules/identity/member-passkey'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const throttle = enforceAuthRateLimit(`passkey-login:${clientIp}`)
  if (!throttle.allowed) {
    return Response.json(
      { error: 'Too many requests. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(throttle.retryAfter) } },
    )
  }
  const payload = await getPayload({ config })
  const { challengeToken, options } = await beginMemberPasskeyLogin(
    payload as never,
    loadConfig().appUrl,
  )
  return Response.json({ challengeToken, options })
}
