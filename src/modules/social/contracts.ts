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
/** Only deterministic provider fixture adapters are enabled until account credentials are configured. */
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
