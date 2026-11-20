import { randomBytes } from 'node:crypto'

import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import {
  SETUP_DRAFT_COOKIE,
  SetupDraftError,
  hashDraftClaim,
  isEnrollmentSessionValid,
  loadSetupDraft,
  saveSetupDraft,
  type SetupDraftSaveInput,
} from '@/modules/operations/setup-draft'

/**
 * Server-side setup draft (UXI-02): the setup form saves its non-secret
 * answers here on every step change and restores them on load, so a
 * refresh or reopen returns to the last safe checkpoint.
 *
 * Authorization is a claim, never a secret worth stealing: either the
 * HttpOnly draft-claim cookie issued on first save, or the live
 * enrollment session cookie (verified against installation_state). The
 * draft never contains — and this route never returns — bootstrap
 * tokens, passkey material, or recovery codes.
 */

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1]
}

async function draftAccess(request: Request) {
  const runtimeConfig = loadConfig()
  const payload = await getPayload({ config })
  const claimToken = cookieValue(request, SETUP_DRAFT_COOKIE)
  const enrollmentAuthorized = await isEnrollmentSessionValid(
    payload,
    runtimeConfig.payloadSecret,
    cookieValue(request, 'renegade-setup'),
  )
  return {
    payload,
    runtimeConfig,
    claimToken,
    claimHash: claimToken ? hashDraftClaim(claimToken, runtimeConfig.payloadSecret) : null,
    enrollmentAuthorized,
  }
}

export async function GET(request: Request) {
  const { payload, claimHash, enrollmentAuthorized } = await draftAccess(request)
  const draft = await loadSetupDraft(payload, { claimHash, enrollmentAuthorized })
  return Response.json({ draft })
}

export async function PUT(request: Request) {
  const { payload, runtimeConfig, claimToken, claimHash, enrollmentAuthorized } =
    await draftAccess(request)
  let input: SetupDraftSaveInput
  try {
    input = (await request.json()) as SetupDraftSaveInput
  } catch {
    return Response.json({ error: 'Draft save requires a JSON body.' }, { status: 400 })
  }

  // First save from this browser mints its draft claim; the raw claim
  // only ever lives in the HttpOnly cookie, the hash is what is stored.
  const effectiveClaimToken = claimToken ?? randomBytes(32).toString('base64url')
  const effectiveClaimHash =
    claimHash ?? hashDraftClaim(effectiveClaimToken, runtimeConfig.payloadSecret)

  try {
    const draft = await saveSetupDraft(
      payload,
      { claimHash: effectiveClaimHash, enrollmentAuthorized },
      input,
    )
    const headers = new Headers()
    if (!claimToken) {
      headers.append(
        'set-cookie',
        `${SETUP_DRAFT_COOKIE}=${effectiveClaimToken}; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax${runtimeConfig.secureCookies ? '; Secure' : ''}`,
      )
    }
    return Response.json({ draft }, { headers })
  } catch (error) {
    if (error instanceof SetupDraftError) {
      const status =
        error.code === 'DRAFT_CONFLICT'
          ? 409
          : error.code === 'INSTALLATION_COMPLETE'
            ? 410
            : error.code === 'DRAFT_UNAVAILABLE'
              ? 503
              : 400
      return Response.json({ error: error.message, code: error.code }, { status })
    }
    return Response.json({ error: 'Draft could not be saved.' }, { status: 500 })
  }
}
