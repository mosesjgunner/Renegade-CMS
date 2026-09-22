import type { Payload } from 'payload'

import { publicMedia } from '../media/workflow'

export const PROFILE_PROJECTION_VERSION = 1
export type ProfileAudience = 'public' | 'members' | 'followers' | 'private'
export type ProfileViewer = {
  memberId?: string
  signedIn: boolean
  following?: boolean
  blocked?: boolean
  /** Mutes are deliberately one-way: only the muting viewer loses the projection. */
  muted?: boolean
}
export type ProfileLink = { label: string; url: string }

const FIELDS = ['bio', 'avatar', 'cover', 'links', 'locale', 'timeZone'] as const
type Field = (typeof FIELDS)[number]
type Doc = Record<string, unknown>
type FieldAudience = Partial<Record<Field, ProfileAudience>>

export class ProfileAccessError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function relationId(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const item = value as { id?: string; value?: string | { id?: string } }
    return item.id ?? (typeof item.value === 'string' ? item.value : item.value?.id) ?? ''
  }
  return ''
}

export function safeProfileLink(value: unknown): ProfileLink | null {
  if (!value || typeof value !== 'object') return null
  const item = value as { label?: unknown; url?: unknown }
  if (typeof item.url !== 'string' || typeof item.label !== 'string') return null
  try {
    const url = new URL(item.url)
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost')
      return null
    const label = item.label.trim().slice(0, 80)
    if (!label || url.toString().length > 2048) return null
    return { label, url: url.toString() }
  } catch {
    return null
  }
}

export function normalizeProfileLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value) || value.length > 8)
    throw new ProfileAccessError(400, 'Use up to eight secure links.')
  const links = value.map(safeProfileLink)
  if (links.some((link) => !link))
    throw new ProfileAccessError(400, 'Every link needs a label and a secure HTTPS URL.')
  return links as ProfileLink[]
}

export function normalizeFieldAudience(value: unknown): FieldAudience {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ProfileAccessError(400, 'Invalid field visibility.')
  const source = value as Record<string, unknown>
  const result: FieldAudience = {}
  for (const [key, audience] of Object.entries(source)) {
    if (
      !FIELDS.includes(key as Field) ||
      !['public', 'members', 'followers', 'private'].includes(String(audience))
    )
      throw new ProfileAccessError(400, 'Invalid field visibility.')
    result[key as Field] = audience as ProfileAudience
  }
  return result
}

function maySee(audience: ProfileAudience, viewer: ProfileViewer, isSelf: boolean): boolean {
  return (
    isSelf ||
    audience === 'public' ||
    (audience === 'members' && viewer.signedIn) ||
    (audience === 'followers' && Boolean(viewer.following))
  )
}

/** A fixed allowlist. Unknown profile, member, credential and audit keys never serialize. */
export function projectMemberProfile(
  raw: Doc,
  viewer: ProfileViewer,
  media: { avatarUrl?: string; coverUrl?: string } = {},
) {
  const ownerId = relationId(raw.member)
  const isSelf = Boolean(viewer.memberId && viewer.memberId === ownerId)
  if ((viewer.blocked || viewer.muted) && !isSelf)
    throw new ProfileAccessError(404, 'Profile unavailable.')
  const visibility = String(raw.visibility ?? 'private')
  const canSee =
    isSelf ||
    visibility === 'public' ||
    visibility === 'unlisted' ||
    (visibility === 'members' && viewer.signedIn) ||
    (visibility === 'friends' && viewer.following)
  if (!canSee) throw new ProfileAccessError(404, 'Profile unavailable.')
  const audience = (raw.fieldAudience ?? {}) as FieldAudience
  const visible = (field: Field) => maySee(audience[field] ?? 'public', viewer, isSelf)
  const links = Array.isArray(raw.links) ? raw.links.map(safeProfileLink).filter(Boolean) : []
  return {
    version: PROFILE_PROJECTION_VERSION,
    id: String(raw.id ?? ''),
    memberId: ownerId,
    handle: String(raw.handle ?? ''),
    displayName: String(raw.displayName ?? 'Community member'),
    visibility,
    ...(visible('bio') && typeof raw.bio === 'string' ? { bio: raw.bio } : {}),
    ...(visible('links') ? { links } : {}),
    ...(visible('locale') && typeof raw.locale === 'string' ? { locale: raw.locale } : {}),
    ...(visible('timeZone') && typeof raw.timeZone === 'string' ? { timeZone: raw.timeZone } : {}),
    ...(visible('avatar') && media.avatarUrl
      ? { avatarUrl: media.avatarUrl, avatarAlt: String(raw.avatarAlt ?? '') }
      : {}),
    ...(visible('cover') && media.coverUrl
      ? { coverUrl: media.coverUrl, coverAlt: String(raw.coverAlt ?? '') }
      : {}),
    discoverable: visibility === 'public' && raw.discoveryOptOut !== true,
  }
}

async function activeRelation(
  payload: Payload,
  siteId: string,
  kind: string,
  subject: string,
  object: string,
) {
  const keys = [`${kind}:${siteId}:${subject}:${object}`, `${kind}:${subject}:${object}`]
  const found = await payload.find({
    collection: 'relationships',
    where: {
      and: [
        { site: { equals: siteId } },
        { pairKey: { in: keys } },
        { status: { equals: 'active' } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return found.docs.length > 0
}

export async function relationshipView(
  payload: Payload,
  siteId: string,
  viewerId: string | undefined,
  ownerId: string,
): Promise<ProfileViewer> {
  if (!viewerId) return { signedIn: false }
  if (viewerId === ownerId) return { signedIn: true, memberId: viewerId }
  const [outbound, inbound, following, muted] = await Promise.all([
    activeRelation(payload, siteId, 'block', viewerId, ownerId),
    activeRelation(payload, siteId, 'block', ownerId, viewerId),
    activeRelation(payload, siteId, 'follow', viewerId, ownerId),
    activeRelation(payload, siteId, 'mute', viewerId, ownerId),
  ])
  return { memberId: viewerId, signedIn: true, blocked: outbound || inbound, following, muted }
}

async function governedImage(payload: Payload, value: unknown): Promise<string | undefined> {
  const id = relationId(value)
  if (!id) return undefined
  const media = await publicMedia(payload, id)
  // DAM records intentionally do not carry a public URL or storage key. A
  // successful governance decision authorizes only the scoped byte route.
  return media ? `/media/${encodeURIComponent(relationId(media.id) || id)}` : undefined
}

export async function findProfile(
  payload: Payload,
  handle: string,
): Promise<{ profile: Doc; redirected: boolean }> {
  const canonical = handle.trim().toLowerCase()
  // Historical community handles may contain underscores; new member edits
  // still use the stricter COMM-01 canonicalizer.
  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(canonical))
    throw new ProfileAccessError(404, 'Profile unavailable.')
  const found = await payload.find({
    collection: 'profiles',
    where: { handle: { equals: canonical } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (found.docs[0]) return { profile: found.docs[0] as unknown as Doc, redirected: false }
  const pool = (
    payload.db as {
      pool?: {
        query: (query: string, params: unknown[]) => Promise<{ rows: Array<{ id: string }> }>
      }
    }
  ).pool
  const old = await pool?.query(
    'SELECT id FROM profiles WHERE handle_history @> $1::jsonb LIMIT 1',
    [JSON.stringify([{ handle: canonical }])],
  )
  if (!old?.rows[0]) throw new ProfileAccessError(404, 'Profile unavailable.')
  const profile = await payload.findByID({
    collection: 'profiles',
    id: old.rows[0].id,
    depth: 0,
    overrideAccess: true,
  } as never)
  return { profile: profile as unknown as Doc, redirected: true }
}

export async function loadProfileProjection(
  payload: Payload,
  handle: string,
  siteId: string,
  viewerId?: string,
) {
  const { profile, redirected } = await findProfile(payload, handle)
  const ownerId = relationId(profile.member)
  const member = (await payload.findByID({
    collection: 'members',
    id: ownerId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  if (member.status !== 'active' && member.status !== 'restricted')
    throw new ProfileAccessError(404, 'Profile unavailable.')
  const viewer = await relationshipView(payload, siteId, viewerId, ownerId)
  const [avatarUrl, coverUrl] = await Promise.all([
    governedImage(payload, profile.avatar),
    governedImage(payload, profile.cover),
  ])
  return { profile: projectMemberProfile(profile, viewer, { avatarUrl, coverUrl }), redirected }
}

export async function setMemberRelation(
  payload: Payload,
  input: {
    siteId: string
    subjectId: string
    targetId: string
    kind: 'follow' | 'block' | 'mute'
    active: boolean
  },
) {
  if (input.subjectId === input.targetId)
    throw new ProfileAccessError(400, 'Choose another member.')
  const target = (await payload
    .findByID({
      collection: 'members',
      id: input.targetId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)) as Doc | null
  if (input.active && (!target || target.status !== 'active'))
    throw new ProfileAccessError(404, 'Member unavailable.')
  if (
    input.kind === 'follow' &&
    input.active &&
    (await relationshipView(payload, input.siteId, input.subjectId, input.targetId).then(
      (viewer) => viewer.blocked,
    ))
  )
    throw new ProfileAccessError(404, 'Member unavailable.')
  const pairKey = `${input.kind}:${input.siteId}:${input.subjectId}:${input.targetId}`
  const found = await payload.find({
    collection: 'relationships',
    where: {
      and: [
        { site: { equals: input.siteId } },
        { pairKey: { in: [pairKey, `${input.kind}:${input.subjectId}:${input.targetId}`] } },
      ],
    },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (found.docs.length) {
    await Promise.all(
      found.docs.map((doc) =>
        payload.update({
          collection: 'relationships',
          id: doc.id,
          data: {
            status: input.active ? 'active' : 'archived',
            endedAt: input.active ? null : new Date().toISOString(),
          },
          overrideAccess: true,
        } as never),
      ),
    )
  } else if (input.active) {
    await payload.create({
      collection: 'relationships',
      data: {
        site: input.siteId,
        subject: input.subjectId,
        object: { relationTo: 'members', value: input.targetId },
        kind: input.kind,
        status: 'active',
        visibility: 'private',
        pairKey,
      },
      overrideAccess: true,
    } as never)
  }
  if (input.kind === 'block' && input.active)
    await Promise.all([
      setMemberRelation(payload, { ...input, kind: 'follow', active: false }),
      setMemberRelation(payload, {
        ...input,
        subjectId: input.targetId,
        targetId: input.subjectId,
        kind: 'follow',
        active: false,
      }),
    ])
}
