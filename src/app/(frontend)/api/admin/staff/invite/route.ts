import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import {
  createStaffEnrollmentToken,
  revokeStaffInvitation,
  StaffEnrollmentError,
} from '@/modules/operations/staff-enrollment'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || auth.user.role !== 'owner') {
    return Response.json({ error: 'Owner authority required.' }, { status: 403 })
  }
  const grant = await resolveOperatorGrantContext(payload, auth.user)
  if (!grant.authorized) {
    return Response.json({ error: 'Owner authority required.' }, { status: 403 })
  }
  const sites = await payload.find({
    collection: 'sites',
    where: { id: { in: grant.authorizedSiteIds } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  return Response.json({ sites: sites.docs.map(({ id, name }) => ({ id, name })) })
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const runtimeConfig = loadConfig()
    const auth = await payload.auth({ headers: request.headers })

    if (!auth.user || auth.user.role !== 'owner') {
      return Response.json(
        { error: 'Forbidden. Owner authority required to invite staff.' },
        { status: 403 },
      )
    }

    const grant = await resolveOperatorGrantContext(payload, auth.user)
    if (!grant.authorized) {
      return Response.json(
        { error: 'Forbidden. Owner authority required to invite staff.' },
        { status: 403 },
      )
    }

    const body = (await request.json()) as {
      email?: string
      role?: 'staff' | 'administrator'
      siteId?: string
      validHours?: number
    }

    if (body.siteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(body.siteId)) {
      return Response.json(
        { error: 'Forbidden. You do not have owner authority over the target site.' },
        { status: 403 },
      )
    }

    if (!body.email) {
      return Response.json({ error: 'Staff email is required.' }, { status: 400 })
    }

    if (!body.siteId || !grant.authorizedSiteIds.includes(body.siteId)) {
      return Response.json(
        { error: 'Choose an authorized site for this invitation.' },
        { status: 400 },
      )
    }

    const result = await createStaffEnrollmentToken(payload, runtimeConfig, {
      email: body.email,
      role: body.role,
      siteId: body.siteId,
      invitedByUserId: auth.user.id,
      validHours: body.validHours,
    })

    return Response.json(result, { status: 201 })
  } catch (error) {
    const status = error instanceof StaffEnrollmentError ? 400 : 500
    const message =
      error instanceof Error ? error.message : 'Staff invitation could not be created.'
    return Response.json({ error: message }, { status })
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await getPayload({ config })
    const runtimeConfig = loadConfig()
    const auth = await payload.auth({ headers: request.headers })

    if (!auth.user || auth.user.role !== 'owner') {
      return Response.json(
        { error: 'Forbidden. Owner authority required to revoke invitations.' },
        { status: 403 },
      )
    }

    const body = (await request.json()) as {
      token?: string
      email?: string
      userId?: string
    }

    const result = await revokeStaffInvitation(payload, runtimeConfig, {
      token: body.token,
      email: body.email,
      userId: body.userId,
      requestedByUserId: auth.user.id,
    })

    return Response.json(result)
  } catch (error) {
    const status = error instanceof StaffEnrollmentError ? 400 : 500
    const message =
      error instanceof Error ? error.message : 'Staff invitation could not be revoked.'
    return Response.json({ error: message }, { status })
  }
}
