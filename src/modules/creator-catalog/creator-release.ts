import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'
import { loadConfig } from '../core/config'
import { deliveryGrantAvailable, deliverySigningSecret } from '../commerce/digital-delivery'
import { catalogOriginForSite } from '../commerce/site-scope'
import { deriveDownloadGrantKey } from '../commerce/service'
import { hasEntitlement } from '../commerce/subscription-service'
import { canRenderPublic } from '../public/contracts'
import { parseByteRange } from '../media/range-serving'
import { mediaStorage } from '../media/storage'
import { MediaWorkflowError } from '../media/workflow'
import { releaseTransaction } from '../releases/transaction'
import { createRelease } from '../releases/service'
import { withExecutionLock } from '../operations/execution-lock'
import { authorizeCreator } from '../creator-studio/policy'
import { publishedPortfolio } from '../creator-studio/portfolio-public'
import { relationId, type SubmissionActor, uuid } from '../creator-studio/submission-targets'
import { privateHeaders } from '../creator-studio/submission-http'

const options = { depth: 0, overrideAccess: true, disableErrors: true } as const
const unavailable = () => new MediaWorkflowError('Catalog release unavailable.', 404)
const id = z.string().uuid()
const catalog = z
  .object({
    title: z.string().trim().min(1).max(120),
    source: z.object({
      kind: z.enum(['albums', 'creator-projects', 'podcast-episodes', 'videos']),
      id,
    }),
    trailer: id,
    recording: id,
    recordingAccess: z.enum(['member', 'paid']).default('member'),
    products: z
      .array(id)
      .min(1)
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length),
    downloadProduct: id,
    socialAccount: id.optional(),
    announcement: z.string().trim().max(1500).optional(),
    newsletter: z.string().trim().max(3000).optional(),
    clip: id.optional(),
    graphic: id.optional(),
    plannedInstant: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    ({ trailer, recording, products, downloadProduct }) =>
      trailer !== recording && products.includes(downloadProduct),
  )
type Catalog = z.infer<typeof catalog>
type Row = {
  source_kind: Catalog['source']['kind']
  source_id: string
  entries: Catalog
  published: boolean
}
type Draft = { channel: 'social' | 'newsletter'; target_id: string }

function database(payload: Payload, req?: PayloadRequest) {
  const db = payload.db as unknown as {
    drizzle: { execute<T>(query: ReturnType<typeof sql>): Promise<{ rows: T[] }> }
    sessions: Record<
      string,
      { db: { execute<T>(query: ReturnType<typeof sql>): Promise<{ rows: T[] }> } }
    >
  }
  return req?.transactionID ? db.sessions[String(req.transactionID)].db : db.drizzle
}

async function ownedSource(payload: Payload, actor: SubmissionActor, source: Catalog['source']) {
  const record = await payload.findByID({ collection: source.kind, id: source.id, ...options })
  if (
    !record ||
    relationId(record.site) !== actor.siteId ||
    relationId(record.owner) !== actor.memberId
  )
    throw unavailable()
  if (source.kind === 'albums' || source.kind === 'creator-projects') {
    if (!(await publishedPortfolio(payload, source.kind, record as never, actor.siteId)))
      throw unavailable()
  } else if (
    !canRenderPublic({
      ...record,
      removeFromDiscovery:
        'removeFromDiscovery' in record ? (record.removeFromDiscovery ?? undefined) : undefined,
    }) ||
    ('membersOnly' in record && record.membersOnly)
  ) {
    throw unavailable()
  }
  return record
}

async function releaseAsset(
  payload: Payload,
  actor: SubmissionActor,
  mediaId: string,
  kinds: string[],
) {
  const asset = await payload.findByID({ collection: 'media-assets', id: mediaId, ...options })
  if (
    !asset ||
    relationId(asset.site) !== actor.siteId ||
    relationId(asset.owner) !== actor.memberId ||
    !kinds.includes(asset.kind) ||
    asset.processingState !== 'ready' ||
    asset.publicPolicy !== 'private' ||
    asset.rightsStatus !== 'approved' ||
    asset.retentionHold === 'moderation' ||
    ['archive', 'tombstone'].includes(asset.retentionMode) ||
    (asset.retentionExpiresAt && !(Date.parse(asset.retentionExpiresAt) > Date.now())) ||
    (asset.rightsExpiresAt && !(Date.parse(asset.rightsExpiresAt) > Date.now()))
  )
    throw unavailable()
  const blobId = relationId(asset.originalBlob)
  const blob =
    blobId && (await payload.findByID({ collection: 'media-blobs', id: blobId, ...options }))
  if (
    !blob ||
    relationId(blob.site) !== actor.siteId ||
    blob.state !== 'ready' ||
    blob.checksum !== asset.checksum ||
    !blob.storageKey ||
    !(blob.sizeBytes > 0)
  )
    throw unavailable()
  return { asset, blob }
}

async function product(payload: Payload, actor: SubmissionActor, productId: string) {
  const value = await payload.findByID({ collection: 'products', id: productId, ...options })
  if (
    !value ||
    value.state !== 'published' ||
    relationId(value.site) !== actor.siteId ||
    relationId(value.owner) !== actor.memberId
  )
    throw unavailable()
  return value
}

function digitalDelivery(value: Awaited<ReturnType<typeof product>>) {
  const data = value.digitalDelivery as {
    entitlement?: string
    assets?: {
      mediaId: string
      rightsStatus: string
      malwareStatus: string
      publicOriginal: boolean
    }[]
  } | null
  if (
    !data?.entitlement ||
    !data.assets?.length ||
    data.assets.some(
      (asset) =>
        asset.rightsStatus !== 'approved' ||
        asset.malwareStatus !== 'clean' ||
        asset.publicOriginal !== false,
    )
  )
    throw unavailable()
  return data
}

async function socialAccount(payload: Payload, actor: SubmissionActor, accountId: string) {
  const account = await payload.findByID({
    collection: 'social-accounts',
    id: accountId,
    ...options,
  })
  if (
    !account ||
    relationId(account.site) !== actor.siteId ||
    relationId(account.owner) !== actor.memberId
  )
    throw unavailable()
  return account
}

function promotionText(entries: Catalog, channel: Draft['channel']) {
  return channel === 'newsletter'
    ? entries.newsletter
    : entries.announcement || (entries.clip || entries.graphic ? entries.title : undefined)
}

async function authorizeOwner(payload: Payload, actor: SubmissionActor) {
  try {
    await authorizeCreator(payload, { ...actor, capability: 'media.publish-own' })
    await authorizeCreator(payload, { ...actor, capability: 'commerce.manage-own' })
  } catch {
    throw new MediaWorkflowError('Creator release access denied.', 403)
  }
}

export async function createCreatorCatalogRelease(
  payload: Payload,
  actor: SubmissionActor,
  raw: unknown,
) {
  await authorizeOwner(payload, actor)
  const parsed = catalog.safeParse(raw)
  if (!parsed.success) throw new MediaWorkflowError('Invalid catalog release relationships.')
  const entries = parsed.data
  await validateRelease(payload, actor, entries)
  const creationKey = createHash('sha256')
    .update(JSON.stringify([actor.siteId, actor.memberId, entries]))
    .digest('hex')
  return withExecutionLock(payload, 'creator-catalog-create:' + creationKey, async () => {
    const {
      rows: [prior],
    } = await database(payload).execute<{ release_id: string; published: boolean }>(sql`
      SELECT release_id, published FROM creator_release_catalog WHERE creation_key = ${creationKey}
    `)
    if (prior) return { id: prior.release_id, published: prior.published }
    return releaseTransaction(payload, async (tx, req) => {
      const release = await createRelease(tx, {
        siteId: actor.siteId,
        ownerId: actor.memberId,
        name: entries.title,
        purpose: 'Creator catalog release and promotion drafts',
        ownerTeam: 'Creator Studio',
        plannedInstant: entries.plannedInstant,
      })
      await database(payload, req).execute(sql`
        INSERT INTO creator_release_catalog (release_id, creation_key, source_kind, source_id, entries)
        VALUES (${release.id}, ${creationKey}, ${entries.source.kind}, ${entries.source.id}, ${JSON.stringify(entries)}::jsonb)
      `)
      return { id: release.id, published: false }
    })
  })
}

async function validateRelease(payload: Payload, actor: SubmissionActor, entries: Catalog) {
  await ownedSource(payload, actor, entries.source)
  await releaseAsset(payload, actor, entries.trailer, ['video'])
  await releaseAsset(payload, actor, entries.recording, ['audio', 'video'])
  if (entries.clip) await releaseAsset(payload, actor, entries.clip, ['video'])
  if (entries.clip === entries.recording) throw unavailable()
  if (entries.graphic) await releaseAsset(payload, actor, entries.graphic, ['image'])
  if (entries.socialAccount) await socialAccount(payload, actor, entries.socialAccount)
  const products = await Promise.all(
    entries.products.map((value) => product(payload, actor, value)),
  )
  const delivery = digitalDelivery(products.find((value) => value.id === entries.downloadProduct)!)
  for (const item of delivery.assets!)
    await releaseAsset(payload, actor, item.mediaId, ['audio', 'video', 'document', 'image'])
  if (delivery.assets!.some((item) => item.mediaId === entries.trailer)) throw unavailable()
  const soldRecording = delivery.assets!.some((item) => item.mediaId === entries.recording)
  if (soldRecording !== (entries.recordingAccess === 'paid')) throw unavailable()
}

async function findRelease(payload: Payload, siteId: string, releaseId: string) {
  if (!uuid.test(releaseId)) throw unavailable()
  const release = await payload.findByID({
    collection: 'content-releases',
    id: releaseId,
    ...options,
  })
  if (
    !release ||
    relationId(release.site) !== siteId ||
    ['cancelled', 'rolled-back', 'failed'].includes(release.status ?? '')
  )
    throw unavailable()
  const {
    rows: [row],
  } = await database(payload).execute<Row>(sql`
    SELECT source_kind, source_id, entries, published FROM creator_release_catalog WHERE release_id = ${releaseId}
  `)
  if (!row) throw unavailable()
  return { row, release, owner: { siteId, memberId: relationId(release.owner) } }
}

export async function publishCreatorCatalogRelease(
  payload: Payload,
  actor: SubmissionActor,
  releaseId: string,
) {
  await authorizeOwner(payload, actor)
  return withExecutionLock(payload, 'creator-catalog:' + releaseId, async () => {
    const { row, owner, release } = await findRelease(payload, actor.siteId, releaseId)
    if (owner.memberId !== actor.memberId) throw unavailable()
    await validateRelease(payload, actor, row.entries)
    await database(payload).execute(
      sql`UPDATE creator_release_catalog SET published = true WHERE release_id = ${releaseId}`,
    )
    const { rows: prior } = await database(payload).execute<Draft>(sql`
      SELECT channel, target_id FROM creator_release_drafts WHERE release_id = ${releaseId}
    `)
    const results = []
    const path = '/creator-release/' + releaseId
    for (const channel of ['social', 'newsletter'] as const) {
      const text = promotionText(row.entries, channel)
      const existing = prior.find((item) => item.channel === channel)
      if (existing) {
        results.push({ channel, state: 'draft', id: existing.target_id })
        continue
      }
      if (!text) {
        results.push({ channel, state: 'skipped' })
        continue
      }
      try {
        const targetId = await releaseTransaction(payload, async (tx, req) => {
          const draft =
            channel === 'social'
              ? await tx.create({
                  collection: 'social-drafts',
                  overrideAccess: true,
                  data: {
                    site: actor.siteId,
                    owner: actor.memberId,
                    status: 'draft',
                    title: row.entries.title,
                    requiresReview: true,
                    provenance: {
                      creatorReleaseId: releaseId,
                      derivedText: text,
                      catalogPath: path,
                      clip: row.entries.clip ?? null,
                      graphic: row.entries.graphic ?? null,
                    },
                  },
                })
              : await tx.create({
                  collection: 'email-messages',
                  overrideAccess: true,
                  data: {
                    site: actor.siteId,
                    owner: actor.memberId,
                    status: 'draft',
                    subject: row.entries.title,
                    blocks: [{ type: 'text', text }],
                    kind: 'bulk',
                    purpose: 'newsletter',
                  },
                })
          if (channel === 'social' && row.entries.socialAccount) {
            const account = await socialAccount(tx, actor, row.entries.socialAccount)
            const origin = await catalogOriginForSite(tx, actor.siteId)
            await tx.create({
              collection: 'social-network-variants',
              overrideAccess: true,
              data: {
                draft: draft.id,
                account: account.id,
                network: account.network,
                label: account.displayName,
                text,
                linkUrl: new URL(path, origin).href,
                attachments: [
                  ...new Set(
                    [row.entries.clip, row.entries.graphic].filter((value): value is string =>
                      Boolean(value),
                    ),
                  ),
                ],
                status: 'draft',
                idempotencyKey: 'creator-catalog:' + releaseId + ':' + account.id,
              },
            })
          }
          await database(payload, req).execute(sql`
            INSERT INTO creator_release_drafts (release_id, channel, target_id)
            VALUES (${releaseId}, ${channel}, ${draft.id})
          `)
          return draft.id
        })
        results.push({ channel, state: 'draft', id: targetId })
      } catch (error) {
        payload.logger.error({
          event: 'creator.release.draft_failed',
          releaseId,
          channel,
          err: error,
        })
        results.push({ channel, state: 'failed' })
      }
    }
    return {
      id: releaseId,
      published: true,
      path,
      calendar: {
        state: release.status ?? 'draft',
        id: releaseId,
        plannedInstant: release.plannedInstant,
      },
      state: results.some((item) => item.state === 'failed') ? 'partial' : 'published',
      drafts: results,
    }
  })
}

export async function listCreatorCatalogReleases(payload: Payload, actor: SubmissionActor) {
  await authorizeOwner(payload, actor)
  const { rows } = await database(payload).execute<{
    id: string
    title: string
    published: boolean
  }>(sql`
    SELECT r.id, r.title, c.published FROM creator_release_catalog c
    JOIN content_releases r ON r.id = c.release_id
    WHERE r.site_id = ${actor.siteId} AND r.owner_id = ${actor.memberId}
    ORDER BY r.created_at DESC LIMIT 50
  `)
  return rows
}

export async function creatorCatalogReport(
  payload: Payload,
  actor: SubmissionActor,
  releaseId: string,
) {
  await authorizeOwner(payload, actor)
  const { row, owner, release } = await findRelease(payload, actor.siteId, releaseId)
  if (owner.memberId !== actor.memberId) throw unavailable()
  const { rows } = await database(payload).execute<Draft>(sql`
    SELECT channel, target_id FROM creator_release_drafts WHERE release_id = ${releaseId} ORDER BY channel
  `)
  return {
    id: releaseId,
    published: row.published,
    path: '/creator-release/' + releaseId,
    calendar: {
      state: release.status ?? 'draft',
      id: releaseId,
      plannedInstant: release.plannedInstant,
    },
    drafts: (['social', 'newsletter'] as const).map((channel) => {
      const target = rows.find((item) => item.channel === channel)
      return target
        ? { channel, state: 'draft', id: target.target_id }
        : {
            channel,
            state: promotionText(row.entries, channel)
              ? row.published
                ? 'incomplete'
                : 'pending'
              : 'skipped',
          }
    }),
  }
}

export async function unpublishCreatorCatalogRelease(
  payload: Payload,
  actor: SubmissionActor,
  releaseId: string,
) {
  await authorizeOwner(payload, actor)
  return withExecutionLock(payload, 'creator-catalog:' + releaseId, async () => {
    const { owner } = await findRelease(payload, actor.siteId, releaseId)
    if (owner.memberId !== actor.memberId) throw unavailable()
    await database(payload).execute(
      sql`UPDATE creator_release_catalog SET published = false WHERE release_id = ${releaseId}`,
    )
    return { id: releaseId, published: false }
  })
}

export async function catalogLinksForSource(
  payload: Payload,
  siteId: string,
  kind: Catalog['source']['kind'],
  sourceId: string,
) {
  if (!uuid.test(siteId) || !uuid.test(sourceId)) return []
  const { rows } = await database(payload).execute<{ id: string; title: string }>(sql`
    SELECT r.id, r.title
    FROM creator_release_catalog c JOIN content_releases r ON r.id = c.release_id
    WHERE c.published AND c.source_kind = ${kind} AND c.source_id = ${sourceId}
      AND r.site_id = ${siteId} AND r.status NOT IN ('cancelled', 'rolled-back', 'failed')
    ORDER BY r.created_at DESC LIMIT 20
  `)
  return rows
}

async function publicRelease(payload: Payload, siteId: string, releaseId: string) {
  const site = await payload.findByID({ collection: 'sites', id: siteId, ...options })
  if (!site || site.lifecycle !== 'active' || (site.visibility && site.visibility !== 'public'))
    throw unavailable()
  const result = await findRelease(payload, siteId, releaseId)
  if (!result.row.published) throw unavailable()
  return result
}

export async function creatorCatalogView(
  payload: Payload,
  actor: SubmissionActor,
  releaseId: string,
) {
  const { row, release, owner } = await publicRelease(payload, actor.siteId, releaseId)
  const source = await ownedSource(payload, owner, row.entries.source)
  const products = []
  for (const productId of row.entries.products) {
    const entry = await product(payload, owner, productId).catch(() => null)
    if (entry)
      products.push({
        id: entry.id,
        name: entry.name,
        kind: entry.kind,
        href: '/store/' + encodeURIComponent(entry.slug),
      })
  }
  const delivery = products.some((item) => item.id === row.entries.downloadProduct)
    ? await product(payload, owner, row.entries.downloadProduct)
        .then(digitalDelivery)
        .catch(() => null)
    : null
  const downloads = []
  if (actor.memberId && delivery) {
    const { docs } = await payload.find({
      collection: 'digital-delivery-grants',
      depth: 1,
      limit: 100,
      overrideAccess: true,
      where: {
        and: [
          { site: { equals: actor.siteId } },
          { member: { equals: actor.memberId } },
          { product: { equals: row.entries.downloadProduct } },
        ],
      },
    })
    const available = new Set(
      docs.filter(deliveryGrantAvailable).map((grant) => relationId(grant.mediaAsset)),
    )
    for (const item of delivery.assets!) {
      if (!available.has(item.mediaId)) continue
      const media = await releaseAsset(payload, owner, item.mediaId, [
        'audio',
        'video',
        'document',
        'image',
      ]).catch(() => null)
      if (media) downloads.push({ id: item.mediaId, title: media.asset.title })
    }
  }
  return {
    id: release.id,
    title: release.title,
    source: { kind: row.source_kind, id: source.id },
    recordingAccess: row.entries.recordingAccess,
    downloads,
    products,
  }
}

export async function creatorCatalogDownload(
  payload: Payload,
  actor: SubmissionActor,
  releaseId: string,
  assetId: string,
) {
  if (!actor.memberId || !uuid.test(assetId)) throw unavailable()
  const { row, owner } = await publicRelease(payload, actor.siteId, releaseId)
  await ownedSource(payload, owner, row.entries.source)
  const entry = await product(payload, owner, row.entries.downloadProduct)
  const delivery = digitalDelivery(entry)
  if (!delivery.assets!.some(({ mediaId }) => mediaId === assetId)) throw unavailable()
  await releaseAsset(payload, owner, assetId, ['audio', 'video', 'document', 'image'])
  const { docs } = await payload.find({
    collection: 'digital-delivery-grants',
    depth: 1,
    limit: 100,
    overrideAccess: true,
    where: {
      and: [
        { site: { equals: actor.siteId } },
        { member: { equals: actor.memberId } },
        { product: { equals: entry.id } },
        { mediaAsset: { equals: assetId } },
      ],
    },
  })
  const secret = deliverySigningSecret()
  if (secret.length < 16) throw unavailable()
  for (const grant of docs) {
    const entitlement = typeof grant.entitlement === 'object' ? grant.entitlement : null
    if (
      !entitlement ||
      relationId(entitlement.site) !== actor.siteId ||
      !deliveryGrantAvailable(grant)
    )
      continue
    const orderId = entitlement.source.startsWith('order:') ? entitlement.source.slice(6) : ''
    if (!uuid.test(orderId)) continue
    const key = deriveDownloadGrantKey(
      { orderId, productId: entry.id, variantSku: grant.variantSku, mediaId: assetId },
      secret,
    )
    if (createHash('sha256').update(key).digest('hex') === grant.grantKeyHash)
      return new Response(null, {
        status: 307,
        headers: { ...privateHeaders, location: '/api/commerce/download/' + key },
      })
  }
  throw unavailable()
}

async function mediaAccess(
  payload: Payload,
  actor: SubmissionActor,
  releaseId: string,
  slot: string,
) {
  const { row, owner } = await publicRelease(payload, actor.siteId, releaseId)
  if (slot !== 'trailer' && slot !== 'recording') throw unavailable()
  await ownedSource(payload, owner, row.entries.source)
  if (slot === 'recording') {
    if (!actor.memberId) throw unavailable()
    const membership = await payload.count({
      collection: 'member-site-roles',
      overrideAccess: true,
      where: { and: [{ site: { equals: actor.siteId } }, { member: { equals: actor.memberId } }] },
    })
    if (!membership.totalDocs && row.entries.recordingAccess === 'member') throw unavailable()
    if (row.entries.recordingAccess === 'paid') {
      const entry = await product(payload, owner, row.entries.downloadProduct)
      const delivery = digitalDelivery(entry)
      if (!delivery.assets!.some((value) => value.mediaId === row.entries.recording))
        throw unavailable()
      const subscription = await hasEntitlement(payload as never, {
        subjectId: actor.memberId,
        siteId: actor.siteId,
        resource: entry.id,
        capability: delivery.entitlement!,
        unmetered: true,
      })
      if (!subscription) {
        const grants = await payload.find({
          collection: 'digital-delivery-grants',
          depth: 1,
          limit: 100,
          overrideAccess: true,
          where: {
            and: [
              { site: { equals: actor.siteId } },
              { member: { equals: actor.memberId } },
              { product: { equals: entry.id } },
              { mediaAsset: { equals: row.entries.recording } },
              { downloadLimit: { exists: false } },
            ],
          },
        })
        if (!grants.docs.some(deliveryGrantAvailable)) throw unavailable()
      }
    }
  }
  return releaseAsset(payload, owner, row.entries[slot], ['audio', 'video'])
}

function signature(
  actor: SubmissionActor,
  releaseId: string,
  slot: string,
  checksum: string,
  expires: number,
) {
  return createHmac('sha256', loadConfig().payloadSecret)
    .update(
      JSON.stringify([
        'creator-catalog-media',
        actor.siteId,
        slot === 'trailer' ? '' : actor.memberId,
        releaseId,
        slot,
        checksum,
        expires,
      ]),
    )
    .digest('hex')
}

export async function deliverCreatorCatalogMedia(
  payload: Payload,
  actor: SubmissionActor,
  releaseId: string,
  slot: string,
  request: Request,
) {
  const { asset, blob } = await mediaAccess(payload, actor, releaseId, slot)
  const url = new URL(request.url)
  const token = url.searchParams.get('sig')
  const expires = Number(url.searchParams.get('expires'))
  if (token === null && !url.searchParams.has('expires')) {
    const expiry = Date.now() + 300_000
    url.searchParams.set('expires', String(expiry))
    url.searchParams.set('sig', signature(actor, releaseId, slot, blob.checksum, expiry))
    return new Response(null, {
      status: 307,
      headers: { ...privateHeaders, location: url.pathname + url.search },
    })
  }
  if (
    !token ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !Number.isSafeInteger(expires) ||
    expires <= Date.now() ||
    !timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(signature(actor, releaseId, slot, blob.checksum, expires), 'hex'),
    )
  )
    throw unavailable()
  const mime = asset.mimeType
  if (
    !mime ||
    ![
      'video/mp4',
      'video/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/webm',
      'audio/ogg',
    ].includes(mime)
  )
    throw unavailable()
  const range = parseByteRange(request.headers.get('range'), blob.sizeBytes)
  const headers = new Headers({
    ...privateHeaders,
    'content-type': mime,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  })
  if (range === null) {
    headers.set('content-range', 'bytes */' + blob.sizeBytes)
    return new Response(null, { status: 416, headers })
  }
  const { from, to } = range ?? { from: 0, to: blob.sizeBytes - 1 }
  headers.set('content-length', String(to - from + 1))
  if (range) headers.set('content-range', `bytes ${from}-${to}/${blob.sizeBytes}`)
  const stream =
    request.method === 'HEAD'
      ? null
      : await mediaStorage(loadConfig()).open(blob.storageKey, from, to)
  if (!stream && request.method !== 'HEAD') throw unavailable()
  return new Response(stream, { status: range ? 206 : 200, headers })
}
