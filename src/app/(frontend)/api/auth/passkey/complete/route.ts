import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, completePasskeyAuthentication } from '@/modules/operations/installation'
import { passkeySessionCookie } from '@/modules/operations/passkey-auth'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  try {
    const credential = (await request.json()) as Parameters<typeof completePasskeyAuthentication>[2]
    const runtimeConfig = loadConfig()
    const payload = await getPayload({ config })
    const result = await completePasskeyAuthentication(payload, runtimeConfig, credential)
    return Response.json(
      { status: 'ok' },
      {
        headers: {
          'set-cookie': passkeySessionCookie(
            result.token,
            result.expirationSeconds,
            runtimeConfig.secureCookies,
          ),
        },
      },
    )
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof InstallationError ? error.message : 'Passkey sign-in is unavailable.',
      },
      { status: 400 },
    )
  }
}
