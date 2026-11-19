/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-03 (POD-REQ-08): private & member podcast feeds.
 *
 * A member's private feed URL carries an unguessable per-member token.
 * Only the token's SHA-256 (hex) is ever persisted — the raw token is
 * returned exactly once, at issue/rotation time, and is never logged
 * (the structured events below carry member/show/token-record ids
 * only). Access is never granted by URL secrecy alone: the token feed
 * and token-scoped enclosure routes re-resolve the token AND re-check
 * the member's commerce entitlement on every request, so revoking the
 * token, rotating it, or revoking the entitlement cuts access
 * immediately.
 *
 * Entitlement binding (following the existing commerce pattern — the
 * subscription download route's `hasEntitlement` seam and the
 * `requiredEntitlement` JSON policy used by content/events):
 * a podcast show may carry a `requiredEntitlement` policy
 * `{ resource, capability, scope? }`; when it does not, the binding
 * defaults to resource `podcast-show:<showId>` with capability
 * `listen`. A subscription plan grants access by including that
 * resource/capability in its entitlements (see
 * docs/podcast-studio/MEMBER_FEEDS.md).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { hasEntitlement } from '../commerce/subscription-service'

export const PODCAST_FEED_TOKEN_COLLECTION = 'podcast-feed-tokens'
/** 32 random bytes → 43-char base64url token (256 bits of entropy). */
export const FEED_TOKEN_BYTES = 32

export type MemberFeedStore = {
  find(args: any): Promise<{ docs: any[] }>
  findByID(args: any): Promise<any>
  create(args: any): Promise<any>
  update(args: any): Promise<any>
}

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id ?? '')
      : ''

/** Structured lifecycle events. NEVER include the raw token or its hash. */
export function logMemberFeedEvent(
  event: 'issued' | 'rotated' | 'revoked' | 'resolved' | 'resolve-failed',
  fields: { memberId?: string; showId?: string; tokenId?: string },
): void {
  console.log(JSON.stringify({ event: `podcast.member-feed.${event}`, ...fields }))
}

export function generateFeedToken(): string {
  return randomBytes(FEED_TOKEN_BYTES).toString('base64url')
}

/** The only persisted form of a feed token: bare SHA-256 hex. */
export function hashFeedToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type PodcastEntitlementBinding = { resource: string; capability: string; scope?: string }

/**
 * The show's entitlement binding: its explicit `requiredEntitlement`
 * policy when set (the content/events shape), otherwise the default
 * per-show resource `podcast-show:<showId>` / capability `listen`.
 */
export function podcastEntitlementForShow(show: {
  id?: unknown
  requiredEntitlement?: unknown
}): PodcastEntitlementBinding {
  const raw = show.requiredEntitlement as Record<string, unknown> | null | undefined
  if (
    raw &&
    typeof raw.resource === 'string' &&
    raw.resource.trim() &&
    typeof raw.capability === 'string' &&
    raw.capability.trim()
  ) {
    return {
      resource: raw.resource,
      capability: raw.capability,
      ...(typeof raw.scope === 'string' && raw.scope ? { scope: raw.scope } : {}),
    }
  }
  return { resource: `podcast-show:${String(show.id ?? '')}`, capability: 'listen' }
}

/** Serve-time entitlement check, evaluated fresh on every request. */
export async function memberHasPodcastEntitlement(
  store: MemberFeedStore,
  show: { id?: unknown; site?: unknown; requiredEntitlement?: unknown },
  memberId: string,
): Promise<boolean> {
  const siteId = relationId(show.site)
  if (!siteId || !memberId) return false
  const binding = podcastEntitlementForShow(show)
  return hasEntitlement(store as never, {
    subjectId: memberId,
    siteId,
    resource: binding.resource,
    capability: binding.capability,
    ...(binding.scope ? { scope: binding.scope } : {}),
  })
}

async function activeTokensFor(
  store: MemberFeedStore,
  memberId: string,
  showId: string,
): Promise<any[]> {
  const result = await store.find({
    collection: PODCAST_FEED_TOKEN_COLLECTION,
    where: {
      and: [{ member: { equals: memberId } }, { show: { equals: showId } }],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return (result.docs as any[]).filter((doc) => !doc.revokedAt)
}

async function revokeActiveTokens(
  store: MemberFeedStore,
  memberId: string,
  showId: string,
  now: Date,
): Promise<number> {
  const active = await activeTokensFor(store, memberId, showId)
  for (const doc of active) {
    await store.update({
      collection: PODCAST_FEED_TOKEN_COLLECTION,
      id: String(doc.id),
      data: { revokedAt: now.toISOString() },
      overrideAccess: true,
    })
  }
  return active.length
}

export type IssuedFeedToken = {
  /** Token record id. */
  id: string
  /** The raw token — returned ONCE here; only its hash is stored. */
  token: string
  memberId: string
  showId: string
  createdAt: string
}

/**
 * Issues a token for (member, show). One active token per member+show:
 * any prior active token is revoked in the same operation, so issuing
 * is also the rotation-safe path for a first subscription.
 */
export async function issueToken(
  store: MemberFeedStore,
  input: { memberId: string; showId: string; now?: Date },
): Promise<IssuedFeedToken> {
  const now = input.now ?? new Date()
  await revokeActiveTokens(store, input.memberId, input.showId, now)
  const token = generateFeedToken()
  const doc = await store.create({
    collection: PODCAST_FEED_TOKEN_COLLECTION,
    data: {
      member: input.memberId,
      show: input.showId,
      tokenHash: hashFeedToken(token),
      revokedAt: null,
      lastUsedAt: null,
    },
    overrideAccess: true,
  })
  logMemberFeedEvent('issued', {
    memberId: input.memberId,
    showId: input.showId,
    tokenId: String(doc.id),
  })
  return {
    id: String(doc.id),
    token,
    memberId: input.memberId,
    showId: input.showId,
    createdAt: now.toISOString(),
  }
}

/** Rotation: the old token is revoked in the same operation, then a fresh token is issued. */
export async function rotateToken(
  store: MemberFeedStore,
  input: { memberId: string; showId: string; now?: Date },
): Promise<IssuedFeedToken> {
  const issued = await issueToken(store, input)
  logMemberFeedEvent('rotated', {
    memberId: input.memberId,
    showId: input.showId,
    tokenId: issued.id,
  })
  return issued
}

/** Revokes the active token(s) for (member, show). Effective immediately. */
export async function revokeToken(
  store: MemberFeedStore,
  input: { memberId: string; showId: string; now?: Date },
): Promise<{ revoked: number }> {
  const now = input.now ?? new Date()
  const revoked = await revokeActiveTokens(store, input.memberId, input.showId, now)
  if (revoked) logMemberFeedEvent('revoked', { memberId: input.memberId, showId: input.showId })
  return { revoked }
}

export type ResolvedFeedToken = { tokenId: string; memberId: string; showId: string }

/**
 * Resolves a raw token to its (member, show). Constant-shape failures:
 * unknown, malformed, revoked, and show-mismatched tokens all return
 * `null` — callers answer a single 404 shape and never learn which
 * check failed. The stored hash is compared in constant time.
 */
export async function resolveToken(
  store: MemberFeedStore,
  rawToken: string | null | undefined,
  options?: { showId?: string; now?: Date },
): Promise<ResolvedFeedToken | null> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 20) return null
  const now = options?.now ?? new Date()
  const hash = hashFeedToken(rawToken)
  const result = await store
    .find({
      collection: PODCAST_FEED_TOKEN_COLLECTION,
      where: { tokenHash: { equals: hash } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as any[] }))
  const doc = result.docs[0] as any | undefined
  if (!doc) {
    logMemberFeedEvent('resolve-failed', {})
    return null
  }
  const stored = Buffer.from(String(doc.tokenHash ?? ''), 'utf8')
  const computed = Buffer.from(hash, 'utf8')
  const hashMatches = stored.length === computed.length && timingSafeEqual(stored, computed)
  const memberId = relationId(doc.member)
  const showId = relationId(doc.show)
  if (
    !hashMatches ||
    doc.revokedAt ||
    !memberId ||
    !showId ||
    (options?.showId && showId !== options.showId)
  ) {
    logMemberFeedEvent('resolve-failed', { memberId, showId, tokenId: String(doc.id) })
    return null
  }
  // Best-effort usage stamp; a stamp failure never blocks a valid read.
  await store
    .update({
      collection: PODCAST_FEED_TOKEN_COLLECTION,
      id: String(doc.id),
      data: { lastUsedAt: now.toISOString() },
      overrideAccess: true,
    })
    .catch(() => undefined)
  return { tokenId: String(doc.id), memberId, showId }
}

/** Member-feed URL paths for a show slug + raw token. */
export const memberFeedPath = (slug: string, token: string) =>
  `/podcasts/${slug}/member-feed/${token}`
export const memberEnclosurePath = (slug: string, token: string, episodeId: string) =>
  `/podcasts/${slug}/member-feed/${token}/episode/${episodeId}/audio`

/** An episode is members-only when flagged, or when its whole show is. */
export const episodeIsMembersOnly = (
  episode: { membersOnly?: unknown },
  show: { feedVisibility?: unknown },
): boolean => Boolean(episode.membersOnly) || show.feedVisibility === 'members'
