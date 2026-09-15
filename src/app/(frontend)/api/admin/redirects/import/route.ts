import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
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

    const sites = await payload.find({
      collection: 'sites',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const siteId = sites.docs[0]?.id ? String(sites.docs[0].id) : 'default-site'

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

    return NextResponse.json({
      success: true,
      created: importResult.created,
      updated: importResult.updated,
      skipped: importResult.skipped,
      errors: [...parseErrors, ...importResult.errors],
      rulesCount: importResult.rules.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed.' },
      { status: 400 },
    )
  }
}
