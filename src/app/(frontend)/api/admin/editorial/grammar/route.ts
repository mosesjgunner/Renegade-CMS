import { NextResponse, type NextRequest } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  acceptGrammarSuggestion,
  dismissGrammarSuggestion,
  getGrammarSuggestionContext,
  GrammarError,
  listGrammarIssues,
  runGrammarCheck,
} from '@/modules/editorial/grammar'
import type { EditorialActor } from '@/modules/editorial/workflow'
import { checkOperatorRecordAccess } from '@/modules/operations/operator-grants'

/**
 * RC3-17 (#7): the editor surface for the bundled Harper grammar
 * path. Staff session only; the editorial actor derives ONLY from
 * the authenticated session (mirrors the calendar schedule route —
 * a request-body role is never honored). Grammar is built-in: the
 * check runs the local Harper engine, never a BYO-model provider.
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

    const articleIdFor = async (): Promise<string | null> => {
      if (typeof body.articleId === 'string' && body.articleId) return body.articleId
      if (typeof body.suggestionId === 'string' && body.suggestionId) {
        const context = await getGrammarSuggestionContext(payload, body.suggestionId)
        return context?.articleId ?? null
      }
      return null
    }
    const articleId = await articleIdFor()
    if (!articleId)
      return NextResponse.json(
        { error: 'articleId or a resolvable suggestionId is required.' },
        { status: 400 },
      )
    if (
      !(await checkOperatorRecordAccess(
        payload,
        auth.user,
        'article-family-content',
        articleId,
        'content.site',
      ))
    )
      return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

    if (action === 'check') {
      const result = await runGrammarCheck(payload, { articleId, actor })
      return NextResponse.json({ ok: true, ...result })
    }
    if (action === 'list') {
      const issues = await listGrammarIssues(payload, {
        articleId,
        status: typeof body.status === 'string' ? (body.status as never) : undefined,
      })
      return NextResponse.json({ ok: true, issues })
    }
    if (action === 'accept' || action === 'dismiss') {
      const suggestionId = String(body.suggestionId ?? '')
      if (!suggestionId)
        return NextResponse.json({ error: 'suggestionId is required.' }, { status: 400 })
      const context = await getGrammarSuggestionContext(payload, suggestionId)
      if (!context || context.articleId !== articleId)
        return NextResponse.json(
          { error: 'Suggestion does not belong to this article.' },
          { status: 403 },
        )
      if (action === 'accept') {
        const result = await acceptGrammarSuggestion(payload, {
          suggestionId,
          actor,
          actorUserId,
        })
        return NextResponse.json({ ok: true, ...result })
      }
      const suggestion = await dismissGrammarSuggestion(payload, { suggestionId, actor })
      return NextResponse.json({ ok: true, suggestion })
    }
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    if (error instanceof GrammarError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Grammar action failed.' },
      { status: 500 },
    )
  }
}
