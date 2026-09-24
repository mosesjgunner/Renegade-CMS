import config from '@payload-config'
import { getPayload } from 'payload'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'

import { csrfCookie, issueCsrfToken, memberSessionCookie } from '@/modules/identity/member-identity'
import { MemberPasskeyError, completeMemberPasskeyLogin } from '@/modules/identity/member-passkey'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    challengeToken?: string
    credential?: AuthenticationResponseJSON
  }
  if (!body.challengeToken || !body.credential)
    return Response.json({ error: 'A passkey sign-in challenge is required.' }, { status: 400 })
  const payload = await getPayload({ config })
  try {
    const result = await completeMemberPasskeyLogin(payload as never, {
      challengeToken: body.challengeToken,
      credential: body.credential,
      appUrl: loadConfig().appUrl,
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
  } catch (error) {
    return Response.json(
      { error: error instanceof MemberPasskeyError ? error.message : 'Passkey sign-in failed.' },
      { status: 400 },
    )
  }
}
