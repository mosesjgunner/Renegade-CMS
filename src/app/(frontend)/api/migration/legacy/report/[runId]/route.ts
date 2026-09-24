import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { PayloadLegacyMigrationStore } from '@/modules/portability/legacy-migration'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Legacy migration requires staff access.' }, { status: 403 })
  }

  const { runId } = await params
  const store = new PayloadLegacyMigrationStore(payload)
  const report = await store.getMigrationRun(runId)

  if (!report) {
    return NextResponse.json({ error: `Migration run '${runId}' was not found.` }, { status: 404 })
  }

  return NextResponse.json(report, { status: 200 })
}
