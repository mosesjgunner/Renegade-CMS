/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import {
  PodcastIntelligenceError,
  acceptAssistDraft,
  acceptTranscriptRevision,
  createAudiogramFromHighlight,
  discardAssistDraft,
  editTranscriptRevision,
  generateAssistDrafts,
  listAssistDrafts,
} from '@/modules/podcast-studio/intelligence/service'
import type { AssistKind, HighlightClip } from '@/modules/podcast-studio/intelligence/assists'
import type { TimedSegment } from '@/modules/podcast-studio/intelligence/transcription'
import { episodeContext, privateJson, readJson } from '../../../production/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ episodeId: string }> }

const KINDS: AssistKind[] = ['chapters', 'show-notes', 'summary', 'highlight', 'audiogram']

/**
 * POD-14 post-production assists surface for one episode.
 *
 * GET  — the episode's assist drafts (all kinds, newest first).
 * POST — actions (all explicit human actions; nothing auto-applies):
 *   `{ action: 'generate', kinds?, markers?, playedLog?, markedRanges? }`
 *     → builds drafts from the episode's REVIEWED transcript.
 *   `{ action: 'accept-draft', draftId }` / `{ action: 'discard-draft', draftId }`
 *     → acceptance is the only path that writes the episode.
 *   `{ action: 'accept-transcript', revisionId }`
 *     → marks a draft transcript revision reviewed and links it.
 *   `{ action: 'edit-transcript', revisionId, segments }`
 *     → edits a DRAFT revision's segments (reviewed = immutable).
 *   `{ action: 'audiogram', projectId, highlight }`
 *     → renders a POD-13 audiogram draft from a highlight range.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { episodeId } = await params
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  const drafts = await listAssistDrafts(payload as never, episodeId)
  return privateJson({ drafts })
}

export async function POST(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { episodeId } = await params
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  const body = await readJson(request)
  const by = String(context.user.id ?? 'staff')
  try {
    switch (body.action) {
      case 'generate': {
        const kinds = Array.isArray(body.kinds)
          ? (body.kinds.filter((kind) => KINDS.includes(kind as AssistKind)) as AssistKind[])
          : undefined
        const drafts = await generateAssistDrafts(payload as never, {
          episodeId,
          kinds,
          markers: body.markers as never,
          playedLog: body.playedLog as never,
          markedRanges: body.markedRanges as never,
          createdBy: by,
        })
        return privateJson({ drafts })
      }
      case 'accept-draft': {
        const draft = await acceptAssistDraft(payload as never, String(body.draftId ?? ''), { by })
        return privateJson({ draft })
      }
      case 'discard-draft': {
        const draft = await discardAssistDraft(payload as never, String(body.draftId ?? ''))
        return privateJson({ draft })
      }
      case 'accept-transcript': {
        const episode = await acceptTranscriptRevision(payload as never, {
          episodeId,
          revisionId: String(body.revisionId ?? ''),
        })
        return privateJson({
          episodeId: String((episode as any).id),
          transcript: (episode as any).transcript,
        })
      }
      case 'edit-transcript': {
        const revision = await editTranscriptRevision(
          payload as never,
          String(body.revisionId ?? ''),
          (body.segments ?? []) as TimedSegment[],
        )
        return privateJson({ revision })
      }
      case 'audiogram': {
        const draft = await createAudiogramFromHighlight(payload as never, undefined, {
          episodeId,
          projectId: String(body.projectId ?? ''),
          highlight: body.highlight as HighlightClip,
          createdBy: by,
        })
        return privateJson({ draft })
      }
      default:
        return privateJson({ error: `Unknown action "${String(body.action ?? '')}".` }, 400)
    }
  } catch (error) {
    if (error instanceof PodcastIntelligenceError)
      return privateJson({ error: error.message, code: error.code }, 409)
    return privateJson(
      { error: error instanceof Error ? error.message : 'Assist request failed.' },
      500,
    )
  }
}
