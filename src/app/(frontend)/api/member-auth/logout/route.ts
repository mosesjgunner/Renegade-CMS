import config from '@payload-config'
import { getPayload } from 'payload'
import {
  clearMemberSessionCookie,
  readMemberSession,
  revokeMemberSession,
} from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
export async function POST(request: Request) {
  await revokeMemberSession(
    (await getPayload({ config })) as never,
    readMemberSession(request.headers),
  )
  return Response.json(
    { status: 'ok' },
    { headers: { 'set-cookie': clearMemberSessionCookie(loadConfig().secureCookies) } },
  )
}
