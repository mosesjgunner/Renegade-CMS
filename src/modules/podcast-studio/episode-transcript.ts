/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import { canRenderPodcast } from '../media/publishing'
import { isEpisodeMembersOnly } from './embed'

export type EpisodeTranscriptLoad =
  | {
      kind: 'found'
      episode: Record<string, any>
      segments: { startSeconds: number; endSeconds: number; text: string; speaker?: string }[]
    }
  | { kind: 'redirect'; toPath: string }
  | { kind: 'missing' }

/**
 * Loads an episode's current transcript revision timed segments (the single
 * source serialised as HTML, Podcast JSON and SRT by the episode routes).
 * Mirrors the lookup + public-redirect behaviour of the existing transcript
 * and chapters routes.
 */
export async function loadEpisodeTranscript(
  payload: any,
  slug: string,
  formatPath: string,
  options: { allowMembersOnly?: boolean } = {},
): Promise<EpisodeTranscriptLoad> {
  const found = await payload.find({
    collection: 'podcast-episodes',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  const episode = found.docs[0] as Record<string, any> | undefined
  // POD-19 security fix: members-only episodes (flagged, or on a
  // members-visibility show) must not leak their transcript text through
  // the public serialisation routes — the POD-03 rule makes such an
  // episode ABSENT from public outputs entirely, and a transcript is
  // the episode's content in text form. Treated exactly like a missing
  // episode (no redirect chase: the episode exists, it is just not
  // public). The show is populated at depth 2 by the find above.
  // Internal staff-side callers (POD-12 project seeding) pass
  // allowMembersOnly — the gate guards the PUBLIC surface only.
  if (episode && !options.allowMembersOnly && isEpisodeMembersOnly(episode, episode.show)) {
    return { kind: 'missing' }
  }
  if (!episode || !canRenderPodcast(episode as never)) {
    const redirects = await payload
      .find({
        collection: 'public-redirects',
        where: { fromPath: { in: [formatPath, `/podcasts/episodes/${slug}`] } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))
    const redirectDoc = redirects.docs[0] as Record<string, unknown> | undefined
    if (redirectDoc && redirectDoc.enabled !== false && typeof redirectDoc.toPath === 'string') {
      return { kind: 'redirect', toPath: redirectDoc.toPath }
    }
    return { kind: 'missing' }
  }

  const rawTranscript = episode.transcript as
    | { segments?: Record<string, unknown>[] }
    | Record<string, unknown>[]
    | undefined
  const rawSegments: Record<string, unknown>[] = Array.isArray(rawTranscript)
    ? rawTranscript
    : rawTranscript &&
        typeof rawTranscript === 'object' &&
        'segments' in rawTranscript &&
        Array.isArray(rawTranscript.segments)
      ? rawTranscript.segments
      : []
  const segments = rawSegments.map((segment) => ({
    startSeconds: Number(segment.startSeconds ?? segment.startTime ?? 0),
    endSeconds: Number(segment.endSeconds ?? segment.endTime ?? 0),
    text: String(segment.text ?? segment.body ?? ''),
    speaker: segment.speaker ? String(segment.speaker) : undefined,
  }))
  return { kind: 'found', episode, segments }
}
