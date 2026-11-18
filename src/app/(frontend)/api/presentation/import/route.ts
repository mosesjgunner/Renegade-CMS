import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'
import {
  importPresentationPackage,
  PresentationImportAccessError,
  validatePresentationImport,
} from '@/modules/presentation/composition'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

const MAX_BODY_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
  }

  let body: {
    siteId?: string
    targetThemeId?: string
    packageData?: unknown
    validateOnly?: boolean
    dryRun?: boolean
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (!body.siteId || !body.targetThemeId || !body.packageData) {
    return NextResponse.json(
      { error: 'siteId, targetThemeId, and packageData are required.' },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json(
      { error: 'Presentation import requires staff access.' },
      { status: 403 },
    )
  }

  // The target site comes from the caller, so the caller's grant for that
  // exact site is enforced before any validation or write happens.
  const allowed = await checkOperatorSiteAccess(
    payload,
    auth.user,
    body.siteId,
    request as unknown as object,
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'Presentation import is not authorized for the target site.' },
      { status: 403 },
    )
  }

  if (body.validateOnly) {
    const result = validatePresentationImport(body.packageData, body.targetThemeId)
    return NextResponse.json(result)
  }

  try {
    const result = await importPresentationPackage(payload, {
      siteId: body.siteId,
      targetThemeId: body.targetThemeId,
      packageData: body.packageData,
      dryRun: body.dryRun,
      user: auth.user,
    })

    if (result.conflicts.length > 0) {
      return NextResponse.json(result, { status: 409 })
    }
    if (!result.valid || !result.compatible) {
      return NextResponse.json(result, { status: 422 })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof PresentationImportAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[presentation-import] import failed.', error)
    return NextResponse.json({ error: 'Presentation import failed.' }, { status: 500 })
  }
}
