import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  executeLegacyMigration,
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
    runId?: string
  }

  if (!body.pkg?.wxr) {
    return NextResponse.json({ error: 'Legacy package with WXR is required.' }, { status: 400 })
  }

  const store = new PayloadLegacyMigrationStore(payload)
  const options: LegacyMigrationOptions = {
    actorId: String(auth.user?.id ?? 'staff'),
    targetSiteMode: body.options?.targetSiteMode ?? 'new-isolated-site',
    targetSiteId: body.options?.targetSiteId,
    newSiteName: body.options?.newSiteName,
    newSiteSlug: body.options?.newSiteSlug,
    themeId: body.options?.themeId ?? 'neutral-starter',
    remoteMediaDownloadAllowed: body.options?.remoteMediaDownloadAllowed ?? false,
    dryRun: false,
    autoActivate: body.options?.autoActivate ?? false,
  }

  const report = await executeLegacyMigration(body.pkg, store, options, body.runId)
  return NextResponse.json(report, { status: report.stage === 'failed' ? 422 : 200 })
}
