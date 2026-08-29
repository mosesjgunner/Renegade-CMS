import type { CollectionConfig, GlobalConfig } from 'payload'

import type { CapabilityLifecycle } from '../core/capabilities'
import type { OperationsDiagnostics } from '../operations/diagnostics'

/**
 * These are presentation categories only. They deliberately do not participate
 * in Payload access checks or unregister a collection from the API/schema.
 */
export const CORE_COLLECTIONS = new Set([
  'users',
  'sites',
  'brands',
  'authors',
  'publications',
  'content',
  'page-layouts',
  'media-assets',
  'sections',
  'categories',
  'topics',
  'tags',
  'discussions',
  'discussion-posts',
  'subscribers',
  'contacts',
  'form-definitions',
  'form-submissions',
])

export function applyProgressiveDisclosure(
  collections: readonly CollectionConfig[],
): CollectionConfig[] {
  return collections.map((collection) => {
    if (CORE_COLLECTIONS.has(collection.slug) || collection.admin?.hidden) return collection
    return { ...collection, admin: { ...collection.admin, hidden: true } }
  })
}

export function applyCoreGlobalGroups(globals: readonly GlobalConfig[]): GlobalConfig[] {
  return globals.map((global) =>
    global.slug === 'site-settings'
      ? { ...global, admin: { ...global.admin, group: 'Settings' } }
      : global,
  )
}

export type CapabilityPresentationState = 'disabled' | 'setup required' | 'healthy' | 'degraded'

export function capabilityPresentationState(
  capability: Pick<CapabilityLifecycle, 'status'>,
): CapabilityPresentationState {
  if (capability.status === 'disabled' || capability.status === 'unavailable') return 'disabled'
  if (capability.status === 'configuring' || capability.status === 'misconfigured')
    return 'setup required'
  if (capability.status === 'degraded') return 'degraded'
  return 'healthy'
}

export function operationalOverview(diagnostics: OperationsDiagnostics) {
  return [
    ['Database', diagnostics.database.status],
    ['Worker', diagnostics.worker.status],
    ['Failed jobs', diagnostics.jobs.failed ? `${diagnostics.jobs.failed} failed` : 'healthy'],
    ['Email', diagnostics.email.status],
    ['Backup', diagnostics.backup.status],
    [
      'Optional systems',
      diagnostics.capabilities.some(
        (capability) => capabilityPresentationState(capability) === 'degraded',
      )
        ? 'degraded'
        : 'healthy',
    ],
  ] as const
}
