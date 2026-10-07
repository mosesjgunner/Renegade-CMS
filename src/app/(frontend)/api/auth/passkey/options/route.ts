import config from '@payload-config'
import { getPayload } from 'payload'

import { InstallationError, beginPasskeyAuthentication } from '@/modules/operations/installation'
import {
  beginStaffPasskeyEnrollment,
  StaffEnrollmentError,
} from '@/modules/operations/staff-enrollment'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as {
      email?: string
      enrollmentToken?: string
      siteId?: string
    }
    const payload = await getPayload({ config })
    const runtimeConfig = loadConfig()

    if (input.enrollmentToken) {
      const res = await beginStaffPasskeyEnrollment(payload, runtimeConfig, {
        enrollmentToken: input.enrollmentToken,
        siteId: input.siteId,
      })
      return Response.json({ options: res.options, user: { email: res.email, role: res.role } })
    }

    return Response.json({ options: await beginPasskeyAuthentication(payload, input.email ?? '') })
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
