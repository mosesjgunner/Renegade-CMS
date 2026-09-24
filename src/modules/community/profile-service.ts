import type { Payload } from 'payload'

import { canonicalizeHandle, changeMemberHandle } from '../identity/member-identity'
import { loadConfig } from '../core/config'
import { uploadMedia, MediaWorkflowError } from '../media/workflow'
import {
  normalizeFieldAudience,
  normalizeProfileLinks,
  ProfileAccessError,
  projectMemberProfile,
  relationId,
} from './profile-projection'

type Doc = Record<string, unknown>

const profileImageFields = ['avatar', 'cover'] as const
type ProfileImageField = (typeof profileImageFields)[number]

function profilePreferences(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeRelationshipNotifications(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ProfileAccessError(400, 'Invalid relationship notification preferences.')
  const source = value as Record<string, unknown>
  const keys = ['follows', 'messages', 'mentions'] as const
  if (Object.keys(source).some((key) => !keys.includes(key as (typeof keys)[number])))
    throw new ProfileAccessError(400, 'Invalid relationship notification preferences.')
  if (Object.values(source).some((enabled) => typeof enabled !== 'boolean'))
    throw new ProfileAccessError(400, 'Invalid relationship notification preferences.')
  return Object.fromEntries(keys.map((key) => [key, source[key] !== false]))
}

async function ownedProfileImage(
  payload: Payload,
  memberId: string,
  siteId: string,
  value: unknown,
) {
  if (value === null) return null
  if (typeof value !== 'string') throw new ProfileAccessError(400, 'Invalid profile image.')
  const asset = (await payload
    .findByID({
      collection: 'media-assets',
      id: value,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)) as unknown as Doc | null
  if (
    !asset ||
    relationId(asset.owner) !== memberId ||
    relationId(asset.site) !== siteId ||
    asset.kind !== 'image' ||
    asset.processingState !== 'ready' ||
    ['quarantined', 'failed'].includes(String(asset.processingState)) ||
    ['restricted', 'expired'].includes(String(asset.rightsStatus))
  )
    throw new ProfileAccessError(403, 'That image is not available for this profile.')
  return value
}

/** Upload through MediaAssets, then create an unapproved, profile-scoped usage. */
export async function uploadMemberProfileImage(
  payload: Payload,
  memberId: string,
  siteId: string,
  input: {
    field: ProfileImageField
    fileName: string
    bytes: Uint8Array
    altText?: string
    focalPoint?: { x: number; y: number }
  },
) {
  const profile = (
    await payload.find({
      collection: 'profiles',
      where: { member: { equals: memberId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as Doc | undefined
  if (!profile) throw new ProfileAccessError(404, 'Profile unavailable.')
  let asset: Doc
  try {
    // This deliberately enters the canonical DAM workflow. The route has already
    // authenticated the member; this narrow internal actor cannot be supplied by clients.
    asset = (await uploadMedia(payload, loadConfig(), {
      user: { role: 'owner', member: memberId },
      scope: { kind: 'site', siteId },
      title: `${String(profile.handle)} ${input.field}`,
      altText: input.altText,
      originalFilename: input.fileName,
      bytes: input.bytes,
      focalPoint: input.focalPoint,
    })) as unknown as Doc
  } catch (error) {
    if (error instanceof MediaWorkflowError)
      throw new ProfileAccessError(error.status, error.message)
    throw error
  }
  const usageKey = `profile:${String(profile.id)}:${input.field}:${String(asset.id)}`
  await payload.create({
    collection: 'media-usages',
    overrideAccess: true,
    data: {
      site: siteId,
      media: asset.id,
      usageKey,
      usedBy: { relationTo: 'profiles', value: profile.id },
      targetType: 'profile',
      targetId: String(profile.id),
      field: input.field,
      purpose: input.field === 'avatar' ? 'avatar' : 'cover',
      lifecycle: 'draft',
      approvedForPublic: false,
      replaceGlobally: false,
      lastReconciledAt: new Date().toISOString(),
    },
  } as never)
  await payload.update({
    collection: 'profiles',
    id: String(profile.id),
    overrideAccess: true,
    data: {
      [input.field]: asset.id,
      ...(input.altText !== undefined
        ? { [input.field === 'avatar' ? 'avatarAlt' : 'coverAlt']: input.altText.trim() }
        : {}),
    },
  } as never)
  await payload.create({
    collection: 'identity-audit-events',
    overrideAccess: true,
    data: {
      member: memberId,
      event: 'member.profile.image.uploaded',
      details: { field: input.field, assetId: asset.id, usageKey, approval: 'pending' },
    },
  } as never)
  return { assetId: String(asset.id), approval: 'pending' as const }
}

/** Only the owner may edit; all allowed fields are validated before persistence. */
export async function saveMemberProfile(
  payload: Payload,
  memberId: string,
  body: Doc,
  expectedHandle?: string,
  siteId?: string,
) {
  const found = await payload.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const profile = found.docs[0] as unknown as Doc | undefined
  if (!profile || (expectedHandle && profile.handle !== expectedHandle.toLowerCase()))
    throw new ProfileAccessError(404, 'Profile unavailable.')
  const data: Doc = {}
  if (body.displayName !== undefined) {
    if (
      typeof body.displayName !== 'string' ||
      !body.displayName.trim() ||
      body.displayName.length > 120
    )
      throw new ProfileAccessError(400, 'Display name is required (up to 120 characters).')
    data.displayName = body.displayName.trim()
  }
  if (body.bio !== undefined) {
    if (typeof body.bio !== 'string' || body.bio.length > 2000)
      throw new ProfileAccessError(400, 'Bio must be at most 2000 characters.')
    data.bio = body.bio
  }
  if (body.visibility !== undefined) {
    if (!['public', 'unlisted', 'members', 'private'].includes(String(body.visibility)))
      throw new ProfileAccessError(400, 'Invalid profile visibility.')
    data.visibility = body.visibility
  }
  if (body.fieldAudience !== undefined)
    data.fieldAudience = normalizeFieldAudience(body.fieldAudience)
  if (body.links !== undefined) data.links = normalizeProfileLinks(body.links)
  if (body.discoveryOptOut !== undefined) {
    if (typeof body.discoveryOptOut !== 'boolean')
      throw new ProfileAccessError(400, 'Invalid discovery preference.')
    data.discoveryOptOut = body.discoveryOptOut
  }
  for (const field of ['avatarAlt', 'coverAlt'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || body[field].length > 240)
        throw new ProfileAccessError(400, 'Image description is too long.')
      data[field] = body[field].trim()
    }
  }
  if (body.locale !== undefined) {
    if (body.locale === '') data.locale = null
    else if (typeof body.locale !== 'string' || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(body.locale))
      throw new ProfileAccessError(400, 'Invalid locale.')
    else data.locale = body.locale
  }
  if (body.timeZone !== undefined) {
    if (body.timeZone === '') data.timeZone = null
    else if (
      typeof body.timeZone !== 'string' ||
      !Intl.supportedValuesOf('timeZone').includes(body.timeZone)
    )
      throw new ProfileAccessError(400, 'Invalid time zone.')
    else data.timeZone = body.timeZone
  }
  if (body.relationshipNotifications !== undefined) {
    data.preferences = {
      ...profilePreferences(profile.preferences),
      relationshipNotifications: normalizeRelationshipNotifications(body.relationshipNotifications),
    }
  }
  for (const field of profileImageFields) {
    if (body[field] !== undefined) {
      if (!siteId)
        throw new ProfileAccessError(503, 'Profile image changes are temporarily unavailable.')
      data[field] = await ownedProfileImage(payload, memberId, siteId, body[field])
    }
  }
  if (body.handle !== undefined) {
    if (typeof body.handle !== 'string') throw new ProfileAccessError(400, 'Invalid handle.')
    const canonical = canonicalizeHandle(body.handle)
    if ('error' in canonical) throw new ProfileAccessError(400, canonical.error)
    const pool = (
      payload.db as {
        pool?: { query: (statement: string, values: unknown[]) => Promise<{ rows: unknown[] }> }
      }
    ).pool
    if (canonical.handle !== profile.handle) {
      if (!pool) throw new ProfileAccessError(503, 'Handle changes are temporarily unavailable.')
      const reserved = await pool.query(
        'SELECT id FROM profiles WHERE handle_history @> $1::jsonb AND id <> $2 LIMIT 1',
        [JSON.stringify([{ handle: canonical.handle }]), String(profile.id)],
      )
      if (reserved.rows.length)
        throw new ProfileAccessError(409, 'Handle is reserved by a previous owner.')
    }
    const changed = await changeMemberHandle(payload as never, memberId, body.handle)
    if (!changed.ok) throw new ProfileAccessError(409, changed.reason)
  }
  const updated = Object.keys(data).length
    ? ((await payload.update({
        collection: 'profiles',
        id: String(profile.id),
        data,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Doc)
    : body.handle !== undefined
      ? ((await payload.findByID({
          collection: 'profiles',
          id: String(profile.id),
          depth: 0,
          overrideAccess: true,
        } as never)) as unknown as Doc)
      : profile
  if (Object.keys(data).length)
    await payload.create({
      collection: 'identity-audit-events',
      data: {
        member: memberId,
        event: 'member.profile.updated',
        details: {
          fields: Object.keys(data),
          // A bounded before/after record supports owner history without copying
          // credentials, email, addresses, or raw media storage metadata.
          before: Object.fromEntries(Object.keys(data).map((field) => [field, profile[field]])),
          after: Object.fromEntries(Object.keys(data).map((field) => [field, updated[field]])),
        },
      },
      overrideAccess: true,
    } as never)
  return projectMemberProfile(
    { ...updated, member: relationId(profile.member) },
    { memberId, signedIn: true },
  )
}

export async function memberProfileHistory(payload: Payload, memberId: string) {
  const events = await payload.find({
    collection: 'identity-audit-events',
    where: {
      and: [
        { member: { equals: memberId } },
        { event: { in: ['member.profile.updated', 'member.profile.image.uploaded'] } },
      ],
    },
    limit: 100,
    sort: '-createdAt',
    depth: 0,
    overrideAccess: true,
  } as never)
  return events.docs.map((event) => {
    const auditEvent = event as unknown as {
      id: string
      event: string
      createdAt: string
      details?: unknown
    }
    return {
      id: auditEvent.id,
      event: auditEvent.event,
      at: auditEvent.createdAt,
      details: auditEvent.details,
    }
  })
}
