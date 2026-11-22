import { NextResponse, type NextRequest } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  ChangeProposalError,
  createChangeProposal,
  decideChangeProposal,
  getChangeProposal,
  listChangeProposals,
} from '@/modules/editorial/change-proposals'
import type { RichTextDocument } from '@/modules/editorial/contracts'
import type { EditorialActor } from '@/modules/editorial/workflow'
import { checkOperatorRecordAccess } from '@/modules/operations/operator-grants'

/**
 * RC3-17 (#20): the bounded change-proposal surface — propose a
 * document against a base revision, read its persisted diff, decide
 * it. Acceptance is fast-forward only and lands as a draft revision;
 * this route cannot publish. The editorial actor derives ONLY from
 * the authenticated session.
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

    if (action === 'create') {
      const articleId = String(body.articleId ?? '')
      if (!articleId || !body.proposedDocument)
        return NextResponse.json(
          { error: 'articleId and proposedDocument are required.' },
          { status: 400 },
        )
      if (!(await requireAccess(articleId)))
        return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
      const proposal = await createChangeProposal(payload, {
        articleId,
        actor,
        proposedDocument: body.proposedDocument as RichTextDocument,
      })
      return NextResponse.json({ ok: true, proposal })
    }

    if (action === 'list') {
      const articleId = String(body.articleId ?? '')
      if (!articleId) return NextResponse.json({ error: 'articleId is required.' }, { status: 400 })
      if (!(await requireAccess(articleId)))
        return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
      const proposals = await listChangeProposals(payload, articleId)
      return NextResponse.json({ ok: true, proposals })
    }

    if (action === 'decide') {
      const proposalId = String(body.proposalId ?? '')
      const existing = proposalId ? await getChangeProposal(payload, proposalId) : null
      if (!existing)
        return NextResponse.json({ error: 'Change proposal not found.' }, { status: 404 })
      if (!(await requireAccess(existing.articleId)))
        return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
      const proposal = await decideChangeProposal(payload, {
        proposalId,
        decision: body.decision === 'rejected' ? 'rejected' : 'accepted',
        actor,
        actorUserId,
      })
      return NextResponse.json({ ok: true, proposal })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    if (error instanceof ChangeProposalError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Change proposal action failed.' },
      { status: 500 },
    )
  }
}
