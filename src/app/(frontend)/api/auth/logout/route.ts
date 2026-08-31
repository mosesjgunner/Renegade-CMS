import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { clearPasskeySessionCookie, revokePasskeySession } from '@/modules/operations/passkey-auth'

export async function POST(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  await revokePasskeySession(payload, runtime.payloadSecret, request.headers)
  return Response.json({ status: 'ok' }, { headers: { 'set-cookie': clearPasskeySessionCookie(runtime.secureCookies) } })
}
