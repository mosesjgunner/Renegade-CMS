import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { executeWorkflowAction } from '@/modules/editorial/cmos-persistence'
import type { EditorialRole } from '@/modules/editorial/workflow'
import { WorkflowPermissionError, WorkflowStateError } from '@/modules/editorial/cmos-workflow'
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
      articleId: string
      action:
        | 'submit'
        | 'approve'
        | 'reject'
        | 'request-changes'
        | 'withdraw'
        | 'cancel'
        | 'reopen'
        | 'emergency-override'
        | 'reassign'
        | 'save-draft'
      role?: EditorialRole
      reviewerId?: string
      actorSiteId?: string | null
      comment?: string | null
      targetStatus?: 'approved' | 'published'
      reason?: string
      update?: {
        editorId?: string | null
        reviewerIds?: readonly string[]
        dueDate?: string | null
        priority?: 'low' | 'normal' | 'high' | 'urgent'
        watchers?: readonly string[]
      }
      now?: string
      siteId?: string
    }

    if (!body.articleId || !body.action) {
      return NextResponse.json({ error: 'articleId and action are required.' }, { status: 400 })
    }

    const article = await payload
      .findByID({
        collection: 'article-family-content',
        id: body.articleId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    const articleSiteValue = (article as unknown as { site?: string | { id?: string } } | null)
      ?.site
    const articleSite =
      typeof articleSiteValue === 'string' ? articleSiteValue : articleSiteValue?.id
    if (!article || !canManageAdminSite(auth.user, articleSite))
      return NextResponse.json({ error: 'Article site access denied.' }, { status: 403 })

    // The authenticated account, never request fields, determines authority.
    const userRoleStr = String(auth.user.role)
    const actorRole: EditorialRole =
      userRoleStr === 'owner' || userRoleStr === 'administrator' ? 'publisher' : 'editor'
    const actorId = String(auth.user.id)

    const item = await executeWorkflowAction(payload, {
      articleId: body.articleId,
      action: body.action,
      actor: { id: actorId, role: actorRole },
      actorSiteId: String(articleSite),
      comment: body.comment,
      targetStatus: body.targetStatus,
      reason: body.reason,
      update: body.update,
      now: body.now,
    })

    return NextResponse.json({ item })
  } catch (error) {
    if (error instanceof WorkflowPermissionError) {
      return NextResponse.json(
        { error: error.message, code: 'WORKFLOW_PERMISSION_DENIED' },
        { status: 403 },
      )
    }
    if (error instanceof WorkflowStateError) {
      return NextResponse.json(
        { error: error.message, code: 'WORKFLOW_STATE_INVALID' },
        { status: 422 },
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute workflow action.' },
      { status: 400 },
    )
  }
}
