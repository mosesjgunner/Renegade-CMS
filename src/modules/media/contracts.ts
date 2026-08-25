import { createHash } from 'node:crypto'

export type ExternalMediaIdentity = { provider: string; externalId: string; scopeId: string }
export type TranscriptSegment = {
  id: string
  startSeconds: number
  endSeconds: number
  text: string
  speaker?: string
  confidence?: number
}
export type TranscriptRevision = {
  id: string
  mediaAssetId: string
  version: number
  source: 'provider' | 'manual' | 'ai-cleanup'
  sourceRevisionId?: string
  segments: readonly TranscriptSegment[]
  immutable: true
}
export type GraphicEdit =
  | { type: 'crop'; x: number; y: number; width: number; height: number; rotation?: number }
  | { type: 'text'; value: string; x: number; y: number; font: string; color: string }
  | {
      type: 'shape'
      shape: 'rectangle' | 'circle' | 'line'
      x: number
      y: number
      width: number
      height: number
      color: string
    }
  | { type: 'brand-overlay'; brandKitId: string; assetId: string; opacity: number }
  | {
      type: 'adjust'
      exposure?: number
      contrast?: number
      saturation?: number
      filter?: string
      blur?: number
    }
  | { type: 'redaction'; x: number; y: number; width: number; height: number }
export type EditRecipe = { version: 1; edits: readonly GraphicEdit[] }
export type GraphicLayer = {
  id: string
  name: string
  opacity: number
  hidden?: boolean
  mask?: EditRecipe | null
  recipe: EditRecipe
}
export type GraphicDocument = {
  id: string
  sourceMediaAssetId: string
  sourceRevision: string
  layers: readonly GraphicLayer[]
}
export type GraphicPreset =
  | 'hero'
  | 'og'
  | 'square'
  | 'portrait'
  | 'story'
  | 'newsletter'
  | 'thumbnail'
export type MediaUse = {
  id: string
  derivativeId: string
  target: 'article' | 'social-draft'
  targetId: string
  approved: boolean
}

export const externalIdentityKey = (identity: ExternalMediaIdentity) =>
  `${identity.provider}:${identity.scopeId}:${identity.externalId}`
export const transcriptChecksum = (segments: readonly TranscriptSegment[]) =>
  createHash('sha256').update(JSON.stringify(segments)).digest('hex')
export const assertTranscriptSegments = (segments: readonly TranscriptSegment[]) => {
  let previousEnd = 0
  for (const segment of segments) {
    if (segment.startSeconds < previousEnd || segment.endSeconds < segment.startSeconds)
      throw new Error('Transcript segments must be ordered and have non-negative durations.')
    previousEnd = segment.endSeconds
  }
}
export const deriveTranscriptRevision = (input: {
  source: TranscriptRevision
  sourceKind: 'manual' | 'ai-cleanup'
  segments: readonly TranscriptSegment[]
}): TranscriptRevision => {
  assertTranscriptSegments(input.segments)
  return {
    id: `${input.source.id}:${input.source.version + 1}`,
    mediaAssetId: input.source.mediaAssetId,
    version: input.source.version + 1,
    source: input.sourceKind,
    sourceRevisionId: input.source.id,
    segments: input.segments,
    immutable: true,
  }
}
export const createArticleDraftFromTranscript = (input: {
  transcript: TranscriptRevision
  title: string
  contentId: string
}) => ({
  contentId: input.contentId,
  lifecycle: 'draft' as const,
  provenance: {
    transcriptRevisionId: input.transcript.id,
    checksum: transcriptChecksum(input.transcript.segments),
  },
  plainText: input.transcript.segments.map((segment) => segment.text).join('\n\n'),
  title: input.title,
})
/** Deterministic boundaries for idempotent adapter fixtures and live adapters alike. */
export const providerSyncOperation = (identity: ExternalMediaIdentity, observedAt: string) => ({
  identityKey: externalIdentityKey(identity),
  operation: 'upsert' as const,
  observedAt,
})
export const bookNavigation = <
  T extends { id: string; displayOrder: number; releaseAt?: string | null },
>(
  chapters: readonly T[],
  currentId: string,
  now = new Date(),
) => {
  const visible = [...chapters]
    .filter((chapter) => !chapter.releaseAt || new Date(chapter.releaseAt) <= now)
    .sort((a, b) => a.displayOrder - b.displayOrder)
  const index = visible.findIndex((chapter) => chapter.id === currentId)
  if (index < 0) throw new Error('Chapter is not released or does not belong to this book.')
  return { previous: visible[index - 1] ?? null, next: visible[index + 1] ?? null }
}
export const chunkTtsText = (text: string, limit = 2800) => {
  if (limit < 100) throw new Error('TTS chunk limit is unsafe.')
  const words = text.trim().split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > limit && current) {
      chunks.push(current)
      current = word
    } else current = next
  }
  if (current) chunks.push(current)
  return chunks
}
export const ttsIdempotencyKey = (contentRevisionId: string, voiceSettings: unknown) =>
  `tts:${contentRevisionId}:${createHash('sha256').update(JSON.stringify(voiceSettings)).digest('hex')}`
export const assertGraphicDocument = (document: GraphicDocument) => {
  if (!document.sourceMediaAssetId || !document.sourceRevision || !document.layers.length)
    throw new Error('A graphic document needs an immutable source and at least one layer.')
  for (const layer of document.layers)
    if (layer.opacity < 0 || layer.opacity > 1)
      throw new Error('Layer opacity must be between zero and one.')
}
export const forkApprovedUse = (use: MediaUse, newDerivativeId: string): MediaUse => ({
  ...use,
  id: `${use.id}:fork`,
  derivativeId: newDerivativeId,
  approved: false,
})
export const updateAllApprovedUses = (
  uses: readonly MediaUse[],
  previousDerivativeId: string,
  nextDerivativeId: string,
) =>
  uses.map((use) =>
    use.derivativeId === previousDerivativeId && use.approved
      ? { ...use, derivativeId: nextDerivativeId }
      : use,
  )
export const resolveOfflineMutation = (
  state: 'queued' | 'synced' | 'conflict',
  serverRevisionMatches: boolean,
) => (state === 'queued' ? (serverRevisionMatches ? 'synced' : 'conflict') : state)
