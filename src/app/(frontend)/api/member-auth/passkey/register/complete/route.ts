import config from '@payload-config'
import { getPayload } from 'payload'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'

import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'
import { MemberPasskeyError, completeMemberPasskeyRegistration } from '@/modules/identity/member-passkey'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Missing or invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    challengeToken?: string
    credential?: RegistrationResponseJSON
    label?: string
  }
  if (!body.challengeToken || !body.credential)
    return Response.json({ error: 'A passkey registration challenge is required.' }, { status: 400 })
  try {
    await completeMemberPasskeyRegistration(payload as never, {
      memberId,
      challengeToken: body.challengeToken,
      credential: body.credential,
      appUrl: loadConfig().appUrl,
      label: body.label,
    })
    return Response.json({ status: 'ok' })
  } catch (error) {
    return Response.json(
      { error: error instanceof MemberPasskeyError ? error.message : 'Passkey enrollment failed.' },
      { status: 400 },
    )
  }
}
