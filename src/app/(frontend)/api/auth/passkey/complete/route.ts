import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, completePasskeyAuthentication } from '@/modules/operations/installation'
import { passkeySessionCookie } from '@/modules/operations/passkey-auth'
import { loadConfig } from '@/modules/core/config'

import {
  completeStaffPasskeyEnrollment,
  StaffEnrollmentError,
} from '@/modules/operations/staff-enrollment'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      enrollmentToken?: string
      siteId?: string
      credential?: RegistrationResponseJSON
      [key: string]: unknown
    }
    const runtimeConfig = loadConfig()
    const payload = await getPayload({ config })

    if (body.enrollmentToken) {
      const regCredential = (body.credential ?? body) as RegistrationResponseJSON
      await completeStaffPasskeyEnrollment(payload, runtimeConfig, {
        enrollmentToken: body.enrollmentToken,
        credential: regCredential,
        siteId: body.siteId,
      })
      return Response.json({ status: 'ok', enrolled: true })
    }

    const credential = body as unknown as Parameters<typeof completePasskeyAuthentication>[2]
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
    const status =
      error instanceof StaffEnrollmentError
        ? error.code === 'TOKEN_EXPIRED' || error.code === 'TOKEN_ALREADY_USED'
          ? 410
          : 400
        : error instanceof InstallationError
          ? 400
          : 500
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Passkey sign-in is unavailable.',
      },
      { status },
    )
  }
}
