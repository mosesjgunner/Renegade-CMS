/**
 * RC3-23 #80 confirmation harness — NOT a vitest suite.
 *
 * `plant`  (source env): creates a real site B with a brand, publication,
 *          member, author, a published article, and a media asset whose
 *          bytes are written through the product media storage (the
 *          RC3-05 seed-instance pattern), then prints PLANTED={...}.
 * `verify` (target env): reads the planted article + media asset back
 *          from the target database after the real CLI import and
 *          prints VERIFIED={...} with the media checksum.
 *
 * The export/import legs themselves run through the product CLI
 * (`src/scripts/portability.ts`), driven by the pass's shell script.
 */
import { createHash, randomUUID } from 'node:crypto'
import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'

const mode = process.argv[2]
const payload = await getPayload({ config })
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
// 1x1 transparent PNG
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

if (mode === 'plant') {
  const create = (collection: string, data: Record<string, unknown>) =>
    payload.create({
      collection: collection as never,
      data: data as never,
      overrideAccess: true,
    }) as Promise<Record<string, unknown>>
  const site = await create('sites', {
    name: 'RC323 Portability Site',
    slug: 'rc323-portability',
    description: 'Planted by the RC3-23 export round-trip confirmation.',
    lifecycle: 'active',
    communityRegistrationPolicy: 'open',
    commentReactionCodes: ['thumbs_up'],
  })
  const siteId = String(site.id)
  const brand = await create('brands', {
    site: siteId,
    name: 'RC323 Studio',
    legalName: 'RC323 Studio',
    kind: 'organization',
    tagline: 'Round-trip tenant.',
  })
  const publication = await create('publications', {
    site: siteId,
    name: 'RC323 Publication',
    slug: 'main',
    canonicalBasePath: '/',
    status: 'active',
    visibility: 'public',
    brand: String(brand.id),
    feeds: [{ kind: 'rss', path: '/feed.xml' }],
  })
  const member = await create('members', {
    email: 'rc323@example.test',
    displayName: 'RC323 Member',
    status: 'active',
  })
  const author = await create('authors', {
    displayName: 'RC323 Member',
    slug: 'rc323-member',
    member: String(member.id),
    bio: 'Author on the portability site.',
  })
  const paragraph = (text: string) => ({
    type: 'paragraph',
    version: 1,
    children: [{ type: 'text', version: 1, text }],
  })
  const article = await create('content', {
    site: siteId,
    publication: String(publication.id),
    owner: String(member.id),
    contentType: 'article',
    title: 'RC323 Portability Article',
    slug: 'rc323-portability-article',
    pathOverride: true,
    canonicalPath: '/notes/rc323-portability-article',
    summary: 'Planted article for the RC3-23 export round trip.',
    body: { root: { type: 'root', version: 1, children: [paragraph('Round-trip body.')] } },
    status: 'published',
    publishedAt: '2026-11-25T12:00:00.000Z',
    authors: [{ author: String(author.id), displayOrder: 1, role: 'Reporter' }],
    commentsPolicy: 'open',
    retentionMode: 'permanent',
    retentionHold: 'none',
  })
  const key = `${siteId}/${randomUUID()}.png`
  const storage = mediaStorage(loadConfig())
  await storage.put(key, pngBytes, 'image/png')
  const checksum = sha256(pngBytes)
  const blob = await create('media-blobs', {
    site: siteId,
    storageKey: key,
    storageProvider: 'local',
    mimeType: 'image/png',
    sizeBytes: pngBytes.byteLength,
    checksum,
    state: 'ready',
  })
  const asset = await create('media-assets', {
    site: siteId,
    title: 'RC323 Portability Photo',
    kind: 'image',
    storageProvider: 'local',
    originalBlob: String(blob.id),
    storageLocation: key,
    mimeType: 'image/png',
    sizeBytes: pngBytes.byteLength,
    checksum,
  })
  console.log(
    `PLANTED=${JSON.stringify({
      siteId,
      articleId: String(article.id),
      articleSlug: 'rc323-portability-article',
      assetId: String(asset.id),
      assetChecksum: checksum,
      mediaBytes: pngBytes.byteLength,
    })}`,
  )
} else if (mode === 'target-site') {
  const site = (await payload.create({
    collection: 'sites',
    data: {
      name: 'RC323 Import Target',
      slug: 'rc323-target',
      description: 'Bare import target site for the RC3-23 round trip.',
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['thumbs_up'],
    } as never,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  console.log(`TARGET_SITE=${JSON.stringify({ siteId: String(site.id) })}`)
} else if (mode === 'verify') {
  const articles = await payload.find({
    collection: 'content',
    where: { slug: { equals: 'rc323-portability-article' } },
    depth: 0,
    overrideAccess: true,
  } as never)
  const assets = await payload.find({
    collection: 'media-assets',
    where: { title: { equals: 'RC323 Portability Photo' } },
    depth: 0,
    overrideAccess: true,
  } as never)
  const asset = assets.docs[0] as unknown as Record<string, unknown> | undefined
  let bytesMatch = false
  if (asset) {
    const storage = mediaStorage(loadConfig())
    const key = String(asset.storageLocation ?? '')
    const bytes = key ? await storage.get(key) : undefined
    bytesMatch = Boolean(bytes) && sha256(Buffer.from(bytes as Buffer)) === String(asset.checksum)
  }
  console.log(
    `VERIFIED=${JSON.stringify({
      articles: articles.totalDocs,
      articleStatus: (articles.docs[0] as unknown as Record<string, unknown>)?.status ?? null,
      assets: assets.totalDocs,
      assetChecksum: asset ? String(asset.checksum) : null,
      mediaBytesMatch: bytesMatch,
    })}`,
  )
} else {
  throw new Error('Usage: portability-roundtrip <plant|verify>')
}
await payload.db?.destroy?.()
process.exit(0)
