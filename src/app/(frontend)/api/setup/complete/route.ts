import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, completeInstallation } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'
import { passkeySessionCookie } from '@/modules/operations/passkey-auth'
import type { OnboardingInput } from '@/modules/operations/onboarding'

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as {
      credential?: Parameters<typeof completeInstallation>[2]['credential']
      onboarding?: OnboardingInput
    }
    if (!input.credential)
      return Response.json({ error: 'Passkey credential is required.' }, { status: 400 })
    if (!input.onboarding)
      return Response.json({ error: 'Onboarding choices are required.' }, { status: 400 })
    const enrollmentToken = request.headers
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === 'renegade-setup')?.[1]
    if (!enrollmentToken)
      return Response.json({ error: 'Enrollment session is required.' }, { status: 400 })
    const payload = await getPayload({ config })
    const result = await completeInstallation(payload, loadConfig(), {
      credential: input.credential,
      enrollmentToken,
      onboarding: input.onboarding as OnboardingInput,
    })
    const headers = new Headers()
    headers.append(
      'set-cookie',
      passkeySessionCookie(
        result.session.token,
        result.session.expirationSeconds,
        loadConfig().secureCookies,
      ),
    )
    headers.append('set-cookie', 'renegade-setup=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax')
    return Response.json(
      { recoveryCodes: result.recoveryCodes, onboarding: result.onboarding },
      { headers, status: 201 },
    )
  } catch (error) {
    const isInstallationError = error instanceof InstallationError
    // InstallationError messages are already operator/user-safe. Any other error is
    // unexpected (e.g. a collection ValidationError during provisioning) and must be
    // surfaced server-side for diagnosis instead of vanishing behind the generic
    // client response. The client still receives only the generic message so internal
    // details are never leaked; recovery codes are created after this point and are
    // therefore never present in a thrown error here.
    if (!isInstallationError) {
      console.error('[setup/complete] Unexpected installation failure:', error)
    }
    const message = isInstallationError ? error.message : 'Setup is unavailable.'
    const status = isInstallationError && error.code === 'INSTALLATION_COMPLETE' ? 410 : 400
    return Response.json({ error: message }, { status })
  }
}
