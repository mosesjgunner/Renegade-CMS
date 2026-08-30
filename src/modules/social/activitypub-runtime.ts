import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { fetchRemoteJson } from '../network/safe-fetch'
import { deliveryIdempotencyKey } from '../network/contracts'
import {
  permitsRemoteSource,
  remoteProfileMetadata,
  type RemotePolicy,
} from '../network/experience'
import {
  boundedActivity,
  digestForBody,
  parseHttpSignature,
  replayKey,
  signingStringForRequest,
  verifyHttpSignature,
} from './activitypub'

type PayloadLike = Payload
const objectId = (value: unknown) =>
  typeof value === 'object' && value && 'id' in value
    ? String((value as { id: unknown }).id)
    : String(value)

export async function resolveRemoteActor(
  payload: PayloadLike,
  actorId: string,
  allowPrivateDevelopment = false,
) {
  const canonicalId = new URL(actorId).toString()
  const [settings, access] = await Promise.all([
    payload.findGlobal({ slug: 'network-settings', overrideAccess: true }),
    payload.find({ collection: 'network-access-decisions', limit: 1000, overrideAccess: true }),
  ])
  if (
    !permitsRemoteSource(
      canonicalId,
      access.docs as never,
      settings.remotePolicy as RemotePolicy | undefined,
    )
  )
    throw new Error('Remote source is blocked by network policy.')
  const existing = await payload.find({
    collection: 'remote-actors',
    where: { canonicalId: { equals: canonicalId } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const actor = (await fetchRemoteJson(canonicalId, { allowPrivateDevelopment })) as {
    id?: string
    publicKey?: { id?: string; publicKeyPem?: string }
    preferredUsername?: string
    inbox?: string
  }
  if (!actor?.id || actor.id !== canonicalId || !actor?.publicKey?.publicKeyPem)
    throw new Error('Remote actor document is not usable.')
  const origin = new URL(canonicalId).origin
  const instance = await payload.find({
    collection: 'remote-instances',
    where: { origin: { equals: origin } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const instanceId =
    instance.docs[0]?.id ??
    (
      await payload.create({
        collection: 'remote-instances',
        data: { origin, status: 'active', lastSeenAt: new Date().toISOString() },
        overrideAccess: true,
      })
    ).id
  const data = {
    instance: instanceId,
    canonicalId,
    handle: actor.preferredUsername,
    profile: {
      ...remoteProfileMetadata(actor as Record<string, unknown>),
      inbox: actor.inbox,
      publicKey: actor.publicKey,
    },
    lastFetchedAt: new Date().toISOString(),
  }
  return existing.docs[0]
    ? await payload.update({
        collection: 'remote-actors',
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      })
    : await payload.create({ collection: 'remote-actors', data, overrideAccess: true })
}

export async function verifyInboundActivity(input: {
  request: Request
  body: string
  payload: PayloadLike
  allowPrivateDevelopment?: boolean
}) {
  const activity = boundedActivity(input.body)
  if (input.request.headers.get('digest') !== digestForBody(input.body))
    throw new Error('Federation digest does not match request body.')
  const signature = parseHttpSignature(input.request.headers.get('signature'))
  const remoteActor = await resolveRemoteActor(
    input.payload,
    activity.actor!,
    input.allowPrivateDevelopment,
  )
  const profile = remoteActor.profile as
    | { publicKey?: { id?: string; publicKeyPem?: string; algorithm?: 'rsa-sha256' } }
    | undefined
  const publicKey = profile?.publicKey
  if (
    !publicKey?.id ||
    publicKey.id !== signature.keyId ||
    !verifyHttpSignature({
      signingString: signingStringForRequest(input.request, signature.headers),
      signature: signature.signature,
      publicKeyPem: publicKey.publicKeyPem ?? '',
      algorithm: signature.algorithm,
    })
  )
    throw new Error('Federation signature is invalid.')
  return { activity, remoteActor, dedupeKey: replayKey(activity) }
}

export async function recordInbound(
  payload: PayloadLike,
  input: {
    activity: { id?: string }
    remoteActor: { id: string }
    dedupeKey: string
    envelope: unknown
  },
) {
  const duplicate = await payload.find({
    collection: 'inbound-network-activities',
    where: { dedupeKey: { equals: input.dedupeKey } },
    limit: 1,
    overrideAccess: true,
  })
  if (duplicate.docs[0]) return { duplicate: true, record: duplicate.docs[0] }
  try {
    const record = await payload.create({
      collection: 'inbound-network-activities',
      data: {
        protocol: 'activitypub',
        remoteActor: input.remoteActor.id,
        remoteActivityId: input.activity.id ?? '',
        dedupeKey: input.dedupeKey,
        receivedAt: new Date().toISOString(),
        status: 'accepted',
        envelope: input.envelope as Record<string, unknown>,
      },
      overrideAccess: true,
    })
    return { duplicate: false, record }
  } catch (error) {
    // The unique index is the final replay guard under concurrent requests.
    if (String(error).toLowerCase().includes('unique')) return { duplicate: true, record: null }
    throw error
  }
}

export async function findActor(payload: PayloadLike, handle: string) {
  const accounts = await payload.find({
    collection: 'social-accounts',
    where: {
      and: [
        { network: { equals: 'activitypub' } },
        { externalAccountId: { equals: handle } },
        { capabilityState: { in: ['available', 'limited'] } },
      ],
    },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  return accounts.docs[0] ?? null
}

export const activityDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
export { objectId }

/** Creates only durable work. Callers never POST to a remote inbox on a request path. */
export async function queueActivityDelivery(
  payload: PayloadLike,
  input: { remoteActor: { id?: string; profile?: unknown }; envelope: unknown },
) {
  const profile = input.remoteActor.profile as { inbox?: string } | null | undefined
  const target = profile?.inbox
  if (typeof target !== 'string') throw new Error('Remote actor has no inbox.')
  const origin = new URL(target).origin
  const instances = await payload.find({
    collection: 'remote-instances',
    where: { origin: { equals: origin } },
    limit: 1,
    overrideAccess: true,
  })
  const remoteInstance = instances.docs[0]
  if (!remoteInstance) throw new Error('Remote instance is not known.')
  const idempotencyKey = deliveryIdempotencyKey('activitypub', target, input.envelope)
  const existing = await payload.find({
    collection: 'outbound-network-deliveries',
    where: { idempotencyKey: { equals: idempotencyKey } },
    limit: 1,
    overrideAccess: true,
  })
  const delivery =
    existing.docs[0] ??
    (await payload.create({
      collection: 'outbound-network-deliveries',
      data: {
        protocol: 'activitypub',
        remoteInstance: remoteInstance.id,
        target,
        idempotencyKey,
        status: 'queued',
        envelope: input.envelope as Record<string, unknown>,
      },
      overrideAccess: true,
    }))
  if (!existing.docs[0])
    await payload.jobs.queue({
      task: 'network-delivery',
      input: { deliveryId: delivery.id },
      queue: 'operations',
    } as never)
  return delivery
}
