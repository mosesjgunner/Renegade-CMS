import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, completeInstallation } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'
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
    return Response.json(result, {
      headers: { 'set-cookie': 'renegade-setup=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax' },
      status: 201,
    })
  } catch (error) {
    const message = error instanceof InstallationError ? error.message : 'Setup is unavailable.'
    const status =
      error instanceof InstallationError && error.code === 'INSTALLATION_COMPLETE' ? 410 : 400
    return Response.json({ error: message }, { status })
  }
}
