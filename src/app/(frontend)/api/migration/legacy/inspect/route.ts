import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { inspectLegacySite } from '@/modules/portability/legacy-migration'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Legacy migration requires staff access.' }, { status: 403 })
  }

  const body = (await request.json()) as { wxr?: string }
  if (!body.wxr) {
    return NextResponse.json({ error: 'WXR content is required.' }, { status: 400 })
  }

  const result = inspectLegacySite({ wxr: body.wxr })
  return NextResponse.json(result, { status: result.valid ? 200 : 422 })
}
