import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, beginPasskeyAuthentication } from '@/modules/operations/installation'

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { email?: string }
    const payload = await getPayload({ config })
    return Response.json({ options: await beginPasskeyAuthentication(payload, input.email ?? '') })
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
