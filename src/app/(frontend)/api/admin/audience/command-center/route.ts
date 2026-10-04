import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }
  return NextResponse.json(
    {
      error:
        'Audience reporting unavailable: delivery evidence and site permissions require validation.',
    },
    { status: 503 },
  )
}
