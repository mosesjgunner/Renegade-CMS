import type { Payload } from 'payload'
import { relationshipActivity } from '../social/activitypub'
import { queueActivityDelivery, resolveRemoteActor } from '../social/activitypub-runtime'
import {
  permitsRemoteSource,
  remoteObjectReference,
  takeNetworkQuota,
  type AccessDecision,
  type RemotePolicy,
} from './experience'

type PayloadLike = Payload
const id = (value: unknown) =>
  typeof value === 'object' && value && 'id' in value
    ? String((value as { id: unknown }).id)
    : String(value)

async function settings(payload: PayloadLike) {
  return (await payload.findGlobal({ slug: 'network-settings', overrideAccess: true })) as {
    remotePolicy?: RemotePolicy
  }
}
async function decisions(payload: PayloadLike) {
  return (
    await payload.find({
      collection: 'network-access-decisions',
      limit: 1000,
      overrideAccess: true,
    })
  ).docs as AccessDecision[]
}
export async function assertRemotePermitted(payload: PayloadLike, actorId: string) {
  if (
    !permitsRemoteSource(actorId, await decisions(payload), (await settings(payload)).remotePolicy)
  )
    throw new Error('Remote source is blocked by network policy.')
}
async function audit(
  payload: PayloadLike,
  action: string,
  subject: string,
  details: Record<string, unknown> = {},
) {
  return payload.create({
    collection: 'network-audit-events',
    data: { action, subject, details },
    overrideAccess: true,
  })
}

/** Discovery uses the remote actor document only; it does not create editable local content. */
export async function discoverRemoteActor(
  payload: PayloadLike,
  actorId: string,
  allowPrivateDevelopment = false,
) {
  if (!takeNetworkQuota('discoveryPerMinute', new URL(actorId).origin))
    throw new Error('Remote discovery is temporarily rate limited.')
  await assertRemotePermitted(payload, actorId)
  const actor = await resolveRemoteActor(payload, actorId, allowPrivateDevelopment)
  await audit(payload, 'remote_actor.discovered', actor.canonicalId)
  return actor
}

export async function followRemoteActor(input: {
  payload: PayloadLike
  localActor: string
  localSubjectId: string
  remoteActorId: string
  allowPrivateDevelopment?: boolean
}) {
  if (!takeNetworkQuota('followsPerHour', input.localSubjectId))
    throw new Error('Follow limit reached; try again later.')
  const remote = await discoverRemoteActor(
    input.payload,
    input.remoteActorId,
    input.allowPrivateDevelopment,
  )
  const key = `follow:${input.localSubjectId}:${remote.id}`
  const existing = await input.payload.find({
    collection: 'network-relationships',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  const relationship =
    existing.docs[0] ??
    (await input.payload.create({
      collection: 'network-relationships',
      data: {
        localSubjectType: 'activitypub-actor',
        localSubjectId: input.localSubjectId,
        remoteActor: remote.id,
        kind: 'follow',
        direction: 'outbound',
        state: 'pending',
        idempotencyKey: key,
      },
      overrideAccess: true,
    } as never))
  if (!existing.docs[0])
    await queueActivityDelivery(input.payload, {
      remoteActor: remote,
      envelope: relationshipActivity({
        type: 'Follow',
        id: `${input.localActor}#follow-${remote.id}`,
        actor: input.localActor,
        object: remote.canonicalId,
      }),
    })
  await audit(input.payload, 'relationship.follow_requested', remote.canonicalId, {
    localSubjectId: input.localSubjectId,
  })
  return relationship
}

export async function unfollowRemoteActor(input: {
  payload: PayloadLike
  localActor: string
  localSubjectId: string
  remoteActorId: string
}) {
  const relation = await input.payload.find({
    collection: 'network-relationships',
    where: {
      and: [
        { localSubjectId: { equals: input.localSubjectId } },
        { remoteActor: { equals: input.remoteActorId } },
        { kind: { equals: 'follow' } },
        { state: { in: ['pending', 'active'] } },
      ],
    },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const relationship = relation.docs[0]
  if (!relationship) return null
  await input.payload.update({
    collection: 'network-relationships',
    id: relationship.id,
    data: { state: 'ended', endedAt: new Date().toISOString() },
    overrideAccess: true,
  })
  const remote = relationship.remoteActor
  if (typeof remote === 'object' && remote)
    await queueActivityDelivery(input.payload, {
      remoteActor: remote,
      envelope: relationshipActivity({
        type: 'Undo',
        id: `${input.localActor}#undo-${relationship.id}`,
        actor: input.localActor,
        object: { type: 'Follow', actor: input.localActor, object: remote.canonicalId },
      }),
    })
  await audit(input.payload, 'relationship.unfollowed', id(remote), {
    localSubjectId: input.localSubjectId,
  })
  return relationship
}

export async function cacheRemoteObject(
  payload: PayloadLike,
  actor: { id: string; instance: unknown },
  document: Record<string, unknown>,
) {
  if (!takeNetworkQuota('fetchPerMinute', id(actor.instance)))
    throw new Error('Remote fetch is temporarily rate limited.')
  const reference = remoteObjectReference(document)
  const existing = await payload.find({
    collection: 'remote-objects',
    where: { canonicalId: { equals: reference.canonicalId } },
    limit: 1,
    overrideAccess: true,
  })
  const data = {
    instance: id(actor.instance),
    actor: actor.id,
    ...reference,
    lastFetchedAt: new Date().toISOString(),
  }
  return existing.docs[0]
    ? payload.update({
        collection: 'remote-objects',
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      } as never)
    : payload.create({ collection: 'remote-objects', data, overrideAccess: true } as never)
}

/** Blocking is human-directed, records a note/audit trail, and hides prior remote references by default. */
export async function blockRemoteSource(
  payload: PayloadLike,
  input: { subject: string; subjectType: 'actor' | 'instance'; note?: string },
) {
  const subject = input.subjectType === 'instance' ? new URL(input.subject).origin : input.subject
  const existing = await payload.find({
    collection: 'network-access-decisions',
    where: { subject: { equals: subject } },
    limit: 1,
    overrideAccess: true,
  })
  const data = {
    subject,
    subjectType: input.subjectType,
    decision: 'block' as const,
    reason: input.note,
    note: input.note,
  }
  const result = existing.docs[0]
    ? await payload.update({
        collection: 'network-access-decisions',
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      })
    : await payload.create({ collection: 'network-access-decisions', data, overrideAccess: true })
  const policy = (await settings(payload)).remotePolicy
  if (policy?.hideBlockedReferences !== false) {
    const source = await payload.find({
      collection: input.subjectType === 'actor' ? 'remote-actors' : 'remote-instances',
      where: { [input.subjectType === 'actor' ? 'canonicalId' : 'origin']: { equals: subject } },
      limit: 1,
      overrideAccess: true,
    })
    if (source.docs[0])
      await payload.update({
        collection: 'remote-objects',
        where: {
          [input.subjectType === 'actor' ? 'actor' : 'instance']: { equals: source.docs[0].id },
        },
        data: { visibility: 'hidden' },
        overrideAccess: true,
      })
  }
  await audit(payload, `moderation.${input.subjectType}_blocked`, subject, {
    note: input.note ?? '',
  })
  return result
}
