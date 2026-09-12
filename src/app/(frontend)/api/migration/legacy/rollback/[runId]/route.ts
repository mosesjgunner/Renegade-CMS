import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  PayloadLegacyMigrationStore,
  rollbackLegacyMigration,
} from '@/modules/portability/legacy-migration'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Legacy migration rollback requires staff access.' }, { status: 403 })
  }

  const { runId } = await params
  const store = new PayloadLegacyMigrationStore(payload)

  try {
    const report = await rollbackLegacyMigration(runId, store, String(auth.user?.id ?? 'staff'))
    return NextResponse.json(report, { status: 200 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    )
  }
}
