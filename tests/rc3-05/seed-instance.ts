/**
 * RC3-05 rehearsal seed: build a realistic instance on top of the product
 * seed — a second site with its own published article, a podcast show with
 * a published episode whose enclosure is a real file in MEDIA_DIR, a member
 * holding a podcast entitlement, and one pending background job.
 *
 * Writes the seeded identity (ids, slugs, hashes) to RC305_IDENTITY_OUT.
 * Run with the source instance env (DATABASE_URL + MEDIA_DIR + APP_URL).
 */
import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { seed } from '../../src/scripts/seed'

const out = process.env.RC305_IDENTITY_OUT
if (!out) throw new Error('Set RC305_IDENTITY_OUT to the identity JSON path.')

const sha256 = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

/** Deterministic 0.5 s 440 Hz mono WAV (16-bit PCM, 8 kHz). */
function wavBytes(): Buffer {
  const sampleRate = 8000
  const frames = sampleRate / 2
  const data = Buffer.alloc(frames * 2)
  for (let i = 0; i < frames; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000)
    data.writeInt16LE(sample, i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const payload = await getPayload({ config })
await seed(payload)

const findOne = async (collection: string, where: Record<string, unknown>) => {
  const result = await payload.find({
    collection: collection as never,
    where: where as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs[0] as unknown as Record<string, unknown>
}

const siteA = await findOne('sites', { slug: { equals: 'demo-publication' } })
if (!siteA) throw new Error('Product seed did not create the demo site.')
const siteAId = String(siteA.id)
const demoArticle = await findOne('content', { slug: { equals: 'demo-field-report' } })

// --- Second site with its own brand, publication, member, author, article.
const siteB = (await payload.create({
  collection: 'sites',
  data: {
    name: 'RC305 Harbor Site',
    slug: 'rc305-site-b',
    description: 'Second tenant created by the RC3-05 restore rehearsal.',
    lifecycle: 'active',
    communityRegistrationPolicy: 'open',
    commentReactionCodes: ['thumbs_up', 'heart'],
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>
const siteBId = String(siteB.id)

const brandB = (await payload.create({
  collection: 'brands',
  data: {
    site: siteBId,
    name: 'Harbor Demo Studio',
    legalName: 'Harbor Demo Studio',
    kind: 'organization',
    tagline: 'Restore rehearsal tenant.',
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const publicationB = (await payload.create({
  collection: 'publications',
  data: {
    site: siteBId,
    name: 'Harbor Main Publication',
    slug: 'main',
    canonicalBasePath: '/',
    status: 'active',
    visibility: 'public',
    brand: String(brandB.id),
    feeds: [{ kind: 'rss', path: '/feed.xml' }],
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const memberB = (await payload.create({
  collection: 'members',
  data: {
    email: 'rc305-b@example.test',
    displayName: 'Harbor Member',
    status: 'active',
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const authorB = (await payload.create({
  collection: 'authors',
  data: {
    displayName: 'Harbor Member',
    slug: 'harbor-member',
    member: String(memberB.id),
    bio: 'Author on the second rehearsal site.',
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const paragraph = (text: string) => ({
  type: 'paragraph',
  version: 1,
  children: [{ type: 'text', version: 1, text }],
})
const articleB = (await payload.create({
  collection: 'content',
  data: {
    site: siteBId,
    publication: String(publicationB.id),
    owner: String(memberB.id),
    contentType: 'article',
    title: 'Harbor Restore Rehearsal Article',
    slug: 'rc305-harbor-article',
    pathOverride: true,
    canonicalPath: '/notes/rc305-harbor-article',
    summary: 'Published article on the second site for the RC3-05 rehearsal.',
    body: { root: { type: 'root', version: 1, children: [paragraph('Second-site body.')] } },
    status: 'published',
    publishedAt: '2026-11-20T12:00:00.000Z',
    authors: [{ author: String(authorB.id), displayOrder: 1, role: 'Reporter' }],
    commentsPolicy: 'open',
    retentionMode: 'permanent',
    retentionHold: 'none',
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

// --- Podcast enclosure: real bytes into the local media store on site A.
const audioBytes = wavBytes()
const audioKey = `${siteAId}/${randomUUID()}.wav`
const storage = mediaStorage(loadConfig())
await storage.put(audioKey, audioBytes, 'audio/wav')
const audioChecksum = sha256(audioBytes)

const audioBlob = (await payload.create({
  collection: 'media-blobs',
  data: {
    site: siteAId,
    storageKey: audioKey,
    storageProvider: 'local',
    mimeType: 'audio/wav',
    sizeBytes: audioBytes.byteLength,
    checksum: audioChecksum,
    state: 'ready',
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const audioAsset = (await payload.create({
  collection: 'media-assets',
  data: {
    site: siteAId,
    title: 'RC305 Episode Enclosure',
    kind: 'audio',
    storageProvider: 'local',
    originalBlob: String(audioBlob.id),
    storageLocation: audioKey,
    mimeType: 'audio/wav',
    sizeBytes: audioBytes.byteLength,
    checksum: audioChecksum,
    durationSeconds: 1,
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const show = (await payload.create({
  collection: 'podcast-shows',
  data: {
    site: siteAId,
    title: 'RC305 Rehearsal Show',
    slug: 'rc305-show',
    description: 'Public show created by the RC3-05 restore rehearsal.',
    rssEnabled: true,
    feedVisibility: 'public',
    status: 'published',
    publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const episode = (await payload.create({
  collection: 'podcast-episodes',
  data: {
    site: siteAId,
    show: String(show.id),
    title: 'RC305 Rehearsal Episode',
    slug: 'rc305-episode-1',
    audio: String(audioAsset.id),
    membersOnly: false,
    enclosureBytes: audioBytes.byteLength,
    enclosureMimeType: 'audio/wav',
    status: 'published',
    publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

// --- Member + supporter + entitlement on site A (POD-03 grant shape).
const memberA = (await payload.create({
  collection: 'members',
  data: {
    email: 'rc305-member@example.test',
    displayName: 'RC305 Entitled Member',
    status: 'active',
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const supporterA = (await payload.create({
  collection: 'supporters',
  data: {
    site: siteAId,
    member: String(memberA.id),
    displayName: 'RC305 Entitled Member',
    visibilityPreference: 'public',
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

const entitlement = (await payload.create({
  collection: 'entitlements',
  data: {
    site: siteAId,
    supporter: String(supporterA.id),
    entitlement: `podcast-show:${String(show.id)}.listen`,
    source: 'rc305-rehearsal',
    startsAt: new Date(Date.now() - 86_400_000).toISOString(),
    resource: `podcast-show:${String(show.id)}`,
    capability: 'listen',
    grantKey: 'rc305-grant-listen-1',
  } as never,
  overrideAccess: true,
})) as unknown as Record<string, unknown>

// --- One pending background job (worker is not running).
const job = await payload.jobs.queue({
  task: 'commerce-reconcile-payments',
  input: {},
  queue: 'operations',
})

const identity = {
  runId: 'rc305',
  siteA: { id: siteAId, slug: 'demo-publication' },
  siteB: { id: siteBId, slug: 'rc305-site-b' },
  publicationB: { id: String(publicationB.id), slug: 'main' },
  articleA: { id: String(demoArticle.id), slug: 'demo-field-report' },
  articleB: { id: String(articleB.id), slug: 'rc305-harbor-article' },
  show: { id: String(show.id), slug: 'rc305-show' },
  episode: { id: String(episode.id), slug: 'rc305-episode-1' },
  audioBlob: { id: String(audioBlob.id), storageKey: audioKey },
  audioAsset: { id: String(audioAsset.id) },
  enclosure: { bytes: audioBytes.byteLength, sha256: audioChecksum },
  memberA: { id: String(memberA.id) },
  supporterA: { id: String(supporterA.id) },
  entitlement: { id: String(entitlement.id), grantKey: 'rc305-grant-listen-1' },
  job: { id: String((job as unknown as Record<string, unknown>).id) },
}
await writeFile(out, `${JSON.stringify(identity, null, 2)}\n`)
console.log(`RC305-SEED-OK ${out}`)
process.exit(0)
