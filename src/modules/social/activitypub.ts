import { createHash, verify } from 'node:crypto'

export const ACTIVITYSTREAMS = 'https://www.w3.org/ns/activitystreams'
export const SECURITY = 'https://w3id.org/security/v1'
export const MAX_ACTIVITYPUB_BYTES = 256 * 1024
export const SUPPORTED_INBOX_TYPES = ['Follow', 'Undo', 'Create', 'Delete'] as const

export type PublicationActor = {
  id: string
  handle: string
  name: string
  summary?: string | null
  inbox: string
  outbox: string
  followers: string
  following: string
  publicKeyPem: string
}
export function actorDocument(actor: PublicationActor) {
  return {
    '@context': [ACTIVITYSTREAMS, SECURITY],
    id: actor.id,
    type: 'Service',
    preferredUsername: actor.handle,
    name: actor.name,
    summary: actor.summary ?? '',
    inbox: actor.inbox,
    outbox: actor.outbox,
    followers: actor.followers,
    following: actor.following,
    publicKey: { id: `${actor.id}#main-key`, owner: actor.id, publicKeyPem: actor.publicKeyPem },
  }
}
export function webfinger(subject: string, actorId: string) {
  return { subject, links: [{ rel: 'self', type: 'application/activity+json', href: actorId }] }
}
export function activityForContent(input: {
  actor: string
  canonicalUrl: string
  title: string
  summary?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  action: 'Create' | 'Update' | 'Delete' | 'Announce'
}) {
  const object =
    input.action === 'Delete'
      ? {
          id: input.canonicalUrl,
          type: 'Tombstone',
          formerType: 'Article',
          deleted: input.updatedAt ?? new Date().toISOString(),
        }
      : {
          id: input.canonicalUrl,
          type: 'Article',
          url: input.canonicalUrl,
          name: input.title,
          summary: input.summary ?? '',
          published: input.publishedAt ?? undefined,
          updated: input.updatedAt ?? undefined,
          attributedTo: input.actor,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
        }
  return {
    '@context': ACTIVITYSTREAMS,
    id: `${input.canonicalUrl}#activity-${input.action.toLowerCase()}-${createHash('sha256').update(JSON.stringify(object)).digest('hex').slice(0, 16)}`,
    type: input.action,
    actor: input.actor,
    object,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
  }
}
export function relationshipActivity(input: {
  type: 'Follow' | 'Accept' | 'Reject' | 'Undo' | 'Announce'
  id: string
  actor: string
  object: unknown
}) {
  return {
    '@context': ACTIVITYSTREAMS,
    id: input.id,
    type: input.type,
    actor: input.actor,
    object: input.object,
  }
}
export function boundedActivity(raw: string) {
  if (Buffer.byteLength(raw) > MAX_ACTIVITYPUB_BYTES)
    throw new Error('ActivityPub payload exceeds the size limit.')
  const activity = JSON.parse(raw) as {
    id?: string
    type?: string
    actor?: string
    object?: unknown
  }
  if (
    !activity.id ||
    !activity.type ||
    !activity.actor ||
    !SUPPORTED_INBOX_TYPES.includes(activity.type as never)
  )
    throw new Error('Unsupported or malformed federation activity.')
  return activity
}
export async function readBoundedActivityBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_ACTIVITYPUB_BYTES)
    throw new Error('ActivityPub payload exceeds the size limit.')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('ActivityPub request body is required.')
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_ACTIVITYPUB_BYTES) {
      await reader.cancel()
      throw new Error('ActivityPub payload exceeds the size limit.')
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
export function replayKey(activity: { id?: string; actor?: string }) {
  return `activitypub:${createHash('sha256').update(`${activity.actor}|${activity.id}`).digest('hex')}`
}
/** Verifies an HTTP Signature after the actor key has been resolved via safeFetch. */
export function verifyHttpSignature(input: {
  signingString: string
  signature: string
  publicKeyPem: string
  algorithm?: string
}) {
  return verify(
    input.algorithm === 'rsa-sha256' ? 'RSA-SHA256' : 'sha256',
    Buffer.from(input.signingString),
    input.publicKeyPem,
    Buffer.from(input.signature, 'base64'),
  )
}

/** RFC 9421 deployments vary, but the legacy Signature header remains the
 * interoperable baseline used by the major ActivityPub servers. */
export function parseHttpSignature(value: string | null) {
  if (!value) throw new Error('A signed federation request is required.')
  const fields = Object.fromEntries(
    [...value.matchAll(/([a-zA-Z]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  )
  if (!fields.keyId || !fields.signature || !fields.headers)
    throw new Error('Federation signature is malformed.')
  return {
    keyId: fields.keyId,
    signature: fields.signature,
    algorithm: fields.algorithm ?? 'rsa-sha256',
    headers: fields.headers.toLowerCase().split(/\s+/),
  }
}

export function signingStringForRequest(request: Request, headers: readonly string[]) {
  const url = new URL(request.url)
  return headers
    .map((header) => {
      if (header === '(request-target)')
        return `(request-target): ${request.method.toLowerCase()} ${url.pathname}${url.search}`
      const value = request.headers.get(header)
      if (!value) throw new Error(`Signed header ${header} is missing.`)
      return `${header}: ${value}`
    })
    .join('\n')
}

export function digestForBody(body: string) {
  return `SHA-256=${createHash('sha256').update(body).digest('base64')}`
}
export function remoteReply(input: {
  activityId: string
  actor: string
  content: string
  inReplyTo: string
  discussionId: string
}) {
  return {
    discussion: input.discussionId,
    body: input.content.slice(0, 20_000),
    permalink: `federation:${createHash('sha256').update(input.activityId).digest('hex')}`,
    paginationAnchor: `federation:${input.activityId}`,
    status: 'hidden' as const,
    visibility: 'public' as const,
    moderationState: 'pending' as const,
    federation: { actor: input.actor, activityId: input.activityId, inReplyTo: input.inReplyTo },
  }
}
