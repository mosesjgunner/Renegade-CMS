import { canMigrateLegacySite } from '@/modules/portability/legacy-migration/access'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  dryRunPreflight,
  PayloadLegacyMigrationStore,
  type LegacyMigrationOptions,
  type LegacySitePackage,
} from '@/modules/portability/legacy-migration'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Legacy migration requires staff access.' }, { status: 403 })
  }

  const body = (await request.json()) as {
    pkg?: LegacySitePackage
    options?: Partial<LegacyMigrationOptions>
  }

  if (!body.pkg?.wxr) {
    return NextResponse.json({ error: 'Legacy package with WXR is required.' }, { status: 400 })
  }

  if (
    !(await canMigrateLegacySite(
      payload,
      auth.user,
      body.options?.targetSiteId,
      body.options?.targetSiteMode !== 'existing-site',
    ))
  ) {
    return NextResponse.json(
      { error: 'Migration requires all-sites author authority; creating sites requires an owner.' },
      { status: 403 },
    )
  }
  const store = new PayloadLegacyMigrationStore(payload, auth.user ?? undefined)
  const options: LegacyMigrationOptions = {
    actorId: String(auth.user?.id ?? 'staff'),
    targetSiteMode: body.options?.targetSiteMode ?? 'new-isolated-site',
    targetSiteId: body.options?.targetSiteId,
    newSiteName: body.options?.newSiteName,
    newSiteSlug: body.options?.newSiteSlug,
    themeId: body.options?.themeId ?? 'neutral-starter',
    remoteMediaDownloadAllowed: body.options?.remoteMediaDownloadAllowed ?? false,
    dryRun: true,
  }

  try {
    const report = await dryRunPreflight(body.pkg, store, options)
    return NextResponse.json(report, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 422 },
    )
  }
}
