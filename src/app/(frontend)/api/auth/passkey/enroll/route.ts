import config from '@payload-config'
import { getPayload } from 'payload'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'

import { loadConfig } from '@/modules/core/config'
import {
  beginStaffPasskeyEnrollment,
  completeStaffPasskeyEnrollment,
  StaffEnrollmentError,
} from '@/modules/operations/staff-enrollment'

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const runtimeConfig = loadConfig()
    const body = (await request.json()) as {
      action?: 'options' | 'complete'
      enrollmentToken?: string
      siteId?: string
      credential?: RegistrationResponseJSON
    }

    if (!body.enrollmentToken) {
      return Response.json(
        { error: 'Enrollment token is required.', code: 'INVALID_TOKEN' },
        { status: 400 },
      )
    }

    if (body.action === 'options') {
      const result = await beginStaffPasskeyEnrollment(payload, runtimeConfig, {
        enrollmentToken: body.enrollmentToken,
        siteId: body.siteId,
      })
      return Response.json(result)
    }

    if (body.action === 'complete') {
      if (!body.credential) {
        return Response.json(
          { error: 'Passkey credential is required.', code: 'INVALID_CREDENTIAL' },
          { status: 400 },
        )
      }
      const result = await completeStaffPasskeyEnrollment(payload, runtimeConfig, {
        enrollmentToken: body.enrollmentToken,
        credential: body.credential,
        siteId: body.siteId,
      })
      return Response.json(result)
    }

    return Response.json(
      { error: 'Valid action (options or complete) is required.', code: 'INVALID_ACTION' },
      { status: 400 },
    )
  } catch (error) {
    const status =
      error instanceof StaffEnrollmentError
        ? error.code === 'TOKEN_EXPIRED' || error.code === 'TOKEN_ALREADY_USED'
          ? 410
          : 400
        : 500
    const message =
      error instanceof Error ? error.message : 'Passkey enrollment is unavailable.'
    const code = error instanceof StaffEnrollmentError ? error.code : 'UNKNOWN_ERROR'
    return Response.json({ error: message, code }, { status })
  }
}
