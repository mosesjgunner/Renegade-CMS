import type { Payload, Where } from 'payload'
import { createPortableManifest, type PortableRecord } from './contracts'
import { PORTABLE_COLLECTIONS } from './workflow'
import { loadConfig } from '../core/config'
import { mediaStorage } from '../media/storage'

/** Content portability: direct site records and referenced publishing history.
 * Global identities and unrelated tenants are never exported by scanning them.
 */
export async function exportPortableSite(payload: Payload, siteId: string) {
  const records: PortableRecord[] = []
  const add = (collection: string, docs: unknown[]) => {
    for (const doc of docs) {
      const { id, createdAt, updatedAt, ...data } = doc as Record<string, unknown>
      records.push({
        collection,
        id: String(id),
        data: {
          ...data,
          _portableTimestamps: { createdAt, updatedAt },
        },
      })
    }
  }
  add('sites', [
    await payload.findByID({ collection: 'sites', id: siteId, depth: 0, overrideAccess: true }),
  ])
  const omitted: string[] = []
  const related: Record<string, string> = {
    'article-family-content': 'content.site',
    'revision-records': 'article.content.site',
    'media-usages': 'asset.site',
  }
  const query = async (collection: string, where: Where) => {
    const found = await payload.find({
      collection: collection as never,
      where,
      depth: 0,
      pagination: false,
      limit: 0,
      overrideAccess: true,
    })
    add(collection, found.docs)
  }
  for (const collection of PORTABLE_COLLECTIONS) {
    if (collection === 'sites') continue
    const config = payload.collections[collection as keyof typeof payload.collections]?.config
    if (!config) {
      omitted.push(collection)
      continue
    }
    const hasSite = config.flattenedFields.some((field) => 'name' in field && field.name === 'site')
    const sitePath = hasSite ? 'site' : related[collection]
    if (!sitePath) {
      omitted.push(collection)
      continue
    }
    await query(collection, { [sitePath]: { equals: siteId } })
  }
  const authorIds = new Set(
    records
      .filter((record) => record.collection === 'content')
      .flatMap((record) => (record.data.authors as { author: string }[] | undefined) ?? [])
      .map((row) => row.author),
  )
  if (authorIds.size) await query('authors', { id: { in: [...authorIds] } })
  const storage = mediaStorage(loadConfig())
  const media = await Promise.all(
    records
      .filter((record) => record.collection === 'media-assets')
      .map(async (record) => {
        const bytes = await storage.get(String(record.data.storageLocation))
        if (!bytes) throw new Error(`Original media bytes missing: media-assets/${record.id}`)
        return {
          id: record.id,
          originalChecksum: String(record.data.checksum),
          derivativeChecksums: [],
          encryptedBlobChecksum: null,
          objectData: Buffer.from(bytes).toString('base64'),
          mimeType: String(record.data.mimeType),
        }
      }),
  )
  const manifest = createPortableManifest({ createdAt: new Date().toISOString(), records, media })
  return {
    ...manifest,
    transferNotes: [
      ...manifest.transferNotes,
      'Content export includes original media bytes; derivative objects must be regenerated.',
      `Global, unregistered or unsupported collections omitted: ${omitted.filter((name) => name !== 'authors').join(', ')}.`,
      'This archive is content portability, not a complete installation backup.',
    ],
  }
}
