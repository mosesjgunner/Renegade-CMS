import { createHash, randomUUID } from 'node:crypto'
import { createLocalReq, type Payload, type Where } from 'payload'
import type { ExternalVideoSource, YoutubeChannelClaim } from '@/payload-types'
import { transactionPayload } from '../core/transaction-payload'
import { canRenderPublic } from '../public/contracts'
import { MediaWorkflowError } from '../media/workflow'
import { withExecutionLock } from '../operations/execution-lock'
import { decryptSecret, encryptSecret } from '../social/security'
import { authorizeCreator } from './policy'
import { creatorDraftBody } from './workspace'
import { relationId, uuid, type SubmissionActor } from './submission-targets'
import {
  isManualProvider,
  manualVideo,
  youtubeVideoId,
  type ExternalProvider,
  type ManualProvider,
  type VideoSnapshot,
} from './video-providers'
import {
  YouTubeError,
  YouTubeMetadata,
  youtubeConfiguration,
  type YouTubeConfig,
} from './youtube-metadata'

const access = { overrideAccess: true, depth: 0 } as const
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const actorLock = (actor: SubmissionActor) => `external-video:${actor.siteId}:${actor.memberId}`
const contentUnavailable = () => new MediaWorkflowError('External video unavailable.', 404)
const defaultYouTubeTitle = 'YouTube video'
const authorizationCheckMs = 7 * 24 * 60 * 60 * 1000
const retentionMs = 28 * 24 * 60 * 60 * 1000
const ownWhere = (actor: SubmissionActor): Where[] => [
  { site: { equals: actor.siteId } },
  { owner: { equals: actor.memberId } },
]

export async function withExternalVideoTransaction<T>(
  payload: Payload,
  operation: (tx: Payload) => Promise<T>,
) {
  const req = await createLocalReq({}, payload)
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('External video writes require a database transaction.')
  req.transactionID = transactionID
  try {
    const result = await operation(transactionPayload(payload, req))
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

async function requireProvider(payload: Payload, actor: SubmissionActor) {
  await authorizeCreator(payload, { ...actor, capability: 'provider.connect' }).catch(() => {
    throw new MediaWorkflowError('External provider access denied.', 403)
  })
}

async function claimFor(payload: Payload, actor: SubmissionActor) {
  const result = await payload.find({
    collection: 'youtube-channel-claims',
    ...access,
    limit: 1,
    where: { and: ownWhere(actor) },
  })
  return result.docs[0]
}

function settings() {
  const config = youtubeConfiguration()
  if (!config)
    throw new MediaWorkflowError('YouTube OAuth is unavailable on this installation.', 503)
  return config
}

function openCredential(claim: YoutubeChannelClaim, config: YouTubeConfig) {
  const credential = JSON.parse(decryptSecret(claim.credential ?? '', config.key)) as {
    channelId: string
    refreshToken: string
  }
  if (claim.claim !== digest(`${relationId(claim.site)}:${credential.channelId}`))
    throw new YouTubeError('claim')
  return credential
}

export async function connectYouTube(
  payload: Payload,
  actor: SubmissionActor,
  code: string,
  verifier: string,
) {
  const config = settings()
  return withExecutionLock(payload, actorLock(actor), async () => {
    await requireProvider(payload, actor)
    const current = await claimFor(payload, actor)
    if (current?.credential)
      throw new MediaWorkflowError('Disconnect the current YouTube authorization first.', 409)
    const client = new YouTubeMetadata(config)
    const grant = await client.exchange(code, verifier)
    const channel = await client.channel(grant)
    if (!grant.refreshToken) throw new YouTubeError('scope')
    const claim = digest(`${actor.siteId}:${channel.id}`)
    const credential = encryptSecret(
      JSON.stringify({
        channelId: channel.id,
        refreshToken: grant.refreshToken,
      }),
      config.key,
    )
    await requireProvider(payload, actor)
    try {
      if (current) {
        await payload.update({
          collection: 'youtube-channel-claims',
          id: current.id,
          data: { claim, credential },
          ...access,
        })
      } else {
        await payload.create({
          collection: 'youtube-channel-claims',
          ...access,
          data: { site: actor.siteId, owner: actor.memberId, claim, credential },
        })
      }
    } catch {
      throw new MediaWorkflowError('This YouTube channel cannot be claimed on this site.', 409)
    }
  })
}

async function purgeYouTube(payload: Payload, actor: SubmissionActor, claim: YoutubeChannelClaim) {
  await withExternalVideoTransaction(payload, async (tx) => {
    await tx.update({
      collection: 'youtube-channel-claims',
      id: claim.id,
      ...access,
      data: { credential: null },
    })
    const sources = await tx.update({
      collection: 'external-video-sources',
      ...access,
      where: { and: [...ownWhere(actor), { provider: { equals: 'youtube' } }] },
      data: { snapshot: null, expiresAt: null, availability: 'disconnected' },
    })
    if (sources.errors.length) throw new Error('Could not purge the YouTube connection.')
  })
}

export async function disconnectYouTube(payload: Payload, actor: SubmissionActor) {
  // Signed-in owners can revoke even after their Creator Studio grant is removed.
  return withExecutionLock(payload, actorLock(actor), async () => {
    const claim = await claimFor(payload, actor)
    if (!claim?.credential) return { disconnected: true, providerRevoked: null }
    await purgeYouTube(payload, actor, claim)
    try {
      const config = settings()
      await new YouTubeMetadata(config).revoke(openCredential(claim, config).refreshToken)
      return { disconnected: true, providerRevoked: true }
    } catch {
      return { disconnected: true, providerRevoked: false }
    }
  })
}

async function withYouTubeAuthorization<T>(
  payload: Payload,
  actor: SubmissionActor,
  operation: (
    client: YouTubeMetadata,
    grant: Awaited<ReturnType<YouTubeMetadata['refresh']>>,
    channel: Awaited<ReturnType<YouTubeMetadata['channel']>>,
  ) => Promise<T>,
) {
  return withExecutionLock(payload, actorLock(actor), async () => {
    await requireProvider(payload, actor)
    const config = settings()
    const claim = await claimFor(payload, actor)
    if (!claim?.credential) throw new MediaWorkflowError('Connect your YouTube channel first.', 409)
    try {
      const credential = openCredential(claim, config)
      const client = new YouTubeMetadata(config)
      const grant = await client.refresh(credential.refreshToken)
      const channel = await client
        .channel(grant, credential.channelId)
        .catch(async (error: unknown) => {
          if (error instanceof YouTubeError && error.kind === 'claim')
            await purgeYouTube(payload, actor, claim)
          throw error
        })
      return await operation(client, grant, channel)
    } catch (error) {
      if (error instanceof YouTubeError && (error.kind === 'revoked' || error.kind === 'scope'))
        await purgeYouTube(payload, actor, claim)
      throw error
    }
  })
}

function ownedContent(source: ExternalVideoSource, actor: SubmissionActor, payload: Payload) {
  if (relationId(source.site) !== actor.siteId || relationId(source.owner) !== actor.memberId)
    throw contentUnavailable()
  return payload
    .findByID({ collection: 'content', id: relationId(source.content), ...access })
    .then((content) => {
      if (
        relationId(content.site) !== actor.siteId ||
        relationId(content.owner) !== actor.memberId ||
        content.contentType !== 'video'
      )
        throw contentUnavailable()
      return content
    })
}

const currentSnapshot = (source: ExternalVideoSource) =>
  source.provider !== 'youtube' || (source.expiresAt && Date.parse(source.expiresAt) > Date.now())
    ? (source.snapshot as unknown as VideoSnapshot | null)
    : null

function project(source: ExternalVideoSource, content: Awaited<ReturnType<typeof ownedContent>>) {
  let snapshot = currentSnapshot(source)
  if (snapshot?.url && isManualProvider(source.provider)) {
    try {
      manualVideo(source.provider, snapshot.url)
    } catch {
      snapshot = null
    }
  }
  return {
    id: source.id,
    contentId: content.id,
    path: content.canonicalPath,
    title: content.title,
    displayTitle:
      content.title === defaultYouTubeTitle && snapshot?.title ? snapshot.title : content.title,
    status: content.status,
    provider: source.provider,
    availability:
      source.provider === 'youtube' && source.snapshot && !snapshot ? 'stale' : source.availability,
    snapshot,
  }
}

async function saveSource(
  payload: Payload,
  actor: SubmissionActor,
  provider: ExternalProvider,
  snapshot: VideoSnapshot,
  spaceId: string,
  title?: string,
) {
  const identity = digest(`${provider}:${snapshot.scopeId}:${snapshot.externalId}`)
  return withExternalVideoTransaction(payload, async (tx) => {
    const {
      docs: [source],
    } = await tx.find({
      collection: 'external-video-sources',
      ...access,
      limit: 1,
      where: { and: [{ site: { equals: actor.siteId } }, { identity: { equals: identity } }] },
    })
    const data = {
      snapshot: { ...snapshot },
      availability: snapshot.availability,
      expiresAt: provider === 'youtube' ? new Date(Date.now() + retentionMs).toISOString() : null,
    }
    if (source) {
      const content = await ownedContent(source, actor, tx)
      const updated = await tx.update({
        collection: 'external-video-sources',
        id: source.id,
        ...access,
        data,
      })
      return project(updated, content)
    }
    if (snapshot.availability === 'removed') throw contentUnavailable()
    await authorizeCreator(tx, { ...actor, spaceId, capability: 'content.draft-own' }).catch(() => {
      throw new MediaWorkflowError('An owned Space with draft access is required.', 403)
    })
    const slug = `creator-${randomUUID()}`
    const content = await tx.create({
      collection: 'content',
      ...access,
      data: {
        site: actor.siteId,
        owner: actor.memberId,
        space: spaceId,
        contentType: 'video',
        title: title || (provider === 'youtube' ? defaultYouTubeTitle : 'External video'),
        slug,
        canonicalPath: `/external-videos/${slug}`,
        status: 'draft',
        visibility: 'private',
        body: creatorDraftBody(''),
        commentsPolicy: 'open',
        publicChangeHistoryPolicy: 'summary',
        structuredDataMode: 'none',
        knowledgeGraphProjectionStatus: 'disabled',
        retentionMode: 'permanent',
        retentionHold: 'none',
      },
    })
    const created = await tx.create({
      collection: 'external-video-sources',
      ...access,
      data: {
        ...data,
        content: content.id,
        provider,
        identity,
        site: actor.siteId,
        owner: actor.memberId,
      },
    })
    return project(created, content)
  })
}

export const youtubeCatalog = (payload: Payload, actor: SubmissionActor, cursor?: string) =>
  withYouTubeAuthorization(payload, actor, (client, grant, channel) =>
    client.catalog(grant, channel, cursor),
  )

export async function importYouTube(
  payload: Payload,
  actor: SubmissionActor,
  input: { externalId: string; spaceId: string; title?: string },
) {
  return withYouTubeAuthorization(payload, actor, async (client, grant, channel) => {
    const [snapshot] = await client.videos(grant, channel.id, [input.externalId])
    await requireProvider(payload, actor)
    return saveSource(payload, actor, 'youtube', snapshot, input.spaceId, input.title)
  })
}

export async function syncYouTube(payload: Payload, actor: SubmissionActor, sourceId: string) {
  await sourceById(payload, actor, sourceId)
  return withYouTubeAuthorization(payload, actor, async (client, grant, channel) => {
    const source = await sourceById(payload, actor, sourceId)
    const snapshot = source.snapshot as unknown as VideoSnapshot | null
    if (source.provider !== 'youtube' || !snapshot || snapshot.scopeId !== channel.id)
      throw contentUnavailable()
    const [fresh] = await client.videos(grant, channel.id, [snapshot.externalId])
    await requireProvider(payload, actor)
    const content = await ownedContent(source, actor, payload)
    return saveSource(payload, actor, 'youtube', fresh, relationId(content.space))
  })
}

async function sourceById(payload: Payload, actor: SubmissionActor, id: string) {
  if (!uuid.test(id)) throw contentUnavailable()
  const source = await payload.findByID({
    collection: 'external-video-sources',
    id,
    ...access,
    disableErrors: true,
  })
  if (!source) throw contentUnavailable()
  await ownedContent(source, actor, payload)
  return source
}

export async function addManualVideo(
  payload: Payload,
  actor: SubmissionActor,
  input: { provider: ManualProvider; url: string; spaceId: string; title: string },
) {
  return withExecutionLock(payload, actorLock(actor), async () => {
    await requireProvider(payload, actor)
    let snapshot: VideoSnapshot
    try {
      snapshot = manualVideo(input.provider, input.url)
    } catch {
      throw new MediaWorkflowError('Use a supported HTTPS video URL from an approved origin.', 400)
    }
    return saveSource(payload, actor, input.provider, snapshot, input.spaceId, input.title)
  })
}

export async function detachVideo(payload: Payload, actor: SubmissionActor, id: string) {
  return withExecutionLock(payload, actorLock(actor), async () => {
    const source = await sourceById(payload, actor, id)
    await payload.update({
      collection: 'external-video-sources',
      id: source.id,
      ...access,
      data: { snapshot: null, expiresAt: null, availability: 'detached' },
    })
  })
}

export async function listExternalVideos(payload: Payload, actor: SubmissionActor) {
  const claim = await claimFor(payload, actor)
  const canManage = await requireProvider(payload, actor).then(
    () => true,
    () => false,
  )
  const connection = {
    configured: Boolean(youtubeConfiguration()),
    connected: Boolean(claim?.credential),
    canManage,
  }
  if (!canManage) return { ...connection, items: [] }
  const result = await payload.find({
    collection: 'external-video-sources',
    ...access,
    limit: 100,
    sort: '-updatedAt',
    where: { and: ownWhere(actor) },
  })
  const items = await Promise.all(
    result.docs.map(async (source) => {
      try {
        return project(source, await ownedContent(source, actor, payload))
      } catch {
        return null
      }
    }),
  )
  return { ...connection, items: items.filter((item) => item !== null) }
}

export async function purgeExpiredVideoSnapshots(payload: Payload) {
  const now = new Date().toISOString()
  const { docs } = await payload.find({
    collection: 'external-video-sources',
    ...access,
    limit: 100,
    where: { and: [{ expiresAt: { less_than_equal: now } }, { provider: { equals: 'youtube' } }] },
  })
  for (const source of docs) {
    const actor = { siteId: relationId(source.site), memberId: relationId(source.owner) }
    await withExecutionLock(payload, actorLock(actor), async () => {
      const result = await payload.update({
        collection: 'external-video-sources',
        ...access,
        where: { and: [{ id: { equals: source.id } }, { expiresAt: { less_than_equal: now } }] },
        data: { availability: 'stale', snapshot: null, expiresAt: null },
      })
      if (result.errors.length) throw new Error('Could not expire YouTube metadata.')
    })
  }
}

export async function recheckYouTubeAuthorizations(payload: Payload) {
  const config = youtubeConfiguration()
  if (!config) return
  const cutoff = Date.now() - authorizationCheckMs
  const { docs } = await payload.find({
    collection: 'youtube-channel-claims',
    ...access,
    limit: 4,
    sort: 'updatedAt',
    where: {
      and: [
        { updatedAt: { less_than_equal: new Date(cutoff).toISOString() } },
        { credential: { exists: true } },
      ],
    },
  })
  for (const candidate of docs) {
    const actor = { siteId: relationId(candidate.site), memberId: relationId(candidate.owner) }
    await withExecutionLock(payload, actorLock(actor), async () => {
      const claim = await claimFor(payload, actor)
      if (!claim?.credential || Date.parse(claim.updatedAt) > cutoff) return
      try {
        await new YouTubeMetadata(config).refresh(openCredential(claim, config).refreshToken)
      } catch (error) {
        if (error instanceof YouTubeError && (error.kind === 'revoked' || error.kind === 'scope'))
          await purgeYouTube(payload, actor, claim)
        return
      }
      await payload.update({
        collection: 'youtube-channel-claims',
        ...access,
        id: claim.id,
        data: { credential: claim.credential },
      })
    })
  }
}

export async function publicExternalVideo(payload: Payload, siteId: string, contentId: string) {
  if (!payload.collections['external-video-sources']) return null
  const result = await payload.find({
    collection: 'external-video-sources',
    ...access,
    limit: 1,
    where: { and: [{ content: { equals: contentId } }, { site: { equals: siteId } }] },
  })
  const source = result.docs[0]
  if (!source) return null
  const content = await payload.findByID({
    collection: 'content',
    id: contentId,
    ...access,
    disableErrors: true,
  })
  if (
    !content ||
    content.contentType !== 'video' ||
    content.visibility !== 'public' ||
    content.requiredEntitlement ||
    relationId(content.site) !== siteId ||
    relationId(content.owner) !== relationId(source.owner) ||
    !canRenderPublic({ ...content, removeFromDiscovery: content.removeFromDiscovery ?? undefined })
  )
    return null
  const snapshot = currentSnapshot(source)
  if (!snapshot?.url) return { available: false } as const
  if (source.provider === 'youtube') {
    if (
      snapshot.availability !== 'available' ||
      snapshot.privacy !== 'public' ||
      !youtubeVideoId.test(snapshot.externalId)
    )
      return { available: false } as const
    return {
      available: true,
      provider: 'youtube',
      url: `https://www.youtube-nocookie.com/embed/${snapshot.externalId}`,
      title:
        content.title === defaultYouTubeTitle ? snapshot.title || content.title : content.title,
    } as const
  }
  if (snapshot.availability === 'unverified' && isManualProvider(source.provider)) {
    try {
      const { url } = manualVideo(source.provider, snapshot.url)
      if (url)
        return { available: true, provider: source.provider, url, title: content.title } as const
    } catch {
      // An operator can withdraw an origin after the source was saved.
    }
  }
  return { available: false } as const
}
