import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { bulkExecuteWorkflowItems } from '@/modules/editorial/cmos-persistence'
import type { EditorialRole } from '@/modules/editorial/workflow'
import type { Priority } from '@/modules/editorial/cmos-workflow'
import { canManageAdminSite } from '@/modules/admin/site-access'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      articleIds: string[]
      action: 'approve' | 'request-changes' | 'withdraw' | 'reassign'
      comment?: string
      update?: { editorId?: string | null; priority?: Priority; dueDate?: string | null }
      now?: string
      siteId?: string
    }

    if (!Array.isArray(body.articleIds) || body.articleIds.length === 0 || !body.action) {
      return NextResponse.json(
        { error: 'articleIds array and action are required.' },
        { status: 400 },
      )
    }

    const userRoleStr = String(auth.user.role)
    const actorRole: EditorialRole =
      userRoleStr === 'owner' || userRoleStr === 'administrator' ? 'publisher' : 'editor'
    for (const articleId of [...new Set(body.articleIds)]) {
      const article = await payload
        .findByID({
          collection: 'article-family-content',
          id: articleId,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
      const articleSiteValue = (article as unknown as { site?: string | { id?: string } } | null)
        ?.site
      const articleSite =
        typeof articleSiteValue === 'string' ? articleSiteValue : articleSiteValue?.id
      if (!article || !canManageAdminSite(auth.user, articleSite))
        return NextResponse.json(
          { error: 'At least one article is outside your assigned sites.' },
          { status: 403 },
        )
    }
    if (auth.user.role === 'staff' && (!body.siteId || !canManageAdminSite(auth.user, body.siteId)))
      return NextResponse.json(
        { error: 'Choose an assigned site.' },
        { status: body.siteId ? 403 : 400 },
      )

    const result = await bulkExecuteWorkflowItems(payload, {
      articleIds: body.articleIds,
      action: body.action,
      actor: { id: String(auth.user.id), role: actorRole },
      comment: body.comment,
      update: body.update,
      now: body.now,
      siteId: body.siteId,
    })

    return NextResponse.json({ result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute bulk workflow action.' },
      { status: 400 },
    )
  }
}
