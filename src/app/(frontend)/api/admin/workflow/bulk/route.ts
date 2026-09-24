import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { bulkExecuteWorkflowItems } from '@/modules/editorial/cmos-persistence'
import type { EditorialRole } from '@/modules/editorial/workflow'
import type { Priority } from '@/modules/editorial/cmos-workflow'

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
      role?: EditorialRole
      comment?: string
      update?: { editorId?: string | null; priority?: Priority; dueDate?: string | null }
      now?: string
    }

    if (!Array.isArray(body.articleIds) || body.articleIds.length === 0 || !body.action) {
      return NextResponse.json(
        { error: 'articleIds array and action are required.' },
        { status: 400 },
      )
    }

    const userRoleStr = String(auth.user.role)
    const actorRole: EditorialRole =
      userRoleStr === 'owner' || userRoleStr === 'administrator'
        ? body.role || 'publisher'
        : 'editor'

    const result = await bulkExecuteWorkflowItems(payload, {
      articleIds: body.articleIds,
      action: body.action,
      actor: { id: String(auth.user.id), role: actorRole },
      comment: body.comment,
      update: body.update,
      now: body.now,
    })

    return NextResponse.json({ result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute bulk workflow action.' },
      { status: 400 },
    )
  }
}
