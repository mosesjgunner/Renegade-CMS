/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { latestEpisodeApproval, recordEpisodeApproval } from '@/modules/podcast-studio/production'
import { episodeContext, privateJson, productionErrorResponse, readJson } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 episode approvals (the minimal podcast-episode-approvals
 * record — see production.ts for why Workflow #19's article-bound
 * machinery could not be reused).
 *
 * GET  ?episodeId= — the latest recorded decision for the episode.
 * POST { episodeId, decision, note? } — record a decision as the
 *      calling staff user; the latest decision wins at publish time.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const episodeId = url.searchParams.get('episodeId') ?? ''
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  const approval = await latestEpisodeApproval(payload as never, episodeId)
  return privateJson({
    approval: approval
      ? {
          id: String(approval.id),
          approver: approval.approver,
          decision: approval.decision,
          note: approval.note ?? null,
          decidedAt: approval.decidedAt,
        }
      : null,
  })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  const decision = typeof body.decision === 'string' ? body.decision : ''
  if (!['approved', 'rejected', 'changes-requested'].includes(decision)) {
    return privateJson({ error: `Unknown approval decision "${decision}".` }, 400)
  }
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  try {
    const approval = await recordEpisodeApproval(payload as never, {
      episodeId,
      approver: String(context.user.id),
      decision: decision as 'approved' | 'rejected' | 'changes-requested',
      note: typeof body.note === 'string' ? body.note : undefined,
    })
    return privateJson(
      {
        id: String(approval.id),
        approver: approval.approver,
        decision: approval.decision,
        decidedAt: approval.decidedAt,
      },
      201,
    )
  } catch (error) {
    return productionErrorResponse(error)
  }
}
