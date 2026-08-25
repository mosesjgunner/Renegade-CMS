import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, beginPasskeyRegistration } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { email?: string; token?: string }
    const payload = await getPayload({ config })
    const runtimeConfig = loadConfig()
    const result = await beginPasskeyRegistration(payload, runtimeConfig, {
      email: input.email ?? '',
      token: input.token ?? '',
    })
    return Response.json(
      { options: result.options },
      {
        headers: {
          'set-cookie': `renegade-setup=${result.enrollmentToken}; Max-Age=900; Path=/; HttpOnly; SameSite=Lax${runtimeConfig.secureCookies ? '; Secure' : ''}`,
        },
      },
    )
  } catch (error) {
    return setupError(error)
  }
}

function setupError(error: unknown): Response {
  const message = error instanceof InstallationError ? error.message : 'Setup is unavailable.'
  const status =
    error instanceof InstallationError && error.code === 'INSTALLATION_COMPLETE' ? 410 : 400
  return Response.json({ error: message }, { status })
}
