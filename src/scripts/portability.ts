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
  type PortabilityCheckpoint,
} from '../modules/portability/workflow'

const args = process.argv.slice(2)
const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const has = (name: string) => args.includes(name)
const command = args[0],
  file = value('--file'),
  key = value('--key')
if (!['export', 'import'].includes(command ?? '') || !file || !key)
  throw new Error(
    'Usage: portability <export|import> --file <archive.json> --key <64-hex-character-key> [--apply] [--checkpoint <file>]',
  )
if (!/^[a-fA-F0-9]{64}$/.test(key))
  throw new Error('--key must be a separately-held 32-byte hex key.')
const encryptionKey = Buffer.from(key, 'hex'),
  payload = await getPayload({ config })
const portabilityPayload = payload as unknown as {
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
  create: (args: Record<string, unknown>) => Promise<unknown>
}
if (command === 'export') {
  const records: { collection: string; id: string; data: Record<string, unknown> }[] = []
  for (const collection of PORTABLE_COLLECTIONS) {
    if (collection === 'site-settings') {
      records.push({
        collection,
        id: 'default',
        data: (await payload.findGlobal({
          slug: 'site-settings',
          overrideAccess: true,
        })) as unknown as Record<string, unknown>,
      })
      continue
    }
    const docs = await payload.find({
      collection: collection as never,
      limit: 0,
      depth: 0,
      overrideAccess: true,
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
  const manifest = createPortableManifest({
    createdAt: new Date().toISOString(),
    records,
    media: [],
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
  const checkpointFile = path.resolve(value('--checkpoint') ?? `${file}.checkpoint.json`)
  const checkpoint = has('--resume')
    ? (JSON.parse(await readFile(checkpointFile, 'utf8')) as PortabilityCheckpoint)
    : undefined
  const report = await importPortableManifest(
    manifest,
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
