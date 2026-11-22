import type { Payload } from 'payload'
import { assertMemberCanPost } from '../community/moderation-actions'
import { creatorCapabilities, creatorQuotaKeys } from './policy-values'

export type CreatorCapability = (typeof creatorCapabilities)[number]

export type CreatorQuota = Partial<Record<(typeof creatorQuotaKeys)[number], number>>

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const id = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String(value.id)
    : String(value ?? '')

/** Invalid or missing limits remain absent, never implicitly unlimited. */
export function creatorQuota(policy: unknown, override: unknown): CreatorQuota {
  const base = object(policy)
  const member = object(override)
  const result: CreatorQuota = {}
  for (const key of creatorQuotaKeys) {
    const value = Object.hasOwn(member, key) ? member[key] : base[key]
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) result[key] = value
  }
  return result
}

/** Re-read all authority on each operation; never treat a session as a grant. */
export async function authorizeCreator(
  payload: Payload,
  input: { siteId: string; memberId: string; capability: CreatorCapability; spaceId?: string },
): Promise<{ quota: CreatorQuota }> {
  if (!creatorCapabilities.includes(input.capability)) throw new Error('Creator access denied.')
  const [site, member, roles] = await Promise.all([
    payload.findByID({ collection: 'sites', id: input.siteId, depth: 0, overrideAccess: true }),
    payload.findByID({ collection: 'members', id: input.memberId, depth: 0, overrideAccess: true }),
    payload.find({
      collection: 'member-site-roles',
      where: { and: [{ site: { equals: input.siteId } }, { member: { equals: input.memberId } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  const policy = object((site as unknown as Record<string, unknown>).creatorPolicy)
  const role = roles.docs[0] as unknown as Record<string, unknown> | undefined
  const grants = role?.creatorCapabilities
  if (
    site.lifecycle !== 'active' ||
    member.status !== 'active' ||
    policy.enabled !== true ||
    !role ||
    !Array.isArray(grants) ||
    !grants.includes(input.capability)
  ) {
    throw new Error('Creator access denied.')
  }
  if (input.spaceId) {
    const space = await payload.findByID({
      collection: 'spaces',
      id: input.spaceId,
      depth: 0,
      overrideAccess: true,
    })
    const record = space as unknown as Record<string, unknown>
    if (
      id(record.site) !== input.siteId ||
      record.moderationState !== 'clear' ||
      record.suspendedAt
    )
      throw new Error('Creator access denied.')
    const profile = await payload.findByID({
      collection: 'profiles',
      id: id(record.profile),
      depth: 0,
      overrideAccess: true,
    })
    if (id(profile.member) !== input.memberId) throw new Error('Creator access denied.')
  }
  await assertMemberCanPost(payload, input)
  return { quota: creatorQuota(policy.quotas, role.creatorQuotaOverride) }
}
