import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import {
  getStaffEnrollmentDetails,
  StaffEnrollmentError,
} from '@/modules/operations/staff-enrollment'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token') ?? ''
    const siteId = searchParams.get('siteId') ?? undefined
    const payload = await getPayload({ config })
    const runtimeConfig = loadConfig()

    const details = await getStaffEnrollmentDetails(payload, runtimeConfig, token, siteId)
    return Response.json(details)
  } catch (error) {
    const status =
      error instanceof StaffEnrollmentError
        ? error.code === 'TOKEN_EXPIRED' || error.code === 'TOKEN_ALREADY_USED'
          ? 410
          : 400
        : 500
    const message =
      error instanceof Error ? error.message : 'Enrollment invitation is unavailable.'
    const code = error instanceof StaffEnrollmentError ? error.code : 'UNKNOWN_ERROR'
    return Response.json({ error: message, code }, { status })
  }
}
