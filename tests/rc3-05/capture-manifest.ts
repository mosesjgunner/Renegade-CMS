/**
 * RC3-05 identity manifest capture: read the rehearsal entities back from
 * an instance's database (Payload local API, depth 0) and probe its live
 * HTTP surface (health, home, article, podcast feed GUIDs/enclosure).
 *
 * Env: DATABASE_URL/MEDIA_DIR of the instance, RC305_IDENTITY_IN,
 * RC305_BASE_URL (e.g. http://127.0.0.1:3105), RC305_MANIFEST_OUT.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getPayload } from 'payload'

import config from '../../src/payload.config'

const identityPath = process.env.RC305_IDENTITY_IN
const baseUrl = process.env.RC305_BASE_URL
const out = process.env.RC305_MANIFEST_OUT
const mediaDir = process.env.MEDIA_DIR
if (!identityPath || !baseUrl || !out || !mediaDir)
  throw new Error('Set RC305_IDENTITY_IN, RC305_BASE_URL, RC305_MANIFEST_OUT and MEDIA_DIR.')

const identity = JSON.parse(await readFile(identityPath, 'utf8')) as Record<string, any>
const payload = await getPayload({ config })

const relId = (value: unknown): string | null =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id)
      : null

const byId = async (collection: string, id: string) =>
  (await payload.findByID({
    collection: collection as never,
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>

const pick = (doc: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, doc[key] ?? null]))

const siteA = await byId('sites', identity.siteA.id)
const siteB = await byId('sites', identity.siteB.id)
const articleA = await byId('content', identity.articleA.id)
const articleB = await byId('content', identity.articleB.id)
const show = await byId('podcast-shows', identity.show.id)
const episode = await byId('podcast-episodes', identity.episode.id)
const audioBlob = await byId('media-blobs', identity.audioBlob.id)
const audioAsset = await byId('media-assets', identity.audioAsset.id)
const memberA = await byId('members', identity.memberA.id)
const supporterA = await byId('supporters', identity.supporterA.id)
const entitlement = await byId('entitlements', identity.entitlement.id)
const job = await byId('payload-jobs', identity.job.id)

const episodeGuidFields = Object.fromEntries(
  Object.entries(episode).filter(([key]) => /guid/i.test(key)),
)

const enclosurePath = path.join(mediaDir, identity.audioBlob.storageKey)
const enclosureBytes = await readFile(enclosurePath)
const enclosureFile = {
  bytes: enclosureBytes.byteLength,
  sha256: `sha256:${createHash('sha256').update(enclosureBytes).digest('hex')}`,
}

const pool = (
  payload.db as unknown as { pool: { query: (sql: string) => Promise<{ rows: any[] }> } }
).pool
const migrationRows = await pool.query('SELECT name FROM payload_migrations ORDER BY name')
const migrationNames = migrationRows.rows.map((row) => String(row.name))

const fetchText = async (url: string) => {
  const response = await fetch(url)
  return { status: response.status, text: await response.text() }
}
const ready = await fetchText(`${baseUrl}/health/ready`)
const home = await fetchText(`${baseUrl}/`)
const article = await fetchText(`${baseUrl}${String(articleA.canonicalPath)}`)
const articleBRes = await fetchText(`${baseUrl}${String(articleB.canonicalPath)}`)
const enclosureRes = await fetch(`${baseUrl}/media/${identity.audioAsset.id}`)
const enclosureServed = Buffer.from(await enclosureRes.arrayBuffer())
const feed = await fetchText(`${baseUrl}/podcasts/${identity.show.slug}/feed.xml`)
const channelGuid = feed.text.match(/<podcast:guid>([^<]+)<\/podcast:guid>/)?.[1] ?? null
const itemGuid = feed.text.match(/<item>[\s\S]*?<guid[^>]*>([^<]+)<\/guid>/)?.[1] ?? null
const enclosureMatch = feed.text.match(
  /<enclosure[^>]*url="([^"]+)"[^>]*length="([^"]+)"[^>]*type="([^"]+)"/,
)

const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  sites: {
    a: pick(siteA, ['id', 'slug', 'name', 'lifecycle']),
    b: pick(siteB, ['id', 'slug', 'name', 'lifecycle']),
  },
  articles: {
    a: {
      ...pick(articleA, ['id', 'slug', 'canonicalPath', 'status']),
      site: relId(articleA.site),
      publication: relId(articleA.publication),
    },
    b: {
      ...pick(articleB, ['id', 'slug', 'canonicalPath', 'status']),
      site: relId(articleB.site),
      publication: relId(articleB.publication),
    },
  },
  show: {
    ...pick(show, ['id', 'slug', 'podcastGuidValue', 'status', 'rssEnabled']),
    site: relId(show.site),
  },
  episode: {
    ...pick(episode, ['id', 'slug', 'status', 'enclosureBytes', 'enclosureMimeType']),
    site: relId(episode.site),
    show: relId(episode.show),
    audio: relId(episode.audio),
    guidFields: episodeGuidFields,
  },
  audioBlob: pick(audioBlob, ['id', 'storageKey', 'checksum', 'sizeBytes', 'state']),
  audioAsset: {
    ...pick(audioAsset, ['id', 'checksum', 'sizeBytes', 'storageLocation']),
    site: relId(audioAsset.site),
    originalBlob: relId(audioAsset.originalBlob),
  },
  enclosureFile,
  member: pick(memberA, ['id', 'email', 'status']),
  supporter: {
    ...pick(supporterA, ['id']),
    site: relId(supporterA.site),
    member: relId(supporterA.member),
  },
  entitlement: {
    ...pick(entitlement, ['id', 'entitlement', 'source', 'resource', 'capability', 'grantKey']),
    site: relId(entitlement.site),
    supporter: relId(entitlement.supporter),
    revokedAt: entitlement.revokedAt ?? null,
  },
  job: pick(job, [
    'id',
    'taskSlug',
    'queue',
    'processing',
    'completedAt',
    'totalAttempts',
    'hasError',
    'state',
    'waitUntil',
  ]),
  migrations: {
    count: migrationNames.length,
    namesSha256: createHash('sha256').update(migrationNames.join('\n')).digest('hex'),
  },
  live: {
    readyStatus: ready.status,
    readyBody: ready.text.slice(0, 200),
    homeStatus: home.status,
    articleStatus: article.status,
    articleContainsTitle: article.text.includes('Demo Field Report'),
    articleBStatus: articleBRes.status,
    articleBContainsTitle: articleBRes.text.includes('Harbor Restore Rehearsal Article'),
    enclosureHttpStatus: enclosureRes.status,
    enclosureServedBytes: enclosureServed.byteLength,
    enclosureServedSha256: `sha256:${createHash('sha256').update(enclosureServed).digest('hex')}`,
    feedStatus: feed.status,
    feedChannelGuid: channelGuid,
    feedItemGuid: itemGuid,
    feedEnclosure: enclosureMatch
      ? { url: enclosureMatch[1], length: enclosureMatch[2], type: enclosureMatch[3] }
      : null,
  },
}
await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`RC305-MANIFEST-OK ${out}`)
process.exit(0)
