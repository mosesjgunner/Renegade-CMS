import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import {
  InstallationError,
  beginAdditionalPasskeyRegistration,
  completeAdditionalPasskeyRegistration,
  listOrRemovePasskeys,
} from '@/modules/operations/installation'

import {
  beginStaffPasskeyEnrollment,
  completeStaffPasskeyEnrollment,
  StaffEnrollmentError,
} from '@/modules/operations/staff-enrollment'

export async function GET(request: Request) {
  return respond(async () =>
    listOrRemovePasskeys(await getPayload({ config }), loadConfig(), request.headers),
  )
}

export async function POST(request: Request) {
  return respond(async () => {
    const payload = await getPayload({ config })
    const runtime = loadConfig()
    const body = (await request.json()) as {
      action?: string
      credential?: Parameters<typeof completeAdditionalPasskeyRegistration>[3]['credential']
      name?: string
      enrollmentToken?: string
      siteId?: string
    }

    if (body.enrollmentToken) {
      if (body.action === 'options') {
        const res = await beginStaffPasskeyEnrollment(payload, runtime, {
          enrollmentToken: body.enrollmentToken,
          siteId: body.siteId,
        })
        return res
      }
      if (body.action === 'complete' && body.credential) {
        return completeStaffPasskeyEnrollment(payload, runtime, {
          enrollmentToken: body.enrollmentToken,
          credential: body.credential,
          siteId: body.siteId,
        })
      }
    }

    if (body.action === 'options')
      return {
        options: await beginAdditionalPasskeyRegistration(payload, runtime, request.headers),
      }
    if (body.action === 'complete' && body.credential) {
      await completeAdditionalPasskeyRegistration(payload, runtime, request.headers, {
        credential: body.credential,
        name: body.name,
      })
      return { status: 'created' }
    }
    throw new InstallationError('INSTALLATION_INVALID', 'A valid passkey request is required.')
  })
}

export async function DELETE(request: Request) {
  return respond(async () => {
    const input = (await request.json()) as { credentialId?: string }
    if (!input.credentialId)
      throw new InstallationError('INSTALLATION_INVALID', 'A passkey is required.')
    await listOrRemovePasskeys(
      await getPayload({ config }),
      loadConfig(),
      request.headers,
      input.credentialId,
    )
    return { status: 'removed' }
  })
}

async function respond(action: () => Promise<unknown>) {
  try {
    return Response.json(await action())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Security settings are unavailable.'
    const status =
      message === 'Sign in is required.' || message === 'Your session has expired.'
        ? 401
        : error instanceof StaffEnrollmentError
          ? error.code === 'TOKEN_EXPIRED' || error.code === 'TOKEN_ALREADY_USED'
            ? 410
            : 400
          : error instanceof InstallationError
            ? 400
            : 500
    return Response.json({ error: message }, { status })
  }
}
