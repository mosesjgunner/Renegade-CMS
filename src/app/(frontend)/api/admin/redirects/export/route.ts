import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  generateRedirectsCsv,
  generateRedirectsJson,
  listRedirectRules,
} from '@/modules/public/redirect-manager'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const format = (url.searchParams.get('format') || 'csv').toLowerCase()

  try {
    const rules = await listRedirectRules(payload)

    if (format === 'json') {
      const content = generateRedirectsJson(rules)
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="public-redirects.json"',
        },
      })
    }

    const content = generateRedirectsCsv(rules)
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="public-redirects.csv"',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed.' },
      { status: 400 },
    )
  }
}
