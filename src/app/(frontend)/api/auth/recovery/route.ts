import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, authenticateWithRecoveryCode } from '@/modules/operations/installation'
import { passkeySessionCookie } from '@/modules/operations/passkey-auth'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { email?: string; recoveryCode?: string }
    if (!input.email || !input.recoveryCode) {
      return Response.json({ error: 'Email and recovery code are required.' }, { status: 400 })
    }

    const runtimeConfig = loadConfig()
    const payload = await getPayload({ config })
    const session = await authenticateWithRecoveryCode(payload, runtimeConfig, {
      email: input.email,
      recoveryCode: input.recoveryCode,
    })

    return Response.json(
      { status: 'ok', email: input.email },
      {
        headers: {
          'set-cookie': passkeySessionCookie(
            session.token,
            session.expirationSeconds,
            runtimeConfig.secureCookies,
          ),
        },
      },
    )
  } catch (error: unknown) {
    const message =
      error instanceof InstallationError ? error.message : 'Emergency recovery sign-in failed.'
    return Response.json({ error: message }, { status: 400 })
  }
}
