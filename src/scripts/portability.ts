import { exportPortableSite } from '../modules/portability/site-export'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../payload.config'
import {
  createPortableArchive,
  createPortableManifest,
  restorePortableArchive,
  type PortableArchive,
} from '../modules/portability/contracts'
import {
  importPortableManifest,
  assertPortableSiteBoundary,
  type PortabilityCheckpoint,
} from '../modules/portability/workflow'
import { mediaStorage } from '../modules/media/storage'
import { loadConfig } from '../modules/core/config'

const args = process.argv.slice(2)
const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const has = (name: string) => args.includes(name)
const command = args[0],
  file = value('--file'),
  key = value('--key'),
  siteId = value(command === 'export' ? '--site-id' : '--target-site-id')
if (!['export', 'import'].includes(command ?? '') || !file || !key)
  throw new Error(
    'Usage: portability <export|import> --file <archive.json> --key <64-hex-character-key> [--apply] [--checkpoint <file>]',
  )
if (!/^[a-fA-F0-9]{64}$/.test(key))
  throw new Error('--key must be a separately-held 32-byte hex key.')
if (!siteId)
  throw new Error(
    command === 'export'
      ? 'Portable export requires --site-id to enforce a tenant boundary.'
      : 'Portable import requires --target-site-id to enforce a tenant boundary.',
  )
const encryptionKey = Buffer.from(key, 'hex'),
  payload = await getPayload({ config }),
  storage = mediaStorage(loadConfig())
const portabilityPayload = payload as unknown as {
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
  create: (args: Record<string, unknown>) => Promise<unknown>
}
if (command === 'export') {
  const manifest = await exportPortableSite(payload, siteId)
  await writeFile(
    path.resolve(file),
    `${JSON.stringify(createPortableArchive(manifest, encryptionKey), null, 2)}\n`,
    { mode: 0o600 },
  )
  console.log(
    JSON.stringify(
      { state: 'completed', records: manifest.records.length, file: path.resolve(file) },
      null,
      2,
    ),
  )
} else {
  const manifest = restorePortableArchive(
    JSON.parse(await readFile(path.resolve(file), 'utf8')) as PortableArchive,
    encryptionKey,
  )
  const sourceSite = manifest.records.find((record) => record.collection === 'sites')
  if (!sourceSite) throw new Error('Portable archive has no source site.')
  assertPortableSiteBoundary(manifest, sourceSite.id)
  const targetSite = await portabilityPayload
    .findByID({ collection: 'sites', id: siteId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!targetSite) throw new Error(`Target site was not found: ${siteId}`)
  const remapped = createPortableManifest({
    createdAt: manifest.createdAt,
    records: manifest.records
      .filter((record) => record.collection !== 'sites')
      .map((record) => ({
        ...record,
        data: { ...record.data, ...(record.data.site === sourceSite.id ? { site: siteId } : {}) },
      })),
    media: manifest.media,
  })
  const checkpointFile = path.resolve(value('--checkpoint') ?? `${file}.checkpoint.json`)
  const checkpoint = has('--resume')
    ? (JSON.parse(await readFile(checkpointFile, 'utf8')) as PortabilityCheckpoint)
    : undefined
  // Payload's Postgres adapter assigns record ids itself — a supplied id in
  // create data is not honored — so imported rows live under NEW ids. The
  // store therefore tracks source-id -> actual-id for every row it writes
  // and rewrites reference values in later records through that map before
  // they are written (a foreign key to a source id can never resolve). The
  // source site id is pre-seeded to the target site so every field that
  // references the site is remapped uniformly, not just top-level `site`.
  const idMap = new Map<string, string>([[sourceSite.id, siteId]])
  const repairedSources = new Set<string>()
  // The article family and its revisions reference each other circularly
  // (family.currentRevision -> revision, revision.article -> family), so the
  // family's revision pointers are written as null and restored by
  // repairRelationships once the revision rows exist.
  const deferredPointers = new Map<string, Record<string, unknown>>()
  const uuidToken = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
  const remapReferences = (input: unknown, ownerKey: string): unknown => {
    if (typeof input === 'string') {
      const mapped = idMap.get(input)
      if (mapped && mapped !== input) {
        repairedSources.add(ownerKey)
        return mapped
      }
      // Composite keys embed a record id inside a larger string (the article
      // family key is `content:<content-id>`); rewrite known id tokens too.
      if (input.length >= 36 && uuidToken.test(input)) {
        uuidToken.lastIndex = 0
        return input.replace(uuidToken, (token) => {
          const replacement = idMap.get(token)
          if (replacement && replacement !== token) {
            repairedSources.add(ownerKey)
            return replacement
          }
          return token
        })
      }
      return input
    }
    if (Array.isArray(input)) return input.map((item) => remapReferences(item, ownerKey))
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([field, item]) => [
          field,
          remapReferences(item, ownerKey),
        ]),
      )
    return input
  }
  const findImported = async (collection: string, sourceRecordId: string) =>
    (await portabilityPayload
      .findByID({
        collection,
        id: idMap.get(sourceRecordId) ?? sourceRecordId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)) as (Record<string, unknown> & { id: unknown }) | null
  const report = await importPortableManifest(
    remapped,
    {
      read: async (collection, id) =>
        collection === 'site-settings' ? null : ((await findImported(collection, id)) as never),
      write: async (collection, id, data) => {
        if (collection === 'site-settings') {
          await payload.updateGlobal({ slug: 'site-settings', data, overrideAccess: true })
          return 'updated'
        }
        let existing = await findImported(collection, id)
        if (existing && existing.site != null && String(existing.site) !== siteId)
          throw new Error(`ID conflict: ${collection}/${id} belongs to another site.`)
        if (collection === 'media-assets') {
          const media = manifest.media.find((entry) => entry.id === id)
          if (!media?.objectData)
            throw new Error(`Media payload is missing for media-assets/${id}.`)
          const originalLocation = String(data.storageLocation ?? '')
          const filename = originalLocation.split('/').pop()
          if (!filename)
            throw new Error(`Media storage location is invalid for media-assets/${id}.`)
          const location = `${siteId}/${filename}`
          await storage.put(
            location,
            Buffer.from(media.objectData, 'base64'),
            media.mimeType ?? 'application/octet-stream',
          )
          data = { ...data, storageLocation: location, storageProvider: storage.provider }
        }
        const remappedData = remapReferences(data, `${collection}/${id}`) as Record<string, unknown>
        if (collection === 'article-family-content') {
          const pointers: Record<string, unknown> = {}
          for (const field of ['currentRevision', 'latestPublishedRevision']) {
            if (typeof remappedData[field] === 'string') {
              pointers[field] = remappedData[field]
              remappedData[field] = null
            }
          }
          if (Object.keys(pointers).length) deferredPointers.set(`${collection}/${id}`, pointers)
        }
        if (!existing && collection === 'revision-records') {
          // The auto-provisioned article family already owns a revision at
          // each sequence (unique on article+sequence); the exported revision
          // adopts that row instead of colliding with it.
          const articleRef = remappedData.article
          const sequence = remappedData.sequence
          if (typeof articleRef === 'string' && typeof sequence === 'number') {
            const found = await payload.find({
              collection: 'revision-records',
              where: {
                article: { equals: articleRef },
                sequence: { equals: sequence },
              },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            existing = (found.docs[0] as typeof existing) ?? null
          }
        }
        if (!existing && collection === 'article-family-content') {
          // Creating a published content record auto-provisions its article
          // family (unique on the content relation). The exported family row
          // must adopt that provisioned row, not collide with it.
          const contentRef = remappedData.content
          if (typeof contentRef === 'string') {
            const found = await payload.find({
              collection: 'article-family-content',
              where: { content: { equals: contentRef } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            existing = (found.docs[0] as typeof existing) ?? null
          }
        }
        if (existing) {
          const updatedDoc = (await portabilityPayload.update({
            collection,
            id: String(existing.id),
            data: remappedData,
            overrideAccess: true,
          })) as { id: unknown }
          idMap.set(id, String(updatedDoc.id))
          return 'updated'
        }
        const createdDoc = (await portabilityPayload.create({
          collection,
          // The id is passed for collections whose adapter honors it; where
          // the adapter assigns its own id, idMap records the actual one.
          data: { id, ...remappedData },
          overrideAccess: true,
        })) as { id: unknown }
        idMap.set(id, String(createdDoc.id))
        return 'created'
      },
      reconcileMedia: async () => undefined,
      repairRelationships: async () => {
        for (const [ownerKey, pointers] of deferredPointers) {
          const separator = ownerKey.indexOf('/')
          const collection = ownerKey.slice(0, separator),
            sourceRecordId = ownerKey.slice(separator + 1),
            actualId = idMap.get(sourceRecordId)
          if (!actualId) continue
          await portabilityPayload.update({
            collection,
            id: actualId,
            data: remapReferences(pointers, ownerKey) as Record<string, unknown>,
            overrideAccess: true,
          })
          repairedSources.add(ownerKey)
        }
        return repairedSources.size
      },
    },
    {
      dryRun: !has('--apply'),
      checkpoint,
      runId: value('--run-id') ?? `portable-${manifest.createdAt}`,
    },
  )
  await writeFile(checkpointFile, `${JSON.stringify(report.checkpoint, null, 2)}\n`, {
    mode: 0o600,
  })
  console.log(JSON.stringify({ ...report, checkpointFile }, null, 2))
  if (report.failedRows.length || report.validationErrors.length) process.exitCode = 1
}

await payload.db.destroy?.()
// One-shot operator CLI: Payload initialization leaves background handles
// (pool/queue timers) that otherwise keep the process alive after the work
// is done. Exit explicitly, preserving the failure exit code set above —
// the same pattern as src/scripts/semantic-url-backfill.ts.
process.exit(process.exitCode ?? 0)
