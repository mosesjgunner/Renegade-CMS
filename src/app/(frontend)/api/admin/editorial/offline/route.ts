import { NextResponse, type NextRequest } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { RichTextDocument } from '@/modules/editorial/contracts'
import {
  discardOfflineDraft,
  getOfflineDraft,
  listOfflineDrafts,
  OfflineDraftError,
  registerOfflineDraft,
  resolveOfflineConflict,
  submitOfflineMutation,
} from '@/modules/editorial/offline-drafts'
import type { EditorialActor } from '@/modules/editorial/workflow'
import { checkOperatorRecordAccess } from '@/modules/operations/operator-grants'

/**
 * RC3-17 (#22): the sync surface for offline authoring. A client
 * registers a locally captured draft, submits mutations with
 * idempotency keys, and resolves conflicts explicitly. The editorial
 * actor derives ONLY from the authenticated session.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: req.headers })
    if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
      return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
    const body = (await req.json()) as Record<string, unknown>
    const action = String(body.action ?? '')
    const canPublish = ['owner', 'administrator'].includes(String(auth.user.role))
    const actor: EditorialActor = {
      id: String(auth.user.id),
      role: canPublish ? 'publisher' : 'editor',
    }
    const actorUserId = String(auth.user.id)

    const requireAccess = async (articleId: string) =>
      checkOperatorRecordAccess(
        payload,
        auth.user,
        'article-family-content',
        articleId,
        'content.site',
      )

    if (action === 'register') {
      const articleId = String(body.articleId ?? '')
      if (!articleId || !body.document || typeof body.deviceId !== 'string')
        return NextResponse.json(
          { error: 'articleId, deviceId and document are required.' },
          { status: 400 },
        )
      if (!(await requireAccess(articleId)))
        return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
      const draft = await registerOfflineDraft(payload, {
        articleId,
        deviceId: body.deviceId,
        actor,
        document: body.document as RichTextDocument,
        baseRevisionId: typeof body.baseRevisionId === 'string' ? body.baseRevisionId : null,
        baseDocumentHash:
          typeof body.baseDocumentHash === 'string' ? body.baseDocumentHash : undefined,
      })
      return NextResponse.json({ ok: true, draft })
    }

    const draftId = String(body.draftId ?? '')
    if (!draftId) return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })
    const draft = await getOfflineDraft(payload, draftId)
    if (!draft) return NextResponse.json({ error: 'Offline draft not found.' }, { status: 404 })
    if (!(await requireAccess(String(draft.articleId))))
      return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

    if (action === 'get') return NextResponse.json({ ok: true, draft })
    if (action === 'list') {
      const drafts = await listOfflineDrafts(payload, String(draft.articleId))
      return NextResponse.json({ ok: true, drafts })
    }
    if (action === 'submit') {
      const mutationType = body.mutationType === 'submit-review' ? 'submit-review' : 'save-draft'
      const mutation = await submitOfflineMutation(payload, {
        draftId,
        mutationType,
        idempotencyKey: String(body.idempotencyKey ?? ''),
        actor,
        actorUserId,
      })
      return NextResponse.json({ ok: true, mutation })
    }
    if (action === 'resolve') {
      const mutation = await resolveOfflineConflict(payload, {
        draftId,
        strategy: body.strategy === 'take-server' ? 'take-server' : 'keep-mine',
        idempotencyKey: String(body.idempotencyKey ?? ''),
        actor,
        actorUserId,
      })
      return NextResponse.json({ ok: true, mutation })
    }
    if (action === 'discard') {
      const discarded = await discardOfflineDraft(payload, draftId)
      return NextResponse.json({ ok: true, draft: discarded })
    }
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    if (error instanceof OfflineDraftError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Offline action failed.' },
      { status: 500 },
    )
  }
}
