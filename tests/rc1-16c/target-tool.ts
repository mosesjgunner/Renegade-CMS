/* eslint-disable @typescript-eslint/no-explicit-any -- disposable target-database helper for the 16C harness */
/**
 * RC1 16C target-database tool. Runs against whichever DATABASE_URL /
 * MEDIA_DIR the caller puts in its environment (the journey points it at
 * the disposable rc116c_target_release_acceptance database and its media root).
 *
 * Commands:
 *   ensure-site <slug> <name>            -> { id } of the site (created if absent)
 *   snapshot <siteId>                    -> { collection: [{ id, data }] } for portable collections
 *   create-content-conflict <id> <siteId> -> creates a draft content row with an explicit id
 *   export-manifest <siteId>             -> portable manifest JSON (operator export path)
 *   media-sha <storageLocation>          -> { sha256 } of stored bytes or { missing: true }
 */
import { createHash } from 'node:crypto'
import { getPayload } from 'payload'
import config from '@payload-config'

import { PORTABLE_COLLECTIONS } from '../../src/modules/portability/workflow'
import { exportPortableSite } from '../../src/modules/portability/site-export'
import { mediaStorage } from '../../src/modules/media/storage'
import { loadConfig } from '../../src/modules/core/config'

const [command, ...args] = process.argv.slice(2)
const payload: any = await getPayload({ config })
const out = (value: unknown) => console.log(JSON.stringify(value))

if (command === 'ensure-site') {
  const [slug, name] = args
  const found = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const site =
    found.docs[0] ??
    (await payload.create({
      collection: 'sites',
      data: { name, slug, lifecycle: 'active' },
      overrideAccess: true,
    }))
  out({ id: String(site.id) })
} else if (command === 'snapshot') {
  const [siteId] = args
  const snapshot: Record<string, { id: string; data: Record<string, unknown> }[]> = {}
  for (const collection of PORTABLE_COLLECTIONS) {
    if (!payload.collections[collection]) continue
    const where = collection === 'sites' ? { id: { equals: siteId } } : { site: { equals: siteId } }
    const found = await payload
      .find({ collection, where, depth: 0, pagination: false, limit: 0, overrideAccess: true })
      .catch(() => ({ docs: [] }))
    if (found.docs.length) {
      snapshot[collection] = found.docs.map((doc: any) => {
        const { id, createdAt, updatedAt, ...data } = doc
        return { id: String(id), data }
      })
    }
  }
  out(snapshot)
} else if (command === 'create-content-conflict') {
  // Payload create cannot assign record ids (the adapter generates them), so
  // a pre-existing row with an exact colliding id — e.g. from an earlier
  // SQL-level restore in a shared database — is planted with raw SQL.
  const [id, siteId] = args
  const { sql } = await import('drizzle-orm')
  await payload.db.drizzle.execute(sql`
    INSERT INTO content (id, site_id, content_type, title, slug, canonical_path, status)
    VALUES (${id}, ${siteId}, 'article', '16C Conflict Holder', '16c-conflict-holder',
      '/articles/16c-conflict-holder', 'draft')
  `)
  out({ id })
} else if (command === 'export-manifest') {
  const [siteId] = args
  out(await exportPortableSite(payload, siteId))
} else if (command === 'media-sha') {
  const [location] = args
  const bytes = await mediaStorage(loadConfig()).get(location)
  out(
    bytes
      ? { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
      : { missing: true },
  )
} else {
  throw new Error(`Unknown target-tool command: ${command}`)
}

await payload.db.destroy?.()
// Payload init leaves background handles alive; a one-shot tool must exit
// explicitly (same lesson as the src/scripts/portability.ts fix in 16C).
process.exit(0)
