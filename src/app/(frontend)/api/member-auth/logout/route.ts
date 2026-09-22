import config from '@payload-config'
import { getPayload } from 'payload'
import {
  clearCsrfCookie,
  clearMemberSessionCookie,
  readMemberSession,
  revokeMemberSession,
  verifyCsrf,
} from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Missing or invalid CSRF token.' }, { status: 403 })
  await revokeMemberSession(
    (await getPayload({ config })) as never,
    readMemberSession(request.headers),
  )
  const secure = loadConfig().secureCookies
  return Response.json(
    { status: 'ok' },
    {
      headers: [
        ['set-cookie', clearMemberSessionCookie(secure)],
        ['set-cookie', clearCsrfCookie(secure)],
      ],
    },
  )
}
