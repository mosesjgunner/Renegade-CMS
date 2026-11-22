/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-18 — Interviews surface (#17).
 *
 * The `interviews` collection has existed as a data shell (guests,
 * hosts, media, transcript, quotes) with no service behind it: nothing
 * could capture an interview, extract a quote, or export one. This
 * module is that bounded surface:
 *
 *   createInterviewCapture — create a draft interview in a site scope,
 *     with referential integrity enforced: attached media must belong
 *     to the same site, and an attached transcript revision must be a
 *     transcript OF that media.
 *   extractInterviewQuotes — deterministic quote extraction from the
 *     linked transcript revision's timed segments, persisted onto the
 *     interview's `quotes` and returned for readback. A quote always
 *     carries its segment id and time range, so it can be traced back
 *     to the exact moment in the source recording.
 *   exportInterview — the approved export. Publication is the approval
 *     boundary: a draft interview cannot be exported. The export is a
 *     real artifact — a JSON document persisted as a media asset
 *     (kind `document`) holding the transcript and the extracted
 *     quotes — not a view-layer download that leaves no record.
 *   getInterviewReadback — the readback projection: interview with
 *     guests/hosts/media/transcript resolved, plus the export asset
 *     when one exists.
 */
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'

import { loadConfig } from '../core/config'
import { assertTranscriptSegments, transcriptChecksum, type TranscriptSegment } from './contracts'
import { mediaObjectKey, mediaStorage } from './storage'

type Doc = Record<string, any>

const id = (value: unknown): string => String((value as { id?: string } | null)?.id ?? value ?? '')

export type InterviewQuote = {
  segmentId: string
  speaker: string | null
  startSeconds: number
  endSeconds: number
  text: string
}

const QUOTE_MIN_CHARS = 80
const QUOTE_MAX = 8

/** Pure extraction rule: substantive segments, in order, capped. */
export function selectInterviewQuotes(segments: readonly TranscriptSegment[]): InterviewQuote[] {
  return segments
    .filter((segment) => segment.text.trim().length >= QUOTE_MIN_CHARS)
    .slice(0, QUOTE_MAX)
    .map((segment) => ({
      segmentId: segment.id,
      speaker: segment.speaker ?? null,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: segment.text,
    }))
}

async function loadInterview(payload: Payload, interviewId: string): Promise<Doc> {
  const interview = (await payload
    .findByID({
      collection: 'interviews',
      id: interviewId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)) as Doc | null
  if (!interview) throw new Error('Interview not found.')
  return interview
}

export async function createInterviewCapture(
  payload: Payload,
  input: {
    site: string
    publication?: string | null
    title: string
    slug: string
    description?: string
    guestIds?: string[]
    hostIds?: string[]
    mediaId?: string | null
    transcriptId?: string | null
    sourceIds?: string[]
  },
) {
  const title = input.title.trim()
  if (!title) throw new Error('An interview title is required.')
  if (!input.slug.trim()) throw new Error('An interview slug is required.')
  let transcript: Doc | null = null
  if (input.mediaId) {
    const media = (await payload
      .findByID({
        collection: 'media-assets',
        id: input.mediaId,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => null)) as Doc | null
    if (!media) throw new Error('Interview media not found.')
    if (id(media.site) !== input.site) throw new Error('Interview media belongs to another site.')
  }
  if (input.transcriptId) {
    transcript = (await payload
      .findByID({
        collection: 'transcript-revisions',
        id: input.transcriptId,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => null)) as Doc | null
    if (!transcript) throw new Error('Interview transcript revision not found.')
    if (input.mediaId && id(transcript.media) !== input.mediaId)
      throw new Error('Transcript revision belongs to different media than the interview.')
  }
  const interview = (await payload.create({
    collection: 'interviews',
    overrideAccess: true,
    data: {
      site: input.site,
      publication: input.publication ?? null,
      title,
      slug: input.slug,
      description: input.description ?? null,
      status: 'draft',
      guests: input.guestIds ?? [],
      hosts: input.hostIds ?? [],
      media: input.mediaId ?? null,
      transcript: input.transcriptId ?? null,
      quotes: [],
      sources: input.sourceIds ?? [],
    },
  } as never)) as Doc
  return interview
}

export async function extractInterviewQuotes(payload: Payload, interviewId: string) {
  const interview = await loadInterview(payload, interviewId)
  if (!id(interview.transcript))
    throw new Error('Interview has no transcript revision to extract quotes from.')
  const transcript = (await payload.findByID({
    collection: 'transcript-revisions',
    id: id(interview.transcript),
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  const segments = (transcript.segments ?? []) as TranscriptSegment[]
  assertTranscriptSegments(segments)
  const quotes = selectInterviewQuotes(segments)
  const updated = (await payload.update({
    collection: 'interviews',
    id: interviewId,
    data: { quotes },
    overrideAccess: true,
  } as never)) as Doc
  return { interview: updated, quotes }
}

export async function exportInterview(
  payload: Payload,
  input: { interviewId: string; actorId: string },
) {
  const interview = await loadInterview(payload, input.interviewId)
  if (interview.status !== 'published')
    throw new Error(
      'Interview export requires a published interview; publication is the approval boundary.',
    )
  let segments: TranscriptSegment[] = []
  let checksum: string | null = null
  if (id(interview.transcript)) {
    const transcript = (await payload.findByID({
      collection: 'transcript-revisions',
      id: id(interview.transcript),
      depth: 0,
      overrideAccess: true,
    } as never)) as Doc
    segments = (transcript.segments ?? []) as TranscriptSegment[]
    assertTranscriptSegments(segments)
    // Cite the revision's checksum of record; recomputing over the
    // DB-round-tripped segments can differ (key order / normalization)
    // and would make the export disagree with the revision it cites.
    checksum = String(transcript.checksum ?? '') || transcriptChecksum(segments)
  }
  const resolveNames = async (ids: unknown): Promise<string[]> => {
    const list = Array.isArray(ids) ? ids : []
    const names: string[] = []
    for (const entry of list) {
      const author = (await payload
        .findByID({ collection: 'authors', id: id(entry), depth: 0, overrideAccess: true } as never)
        .catch(() => null)) as Doc | null
      names.push(String(author?.title ?? author?.name ?? id(entry)))
    }
    return names
  }
  const artifact = {
    kind: 'renegade-interview-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: input.actorId,
    interview: {
      id: String(interview.id),
      title: String(interview.title),
      slug: String(interview.slug),
      status: String(interview.status),
    },
    guests: await resolveNames(interview.guests),
    hosts: await resolveNames(interview.hosts),
    quotes: (interview.quotes ?? []) as InterviewQuote[],
    transcript: { revisionId: id(interview.transcript) || null, checksum, segments },
  }
  const bytes = new Uint8Array(Buffer.from(JSON.stringify(artifact, null, 2), 'utf8'))
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const siteId = id(interview.site)
  const config = loadConfig()
  const storage = mediaStorage(config)
  const key = mediaObjectKey(siteId, 'json')
  await storage.put(key, bytes, 'application/json')
  const blob = (await payload.create({
    collection: 'media-blobs',
    overrideAccess: true,
    data: {
      site: siteId,
      publication: id(interview.publication) || null,
      space: id(interview.space) || null,
      checksum: digest,
      storageKey: key,
      storageProvider: storage.provider,
      mimeType: 'application/json',
      sizeBytes: bytes.byteLength,
      state: 'ready',
    },
  } as never)) as Doc
  const asset = (await payload.create({
    collection: 'media-assets',
    overrideAccess: true,
    data: {
      site: siteId,
      publication: id(interview.publication) || null,
      space: id(interview.space) || null,
      owner: null,
      title: `Interview export — ${String(interview.title)}`,
      kind: 'document',
      storageLocation: String(blob.storageKey),
      storageProvider: storage.provider,
      originalBlob: blob.id,
      originalFilename: `interview-${String(interview.slug)}.json`,
      mimeType: 'application/json',
      sizeBytes: bytes.byteLength,
      checksum: digest,
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: false,
      processingState: 'ready',
      publicPolicy: 'private',
      customMetadata: { interview: String(interview.id), exportVersion: 1 },
    },
  } as never)) as Doc
  // Provenance lives on the export asset itself (customMetadata.interview):
  // media-usages.usedBy has no 'interviews' target, and adding one is a
  // schema migration this pass deliberately does not take on.
  return { interview, asset, artifact }
}

export async function getInterviewReadback(payload: Payload, interviewId: string) {
  const interview = (await payload
    .findByID({
      collection: 'interviews',
      id: interviewId,
      depth: 2,
      overrideAccess: true,
    } as never)
    .catch(() => null)) as Doc | null
  if (!interview) return undefined
  const documents = await payload
    .find({
      collection: 'media-assets',
      where: {
        and: [{ site: { equals: id(interview.site) } }, { kind: { equals: 'document' } }],
      },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => ({ docs: [] as Doc[] }))
  const exports = (documents.docs as unknown as Doc[])
    .filter((asset) => String(asset.customMetadata?.interview ?? '') === interviewId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const latest = exports[exports.length - 1]
  return { interview, exportAssetId: latest ? String(latest.id) : null }
}
