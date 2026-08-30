import type {
  ImportAdapterKey,
  ImportCheckpoint,
  PortableManifest,
  PortableRecord,
} from './contracts'
import { checksum, deterministicImportId, validatePortableManifest } from './contracts'

/** Collections that describe a site and can safely cross an installation boundary. */
export const PORTABLE_COLLECTIONS = [
  'sites',
  'brands',
  'members',
  'profiles',
  'spaces',
  'authors',
  'publications',
  'relationships',
  'page-layouts',
  'sections',
  'categories',
  'tags',
  'taxonomy-redirects',
  'content',
  'article-family-content',
  'revision-records',
  'events',
  'timelines',
  'timeline-memberships',
  'sources',
  'albums',
  'media-assets',
  'media-usages',
  'forum-sections',
  'forums',
  'discussions',
  'discussion-posts',
  'calendar-entries',
  'products',
  'product-variants',
  'product-categories',
  'inventory-items',
  'site-settings',
] as const
export type PortableCollection = (typeof PORTABLE_COLLECTIONS)[number]
export const isPortableCollection = (value: string): value is PortableCollection =>
  (PORTABLE_COLLECTIONS as readonly string[]).includes(value)

export type FailedRow = { sourceId: string; collection: string; message: string }
export type PortabilityCheckpoint = ImportCheckpoint & {
  failedRows: readonly FailedRow[]
  completedAt?: string
}
export type ImportExecutionReport = {
  adapter: ImportAdapterKey
  dryRun: boolean
  created: number
  updated: number
  skipped: number
  mediaReconciled: number
  redirects: number
  relationshipRepairs: number
  checkpoint: PortabilityCheckpoint
  failedRows: readonly FailedRow[]
  validationErrors: readonly string[]
}
/** Small persistence boundary, usable by Payload and integration-test fakes. */
export interface PortableStore {
  read(collection: string, id: string): Promise<Record<string, unknown> | null>
  write(
    collection: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<'created' | 'updated'>
  reconcileMedia?(record: PortableRecord): Promise<void>
  repairRelationships?(records: readonly PortableRecord[]): Promise<number>
}
const redirectRecord = (record: PortableRecord) =>
  record.collection === 'taxonomy-redirects' ||
  (typeof record.data.legacyUrl === 'string' && typeof record.data.canonicalPath === 'string')

export async function importPortableManifest(
  manifest: PortableManifest,
  store: PortableStore,
  options: { dryRun?: boolean; checkpoint?: PortabilityCheckpoint; runId: string },
): Promise<ImportExecutionReport> {
  validatePortableManifest(manifest)
  const dryRun = options.dryRun ?? true,
    sourceChecksum = checksum(manifest.records),
    prior = options.checkpoint
  if (prior && prior.sourceChecksum !== sourceChecksum)
    throw new Error('Checkpoint belongs to different portable archive contents.')
  const completed = new Set(prior?.completedSourceIds ?? []),
    failedRows: FailedRow[] = [...(prior?.failedRows ?? [])]
  let created = 0,
    updated = 0,
    skipped = 0,
    mediaReconciled = 0,
    redirects = 0
  const validationErrors: string[] = []
  for (const record of manifest.records) {
    const sourceId = `${record.collection}/${record.id}`
    if (!isPortableCollection(record.collection)) {
      validationErrors.push(`Unsupported portable collection: ${record.collection}`)
      failedRows.push({
        sourceId,
        collection: record.collection,
        message: 'Unsupported collection.',
      })
      continue
    }
    if (completed.has(sourceId)) {
      skipped++
      continue
    }
    try {
      if (!dryRun) {
        const existing = await store.read(record.collection, record.id),
          outcome = await store.write(record.collection, record.id, record.data)
        if (existing || outcome === 'updated') updated++
        else created++
        if (record.collection === 'media-assets') {
          await store.reconcileMedia?.(record)
          mediaReconciled++
        }
      }
      if (redirectRecord(record)) redirects++
      completed.add(sourceId)
    } catch (error) {
      failedRows.push({
        sourceId,
        collection: record.collection,
        message: error instanceof Error ? error.message : 'Unknown import error.',
      })
    }
  }
  const relationshipRepairs =
    dryRun || failedRows.length ? 0 : ((await store.repairRelationships?.(manifest.records)) ?? 0)
  return {
    adapter: 'json-csv',
    dryRun,
    created,
    updated,
    skipped,
    mediaReconciled,
    redirects,
    relationshipRepairs,
    failedRows,
    validationErrors,
    checkpoint: {
      runId: options.runId,
      sourceChecksum,
      frameworkVersion: 1,
      completedSourceIds: [...completed].sort(),
      failedRows,
      ...(dryRun || failedRows.length ? {} : { completedAt: new Date().toISOString() }),
    },
  }
}
export function portableIdentityMap(manifest: PortableManifest): Record<string, string> {
  return Object.fromEntries(
    manifest.records.map((record) => [
      `${record.collection}/${record.id}`,
      deterministicImportId('json-csv', `${record.collection}/${record.id}`),
    ]),
  )
}
