import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { InstallationError, rotateOwnRecoveryCodes } from '@/modules/operations/installation'

/**
 * Authenticated owner-only recovery-kit rotation. Returns a fresh set of
 * recovery codes exactly once; the previous unused codes are invalidated by
 * the service in the same transaction. This is the in-product answer to a
 * lost setup-completion response — it never reopens public setup.
 */
export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const result = await rotateOwnRecoveryCodes(payload, loadConfig(), request.headers)
    return Response.json(result)
  } catch (error) {
    const message =
      error instanceof InstallationError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Recovery codes are unavailable.'
    const status =
      message === 'Sign in is required.' || message === 'Your session has expired.' ? 401 : 400
    return Response.json(
      {
        error:
          error instanceof InstallationError || status === 401
            ? message
            : 'Recovery codes are unavailable.',
      },
      { status },
    )
  }
}
