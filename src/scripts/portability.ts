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
  PORTABLE_COLLECTIONS,
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
  const records: { collection: string; id: string; data: Record<string, unknown> }[] = []
  const sourceSite = (await portabilityPayload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })) as Record<string, unknown>
  if (!sourceSite) throw new Error(`Source site was not found: ${siteId}`)
  const {
    id: sourceId,
    createdAt: sourceCreatedAt,
    updatedAt: sourceUpdatedAt,
    ...sourceData
  } = sourceSite
  records.push({
    collection: 'sites',
    id: String(sourceId),
    data: {
      ...sourceData,
      _portableTimestamps: { createdAt: sourceCreatedAt, updatedAt: sourceUpdatedAt },
    },
  })
  for (const collection of PORTABLE_COLLECTIONS) {
    if (collection === 'sites' || collection === 'site-settings') continue
    const docs = await payload.find({
      collection: collection as never,
      limit: 0,
      depth: 0,
      overrideAccess: true,
      where: { site: { equals: siteId } },
    })
    for (const doc of docs.docs) {
      const { id, createdAt, updatedAt, ...data } = doc as Record<string, unknown>
      records.push({
        collection,
        id: String(id),
        data: { ...data, _portableTimestamps: { createdAt, updatedAt } },
      })
    }
  }
  const media = await Promise.all(
    records
      .filter((record) => record.collection === 'media-assets')
      .map(async (record) => {
        const location = String(record.data.storageLocation ?? '')
        const bytes = location ? await storage.get(location) : undefined
        if (!bytes) throw new Error(`Media object is missing for media-assets/${record.id}.`)
        return {
          id: record.id,
          originalChecksum: String(record.data.checksum ?? ''),
          derivativeChecksums: [],
          encryptedBlobChecksum: null,
          objectData: Buffer.from(bytes).toString('base64'),
          mimeType: typeof record.data.mimeType === 'string' ? record.data.mimeType : undefined,
        }
      }),
  )
  const manifest = createPortableManifest({
    createdAt: new Date().toISOString(),
    records,
    media,
  })
  await writeFile(
    path.resolve(file),
    `${JSON.stringify(createPortableArchive(manifest, encryptionKey), null, 2)}\n`,
    { mode: 0o600 },
  )
  console.log(
    JSON.stringify(
      { state: 'completed', records: records.length, file: path.resolve(file) },
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
  const report = await importPortableManifest(
    remapped,
    {
      read: async (collection, id) =>
        collection === 'site-settings'
          ? null
          : ((await portabilityPayload
              .findByID({ collection, id, depth: 0, overrideAccess: true })
              .catch(() => null)) as Record<string, unknown> | null),
      write: async (collection, id, data) => {
        if (collection === 'site-settings') {
          await payload.updateGlobal({ slug: 'site-settings', data, overrideAccess: true })
          return 'updated'
        }
        const existing = await portabilityPayload
          .findByID({ collection, id, depth: 0, overrideAccess: true })
          .catch(() => null)
        if (existing && String((existing as Record<string, unknown>).site ?? '') !== siteId)
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
        if (existing) {
          await portabilityPayload.update({ collection, id, data, overrideAccess: true })
          return 'updated'
        }
        await portabilityPayload.create({ collection, data: { id, ...data }, overrideAccess: true })
        return 'created'
      },
      reconcileMedia: async () => undefined,
      repairRelationships: async () => 0,
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
