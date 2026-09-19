import { createHash } from 'node:crypto'

/**
 * Supported Social Networks across 10 First-Class targets plus federated & secondary channels.
 */
export type SocialNetwork =
  | 'facebook'
  | 'instagram'
  | 'x'
  | 'threads'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'bluesky'
  | 'mastodon'
  | 'pinterest'
  | 'activitypub'
  | 'telegram'
  | 'discord'
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
  mimeType?: string
  fileSizeBytes?: number
  aspectRatio?: number
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
  platformSettings?: Record<string, unknown>
}

export interface DeliveryReceipt {
  remotePostId: string
  remoteUrl: string
  publishedAt: Date
  rawResponse: Record<string, unknown>
}

export type AdapterResult =
  | {
      status: 'published'
      remoteId: string
      remoteUrl?: string
      rawResponse?: Record<string, unknown>
      receipt?: DeliveryReceipt
    }
  | { status: 'failed'; error: ProviderError }
  | { status: 'unknown'; error: ProviderError }

// ==========================================
// 2026 Normalization Specification Contracts
// ==========================================

export interface ProviderCapabilities {
  supportsText: boolean
  supportsImages: boolean
  supportsVideo: boolean
  supportsCarousels: boolean
  supportsPolls: boolean
  supportsThreads: boolean
  supportsAltText: boolean
  supportsNativeScheduling: boolean
  supportsPostEditing: boolean
  supportsPostDeletion: boolean
  supportsAnalytics: boolean
  supportsComments: boolean
  supportsDrafts: boolean
  requiresMedia: boolean
  requiresBoardOrCategory: boolean
  supportsCustomThumbnails: boolean

  limits: {
    maxCharacters: number
    maxImages: number
    maxVideoDurationSeconds: number
    maxVideoFileSizeBytes: number
    maxImageFileSizeBytes: number
    carouselLimits?: {
      minItems: number
      maxItems: number
      allowMixedMedia: boolean
    }
  }

  mediaConstraints: {
    allowedImageMimes: string[]
    allowedVideoMimes: string[]
    allowedVideoCodecs: string[]
    aspectRatios: {
      minRatio: number
      maxRatio: number
      strictStandard?: 'VERTICAL_9_16' | 'SQUARE_1_1' | 'LANDSCAPE_16_9' | 'VERTICAL_2_3' | 'PORTRAIT_4_5'
      preferred?: string
    }
  }
}

export interface AccountConstraints {
  accountId: string
  accountHandle: string
  characterCeilingOverride?: number
  permissiblePrivacyLevels?: string[]
  availableBoards?: Array<{ id: string; name: string }>
  requiresCategorySelection?: boolean
  dailyPostsRemaining?: number
}

export interface ValidationIssue {
  field: string
  message: string
  code: string
}

export interface ValidationReport {
  isValid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

export interface NormalizedAnalytics {
  deliveryId: string
  remotePostId: string
  retrievedAt: Date
  metrics: {
    impressions: number
    reach: number
    views: number
    clicks: number
    likes: number
    comments: number
    shares: number
    saves: number
    engagementRate: number
  }
  videoTelemetry?: {
    totalWatchTimeSeconds: number
    averageWatchTimeSeconds: number
    completionRate: number
  }
  rawPlatformMetrics: Record<string, unknown>
}

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  tokenType?: string
  scopes?: string[]
}

export interface OAuthInitParams {
  redirectUri: string
  state: string
  codeChallenge?: string
  codeChallengeMethod?: 'S256' | 'plain'
  scopes?: string[]
}

export interface AuthContext {
  accountId: string
  accountHandle: string
  network: SocialNetwork
  credentials: Record<string, string> | null
  tokens?: AuthTokens
}

export interface MediaResolver {
  resolveUrl(mediaAssetId: string): Promise<string>
  resolveBuffer(mediaAssetId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }>
}

export interface NormalizedRemotePost {
  remoteId: string
  remoteUrl: string
  text: string
  publishedAt: Date
  authorHandle?: string
}

/**
 * Normalized Social Provider Adapter Contract.
 */
export interface SocialProviderAdapter {
  readonly id?: string
  readonly name?: string
  readonly version?: string
  readonly network: SocialNetwork
  readonly mode: 'live' | 'manual-handoff' | 'unavailable' | 'fixture'

  // Static capabilities
  getCapabilities?(): ProviderCapabilities

  // Runtime account constraints discovery
  discoverAccountConstraints?(authContext: AuthContext): Promise<AccountConstraints>

  // OAuth Lifecycle
  getAuthorizationUrl?(params: OAuthInitParams): Promise<string>
  exchangeAuthorizationCode?(code: string, verifier?: string): Promise<AuthTokens>
  refreshTokens?(currentTokens: AuthTokens): Promise<AuthTokens>
  revokeAccess?(authContext: AuthContext): Promise<void>

  // Validation
  validatePost?(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport

  // Publishing
  publish?(
    variant: SocialVariant,
    context?: AuthContext | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaService?: MediaResolver,
  ): Promise<AdapterResult>

  // Post-publication operations
  fetchPost?(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost>
  deletePost?(remotePostId: string, authContext: AuthContext): Promise<void>
  editPost?(remotePostId: string, variant: SocialVariant, authContext: AuthContext): Promise<DeliveryReceipt>

  // Telemetry
  fetchAnalytics?(remotePostId: string, authContext: AuthContext): Promise<NormalizedAnalytics>

  // Backward compatibility capability alias
  readonly capabilities: SocialProviderCapabilities
}

// Legacy Capabilities Contract kept for backward compatibility with existing tests
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

// ==========================================
// Canonical Helper Functions & Utilities
// ==========================================

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
  return allowed[from]?.includes(to) ?? false
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
export const fixtureAdapter = (
  network: 'activitypub' | 'bluesky',
  fail = false,
): SocialProviderAdapter & { publish: (variant: SocialVariant) => Promise<AdapterResult> } => ({
  id: `fixture-${network}`,
  name: `Fixture ${network}`,
  version: '1.0.0',
  network,
  mode: 'fixture' as const,
  capabilities: {
    postTypes: ['text', 'link', 'image'],
    textLimit: 500,
    media: { images: true, video: false, audio: false, maxAttachments: 4 },
    threads: true,
    linkCards: 'native',
    edit: true,
    delete: true,
    nativeScheduling: false,
    authentication: { required: false, modes: [] },
    rateLimit: {},
  },
  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: true,
      supportsImages: true,
      supportsVideo: false,
      supportsCarousels: false,
      supportsPolls: false,
      supportsThreads: true,
      supportsAltText: true,
      supportsNativeScheduling: false,
      supportsPostEditing: true,
      supportsPostDeletion: true,
      supportsAnalytics: false,
      supportsComments: true,
      supportsDrafts: false,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: false,
      limits: {
        maxCharacters: 500,
        maxImages: 4,
        maxVideoDurationSeconds: 0,
        maxVideoFileSizeBytes: 0,
        maxImageFileSizeBytes: 10 * 1024 * 1024,
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp'],
        allowedVideoMimes: [],
        allowedVideoCodecs: [],
        aspectRatios: { minRatio: 0.5, maxRatio: 2.5 },
      },
    }
  },
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
