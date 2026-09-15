import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  importPresentationPackage,
  validatePresentationImport,
} from '@/modules/presentation/composition'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json(
      { error: 'Presentation import requires staff access.' },
      { status: 403 },
    )
  }

  const body = (await request.json()) as {
    siteId?: string
    targetThemeId?: string
    packageData?: unknown
    validateOnly?: boolean
    dryRun?: boolean
  }

  if (!body.siteId || !body.targetThemeId || !body.packageData) {
    return NextResponse.json(
      { error: 'siteId, targetThemeId, and packageData are required.' },
      { status: 400 },
    )
  }

  if (body.validateOnly) {
    const result = validatePresentationImport(body.packageData, body.targetThemeId)
    return NextResponse.json(result)
  }

  const result = await importPresentationPackage(payload, {
    siteId: body.siteId,
    targetThemeId: body.targetThemeId,
    packageData: body.packageData,
    dryRun: body.dryRun,
  })

  if (!result.valid || !result.compatible) {
    return NextResponse.json(result, { status: 422 })
  }

  return NextResponse.json(result, { status: 200 })
}
