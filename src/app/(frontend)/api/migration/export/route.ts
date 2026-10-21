import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { exportPortableSite } from '@/modules/portability/site-export'
import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Export requires staff access.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  if (!siteId) {
    return NextResponse.json({ error: 'siteId query parameter is required.' }, { status: 400 })
  }

  if (!(await checkOperatorSiteAccess(payload, auth.user, siteId)))
    return NextResponse.json({ error: 'Export site access denied.' }, { status: 403 })
  return exportSite(payload, siteId)
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Export requires staff access.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { siteId?: string }
  const siteId = body.siteId
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required in request body.' }, { status: 400 })
  }

  if (!(await checkOperatorSiteAccess(payload, auth.user, siteId)))
    return NextResponse.json({ error: 'Export site access denied.' }, { status: 403 })
  return exportSite(payload, siteId)
}

async function exportSite(payload: Awaited<ReturnType<typeof getPayload>>, siteId: string) {
  try {
    const manifest = await exportPortableSite(payload, siteId)
    return NextResponse.json({
      manifest,
      recordCount: manifest.records.length,
      siteId,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    )
  }
}
