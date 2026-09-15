import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { exportPresentationPackage } from '@/modules/presentation/composition'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json(
      { error: 'Presentation export requires staff access.' },
      { status: 403 },
    )
  }
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  if (!siteId) {
    return NextResponse.json({ error: 'siteId query parameter is required.' }, { status: 400 })
  }

  try {
    const pkg = await exportPresentationPackage(payload, siteId)
    return NextResponse.json(pkg)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
