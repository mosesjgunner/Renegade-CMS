import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { discoveryPreview, resolveDiscoveryDocument } from '@/modules/public/discovery'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'A content id is required.' }, { status: 400 })
  try {
    const document = await resolveDiscoveryDocument(payload, { collection: 'content', id })
    return NextResponse.json({ document, preview: discoveryPreview(document) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Discovery inspection failed.' },
      { status: 400 },
    )
  }
}
