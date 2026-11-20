import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, beginPasskeyRegistration } from '@/modules/operations/installation'
import { isClaimOriginAllowed } from '@/modules/operations/claim-handoff'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { email?: string; token?: string }
    const payload = await getPayload({ config })
    const runtimeConfig = loadConfig()
    // A browser that already began enrollment (e.g. before a cancelled passkey
    // prompt) presents its enrollment session cookie so setup can resume
    // instead of demanding local operator recovery.
    const enrollmentToken = request.headers
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === 'renegade-setup')?.[1]
    // UXI-04: a claim presented from a foreign browser origin is refused
    // before the token is ever checked, with the same safe error a bad
    // token gets. Resume requests (enrollment cookie, no token) are
    // already bound to the enrollment session and are not affected.
    if (input.token && !isClaimOriginAllowed(request.headers, runtimeConfig.appUrl)) {
      throw new InstallationError('INSTALLATION_TOKEN_INVALID', 'The bootstrap token is invalid.')
    }
    const result = await beginPasskeyRegistration(payload, runtimeConfig, {
      email: input.email ?? '',
      token: input.token ?? '',
      enrollmentToken,
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
