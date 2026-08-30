import { createHash } from 'node:crypto'

/** Provider capability is deliberately granular: a connected account is never a blanket promise. */
export type SocialNetwork =
  | 'activitypub'
  | 'bluesky'
  | 'x'
  | 'threads'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'manual'
export type SocialState =
  | 'draft'
  | 'review'
  | 'approved'
  | 'queued'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partially-published'
  | 'failed'
  | 'cancelled'
  | 'deletion-requested'
export type CapabilityState =
  | 'available'
  | 'limited'
  | 'approval-required'
  | 'manual-handoff'
  | 'unavailable'
export type ProviderError = {
  kind:
    | 'validation'
    | 'authentication'
    | 'authorization'
    | 'rate-limit'
    | 'transient'
    | 'remote-unknown'
    | 'unsupported'
    | 'reconnect-required'
  message: string
  retryAfter?: string
  providerCode?: string
  remoteOutcome?: 'known-failed' | 'unknown'
}
export type SocialAttachment = {
  mediaAssetId: string
  role: 'image' | 'video' | 'audio' | 'document'
  altText?: string
}
export type SocialVariant = {
  id: string
  accountId: string
  network: SocialNetwork
  text: string
  attachments: readonly SocialAttachment[]
  linkUrl?: string
  status: SocialState
  approvalHash?: string
  scheduledFor?: string
  timeZone?: string
  idempotencyKey: string
}
export type AdapterResult =
  | { status: 'published'; remoteId: string; remoteUrl?: string }
  | { status: 'failed'; error: ProviderError }
  | { status: 'unknown'; error: ProviderError }

export type SocialProviderCapabilities = Readonly<{
  postTypes: readonly ('text' | 'link' | 'image' | 'video' | 'thread')[]
  textLimit: number | null
  media: Readonly<{ images: boolean; video: boolean; audio: boolean; maxAttachments?: number }>
  threads: boolean
  linkCards: 'native' | 'text-only' | 'none'
  edit: boolean
  delete: boolean
  nativeScheduling: boolean
  authentication: Readonly<{ required: boolean; modes: readonly string[] }>
  rateLimit: Readonly<{ requestsPerMinute?: number; retryAfterHeader?: string }>
}>
export type SocialProviderAdapter = Readonly<{
  network: SocialNetwork
  mode: 'live' | 'manual-handoff' | 'unavailable'
  capabilities: SocialProviderCapabilities
  publish?: (
    variant: SocialVariant,
    context: Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
  ) => Promise<AdapterResult>
}>
export const socialHash = (
  input: Pick<SocialVariant, 'text' | 'attachments' | 'linkUrl' | 'network'>,
) => `sha256:${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`
export const socialIdempotencyKey = (variantId: string, approvedHash: string) =>
  `social:${variantId}:${approvedHash.replace('sha256:', '')}`
export const normalizeProviderError = (
  input: Partial<ProviderError> & { message?: string },
): ProviderError => ({
  kind: input.kind ?? 'transient',
  message: input.message ?? 'The provider did not accept this request.',
  providerCode: input.providerCode,
  retryAfter: input.retryAfter,
  remoteOutcome: input.remoteOutcome ?? 'known-failed',
})
export const validateVariant = (variant: SocialVariant, maxCharacters?: number): string[] => {
  const issues: string[] = []
  if (!variant.text.trim() && !variant.attachments.length)
    issues.push('A post needs text or an attachment.')
  if (maxCharacters && variant.text.length > maxCharacters)
    issues.push(
      `Text is ${variant.text.length - maxCharacters} characters over this account's limit.`,
    )
  if (variant.network === 'instagram' && !variant.attachments.length)
    issues.push('Instagram publishing requires media.')
  return issues
}
export const validateForProvider = (
  variant: SocialVariant,
  capabilities: SocialProviderCapabilities,
): string[] => {
  const issues = validateVariant(variant, capabilities.textLimit ?? undefined)
  const images = variant.attachments.filter((item) => item.role === 'image')
  if (images.length > (capabilities.media.maxAttachments ?? 0))
    issues.push('This provider does not support that many image attachments.')
  if (variant.attachments.some((item) => item.role === 'video') && !capabilities.media.video)
    issues.push('This provider does not support video attachments.')
  if (
    variant.attachments.some(
      (item) =>
        !['image', 'video'].includes(item.role) ||
        (item.role === 'image' && !capabilities.media.images),
    )
  )
    issues.push('This provider does not support one or more attachment types.')
  return issues
}

export const retryDelayMs = (error: ProviderError, attemptNumber: number) => {
  const retryAfter = error.retryAfter ? Date.parse(error.retryAfter) - Date.now() : Number.NaN
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter
    : Math.min(900000, 1000 * 2 ** Math.max(0, attemptNumber - 1))
}

export const shouldRetryProviderError = (error: ProviderError) =>
  error.kind === 'transient' || error.kind === 'rate-limit'

export const canTransitionSocial = (from: SocialState, to: SocialState) => {
  const allowed: Record<SocialState, readonly SocialState[]> = {
    draft: ['review', 'cancelled'],
    review: ['draft', 'approved', 'cancelled'],
    approved: ['queued', 'scheduled', 'publishing', 'cancelled'],
    queued: ['scheduled', 'publishing', 'cancelled'],
    scheduled: ['queued', 'publishing', 'cancelled'],
    publishing: ['published', 'failed', 'partially-published'],
    published: ['deletion-requested'],
    'partially-published': ['queued', 'published', 'failed'],
    failed: ['queued', 'cancelled'],
    cancelled: [],
    'deletion-requested': ['published', 'failed'],
  }
  return allowed[from].includes(to)
}
export const assertSocialTransition = (from: SocialState, to: SocialState) => {
  if (!canTransitionSocial(from, to))
    throw new Error(`Cannot move social work from ${from} to ${to}.`)
}
export const campaignState = (states: readonly SocialState[]): SocialState => {
  if (states.includes('failed') && states.includes('published')) return 'partially-published'
  if (states.length && states.every((state) => state === 'published')) return 'published'
  if (states.includes('publishing')) return 'publishing'
  if (states.includes('scheduled')) return 'scheduled'
  if (states.includes('queued')) return 'queued'
  if (states.includes('approved')) return 'approved'
  return states.includes('review') ? 'review' : 'draft'
}
/** Test-only deterministic boundary; production resolves provider-runtime.ts. */
export const fixtureAdapter = (network: 'activitypub' | 'bluesky', fail = false) => ({
  network,
  mode: 'fixture' as const,
  publish: async (variant: SocialVariant): Promise<AdapterResult> =>
    fail
      ? {
          status: 'failed' as const,
          error: normalizeProviderError({
            kind: 'transient',
            message: 'Recorded fixture delivery failure.',
          }),
        }
      : {
          status: 'published' as const,
          remoteId: `${network}:${variant.idempotencyKey}`,
          remoteUrl: `https://${network}.fixture.invalid/post/${variant.id}`,
        },
})

export type CalendarMove = {
  entryId: string
  startsAt: string
  endsAt?: string | null
  timeZone: string
  actorId: string
}
export const rescheduleCalendarEntry = (
  entry: { startsAt: string; endsAt?: string | null; timeZone: string },
  move: CalendarMove,
) => {
  if (!move.timeZone.includes('/'))
    throw new Error('Calendar rescheduling requires an IANA timezone.')
  const start = new Date(move.startsAt).getTime()
  const end = move.endsAt ? new Date(move.endsAt).getTime() : null
  if (Number.isNaN(start) || (end !== null && (Number.isNaN(end) || end < start)))
    throw new Error('Calendar end must follow start.')
  return {
    ...entry,
    startsAt: move.startsAt,
    endsAt: move.endsAt ?? null,
    timeZone: move.timeZone,
    audit: { action: 'calendar.rescheduled', actorId: move.actorId, at: new Date().toISOString() },
  }
}
