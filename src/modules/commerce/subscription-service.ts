import {
  grantsFromSubscription,
  subscriptionGrantsAccess,
  type EntitlementGrant,
  type Subscription,
} from './subscription-contract'

type PayloadLike = {
  find(input: any): Promise<any>
  create(input: any): Promise<any>
  update(input: any): Promise<any>
}
const rel = (value: any) => String(typeof value === 'object' && value ? value.id : (value ?? ''))

export async function queueBillingSystemNotice(
  payload: PayloadLike,
  input: {
    siteId: string
    memberId: string
    subscriptionId: string
    noticeKey: string
    kind: string
    message: string
  },
) {
  if (!input.memberId) return
  const prior = await payload.find({
    collection: 'activity-events',
    where: {
      and: [
        { site: { equals: input.siteId } },
        { type: { equals: input.kind } },
        { 'object.noticeKey': { equals: input.noticeKey } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const activity =
    prior.docs[0] ??
    (await payload.create({
      collection: 'activity-events',
      data: {
        site: input.siteId,
        type: input.kind,
        actor: { system: true },
        object: {
          noticeKey: input.noticeKey,
          subscriptionId: input.subscriptionId,
          title: 'Subscription billing',
          message: input.message,
          href: '/members/settings?tab=billing',
        },
        occurredAt: new Date().toISOString(),
      },
      overrideAccess: true,
    }))
  const notification = await payload.find({
    collection: 'notifications',
    where: {
      and: [
        { activityEvent: { equals: activity.id } },
        { recipientMember: { equals: input.memberId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (!notification.docs.length)
    await payload.create({
      collection: 'notifications',
      data: {
        activityEvent: activity.id,
        recipientMember: input.memberId,
        status: 'unread',
        channels: ['in-app'],
      },
      overrideAccess: true,
    })
}

/** Upserts stable grant keys and revokes stale subscription grants. Replaying this is safe. */
export async function recomputeSubscriptionEntitlements(
  payload: PayloadLike,
  subscription: Subscription & { supporterId?: string },
): Promise<{ granted: number; revoked: number }> {
  const supporterId = subscription.supporterId ?? subscription.customerId
  if (!supporterId)
    throw new Error('A subscription needs a resolved supporter before it can grant access.')
  const grants: EntitlementGrant[] = subscriptionGrantsAccess(
    subscription,
    new Date().toISOString(),
  )
    ? grantsFromSubscription(subscription)
    : []
  const existing = await payload.find({
    collection: 'entitlements',
    where: {
      supporter: { equals: supporterId },
      source: { equals: `subscription:${subscription.id}` },
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const desired = new Set(grants.map((g) => g.id))
  let granted = 0,
    revoked = 0
  for (const grant of grants) {
    const prior = existing.docs.find((row: any) => row.grantKey === grant.id)
    const data = {
      supporter: supporterId,
      entitlement: `${grant.resource}.${grant.capability}`,
      source: `subscription:${subscription.id}`,
      startsAt: grant.startsAt,
      endsAt: grant.endsAt,
      revokedAt: null,
      resource: grant.resource,
      capability: grant.capability,
      site: subscription.siteId,
      scope: grant.scope,
      limit: grant.limit,
      grantKey: grant.id,
      evidence: grant.evidence,
    }
    if (prior)
      await payload.update({ collection: 'entitlements', id: prior.id, data, overrideAccess: true })
    else {
      try {
        await payload.create({ collection: 'entitlements', data, overrideAccess: true })
        granted++
      } catch (error) {
        // A concurrent replay may win the unique grantKey insert. Confirm it exists before treating this as success.
        const raced = await payload.find({
          collection: 'entitlements',
          where: { grantKey: { equals: grant.id } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (!raced.docs.length) throw error
      }
    }
  }
  for (const prior of existing.docs)
    if (!desired.has(String(prior.grantKey)) && !prior.revokedAt) {
      await payload.update({
        collection: 'entitlements',
        id: prior.id,
        data: { revokedAt: new Date().toISOString() },
        overrideAccess: true,
      })
      revoked++
    }
  return { granted, revoked }
}

/** One authorization seam for publication, community, and download capabilities. */
export async function hasEntitlement(
  payload: PayloadLike,
  input: {
    subjectId: string
    siteId: string
    resource: string
    capability: string
    scope?: string
    now?: string
  },
): Promise<boolean> {
  const now = input.now ?? new Date().toISOString()
  const member = await payload.find({
    collection: 'members',
    where: { id: { equals: input.subjectId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (!member.docs.length || member.docs[0].status !== 'active') return false
  const rows = await payload.find({
    collection: 'entitlements',
    where: {
      and: [
        { 'supporter.member': { equals: input.subjectId } },
        { site: { equals: input.siteId } },
        { resource: { equals: input.resource } },
        { capability: { equals: input.capability } },
        { startsAt: { less_than_equal: now } },
        { or: [{ endsAt: { exists: false } }, { endsAt: { greater_than: now } }] },
        { or: [{ revokedAt: { exists: false } }, { revokedAt: { equals: null } }] },
        ...(input.scope
          ? [{ scope: { equals: input.scope } }]
          : [{ or: [{ scope: { exists: false } }, { scope: { equals: null } }] }]),
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return rows.docs.length > 0
}
