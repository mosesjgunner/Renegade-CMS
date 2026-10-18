import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { resolveRedirectSite } from '@/modules/operations/redirect-site'
import {
  importRedirectRules,
  parseRedirectsCsv,
  parseRedirectsJson,
  type RedirectRuleInput,
} from '@/modules/public/redirect-manager'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''
    const text = await request.text()
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Import payload content is empty.' }, { status: 400 })
    }

    const siteId = await resolveRedirectSite(payload, auth.user, request)
    if (!siteId) return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

    let parsedRules: RedirectRuleInput[] = []
    let parseErrors: string[] = []

    if (
      contentType.includes('json') ||
      text.trim().startsWith('[') ||
      text.trim().startsWith('{')
    ) {
      const res = parseRedirectsJson(text)
      parsedRules = res.rules
      parseErrors = res.errors
    } else {
      const res = parseRedirectsCsv(text)
      parsedRules = res.rules
      parseErrors = res.errors
    }

    if (parsedRules.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid redirect rules parsed.',
          parseErrors,
        },
        { status: 400 },
      )
    }

    const importResult = await importRedirectRules(payload, siteId, parsedRules)

    const errors = [...parseErrors, ...importResult.errors]
    return NextResponse.json({
      success: errors.length === 0,
      partial: errors.length > 0 && importResult.created + importResult.updated > 0,
      created: importResult.created,
      updated: importResult.updated,
      skipped: importResult.skipped + parseErrors.length,
      errors,
      rulesCount: importResult.rules.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed.' },
      { status: 400 },
    )
  }
}
