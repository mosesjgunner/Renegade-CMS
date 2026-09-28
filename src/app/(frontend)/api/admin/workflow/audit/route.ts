import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { getWorkflowAuditHistory } from '@/modules/editorial/cmos-persistence'
import { canManageAdminSite } from '@/modules/admin/site-access'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const articleId = url.searchParams.get('articleId')
  const siteId = url.searchParams.get('siteId')

  if (!articleId) {
    return NextResponse.json({ error: 'articleId query parameter is required.' }, { status: 400 })
  }

  const article = await payload
    .findByID({
      collection: 'article-family-content',
      id: articleId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  const articleSiteValue = (article as unknown as { site?: string | { id?: string } } | null)?.site
  const articleSite = typeof articleSiteValue === 'string' ? articleSiteValue : articleSiteValue?.id
  if (!article || !canManageAdminSite(auth.user, articleSite) || (siteId && siteId !== articleSite))
    return NextResponse.json({ error: 'Article site access denied.' }, { status: 403 })

  try {
    const auditTrail = await getWorkflowAuditHistory(payload, articleId)
    return NextResponse.json({ articleId, auditTrail })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to retrieve workflow audit history.',
      },
      { status: 400 },
    )
  }
}
