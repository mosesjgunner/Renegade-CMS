import type { PayloadRegistrations } from './core/payload-domains'

/**
 * Progressive-module registry — the single place that decides WHICH collections
 * a Renegade install registers with Payload.
 *
 * Why this exists
 * ---------------
 * Every collection stays in the codebase. This file only controls what is handed
 * to `buildConfig`. A default install registers the lean CMS FLOOR (everything a
 * person needs to set up, log in, write and publish). Everything else lives in an
 * OPTIONAL MODULE that is OFF by default and switched on with a single env var:
 *
 *     RENEGADE_MODULES="commerce,newsletter,media-studio"
 *
 * The FLOOR is derived, not hand-listed: any registered collection/global/task
 * that no optional module claims is floor. That guarantees nothing is silently
 * dropped and no collection can belong to two modules (both are validated below).
 *
 * The PostgreSQL guard
 * --------------------
 * PostgreSQL caps a single function call at 100 arguments. Payload's built-in
 * "locked documents" dashboard query builds one `json_build_array(...)` with an
 * argument per registered collection, so registering ~120+ collections makes
 * `/admin` fail with a cryptic 500 (SQLSTATE 54023). Registering the floor keeps
 * the count far below that. `assertCollectionCountWithinLimit` turns the failure
 * into a loud, explanatory error at config-build time instead of a runtime 500.
 */

export type ModuleId =
  | 'collaboration'
  | 'community'
  | 'events'
  | 'sources'
  | 'media-studio'
  | 'social'
  | 'network'
  | 'integrations'
  | 'releases'
  | 'forms'
  | 'crm'
  | 'newsletter'
  | 'notifications'
  | 'analytics'
  | 'experiences'
  | 'quality'
  | 'commerce'

export type ModuleManifestEntry = {
  id: ModuleId
  title: string
  summary: string
  /** Collection slugs this module owns. Registered only when the module is enabled. */
  collections: readonly string[]
  /** Global slugs this module owns. */
  globals?: readonly string[]
  /** Task slugs this module owns. */
  tasks?: readonly string[]
}

/**
 * Optional modules, OFF by default. Slugs are the real collection/global/task
 * slugs (validated against the composed registration set at build time, so a
 * typo or a renamed collection fails loud rather than silently landing in floor).
 */
export const OPTIONAL_MODULES: readonly ModuleManifestEntry[] = [
  {
    id: 'collaboration',
    title: 'Team collaboration',
    summary: 'Team membership, editorial assignments and discussions, and realtime co-editing.',
    collections: [
      'team-memberships',
      'team-invitations',
      'team-audit-events',
      'editorial-assignments',
      'editorial-discussions',
      'editorial-comments',
      'work-conversations',
      'work-messages',
      'realtime-events',
      'realtime-presence',
    ],
  },
  {
    id: 'community',
    title: 'Community & forums',
    summary: 'Public forums, threaded discussions, and member relationship graph.',
    collections: ['relationships', 'forum-sections', 'forums', 'discussions', 'discussion-posts'],
  },
  {
    id: 'events',
    title: 'Events & calendars',
    summary: 'Events, timelines, and calendar entries with ICS output.',
    collections: ['events', 'timelines', 'timeline-memberships', 'calendar-entries'],
  },
  {
    id: 'sources',
    title: 'Research sources',
    summary: 'Citation sources and bibliography references for long-form articles.',
    collections: ['sources'],
  },
  {
    id: 'media-studio',
    title: 'Media studio',
    summary: 'Books, podcasts, video, graphics, photo albums, and the media processing pipeline.',
    collections: [
      'albums',
      'books',
      'book-parts',
      'book-chapters',
      'book-editions',
      'podcast-shows',
      'podcast-seasons',
      'podcast-episodes',
      'video-channels',
      'video-playlists',
      'videos',
      'interviews',
      'livestreams',
      'transcript-revisions',
      'media-jobs',
      'tts-outputs',
      'graphic-documents',
      'media-derivatives',
      'edit-sessions',
      'quick-capture-drafts',
    ],
    tasks: ['media-import', 'media-render', 'media-transcribe', 'media-tts'],
  },
  {
    id: 'social',
    title: 'Social distribution',
    summary: 'Social accounts, drafts, queues, and cross-network publishing.',
    collections: [
      'social-accounts',
      'social-drafts',
      'social-network-variants',
      'social-queue-items',
      'social-publish-attempts',
      'external-posts',
      'campaigns',
      'calendar-entry-audits',
    ],
    tasks: ['social-publish'],
  },
  {
    id: 'network',
    title: 'Federation (ActivityPub)',
    summary: 'Federated networking: remote actors, objects, and inbound/outbound delivery.',
    collections: [
      'network-signing-keys',
      'remote-instances',
      'remote-actors',
      'remote-objects',
      'network-relationships',
      'inbound-network-activities',
      'outbound-network-deliveries',
      'network-delivery-attempts',
      'network-access-decisions',
      'network-audit-events',
    ],
    globals: ['network-settings'],
    tasks: ['network-delivery'],
  },
  {
    id: 'integrations',
    title: 'Integrations & webhooks',
    summary: 'External API clients, request records, and webhook subscriptions/deliveries.',
    collections: [
      'api-clients',
      'api-request-records',
      'webhook-subscriptions',
      'webhook-deliveries',
      'integration-audit-events',
    ],
  },
  {
    id: 'releases',
    title: 'Content releases',
    summary: 'Staged, scheduled multi-document content releases.',
    collections: ['content-releases'],
    tasks: ['content-release-execute'],
  },
  {
    id: 'forms',
    title: 'Forms',
    summary: 'Public form definitions, schemas, submissions, and attachments.',
    collections: ['form-definitions', 'form-schemas', 'form-submissions', 'submission-attachments'],
  },
  {
    id: 'crm',
    title: 'CRM',
    summary: 'Contacts, organizations, deals, interactions, and pipeline workflow.',
    collections: [
      'contacts',
      'organizations',
      'relationship-records',
      'contact-tags',
      'contact-taggings',
      'interaction-records',
      'relationship-notes',
      'deals-opportunities',
      'owner-assignments',
      'next-actions',
      'workflow-items',
    ],
  },
  {
    id: 'newsletter',
    title: 'Newsletter & email',
    summary: 'Audience lists, subscribers, consent, and transactional/newsletter email delivery.',
    collections: [
      'audience-lists',
      'audience-segments',
      'audience-memberships',
      'subscriber-confirmation-tokens',
      'subscribers',
      'consent-events',
      'preferences',
      'suppressions',
      'email-messages',
      'delivery-identities',
      'email-deliveries',
      'delivery-receipts',
    ],
    tasks: ['audience-email-delivery', 'audience-newsletter-dispatch'],
  },
  {
    id: 'notifications',
    title: 'Notifications & digests',
    summary: 'Activity feeds, notifications, digests, and automation definitions.',
    collections: [
      'activity-events',
      'notifications',
      'notification-preferences',
      'notification-channels',
      'digest-definitions',
      'digest-runs',
      'automation-definitions',
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    summary: 'First-party analytics events, rollups, goals, and command-center preferences.',
    collections: [
      'analytics-events',
      'analytics-consent-records',
      'analytics-rollups',
      'metric-snapshots',
      'analytics-goals',
      'command-center-preferences',
    ],
    tasks: ['analytics-retention-cleanup'],
  },
  {
    id: 'experiences',
    title: 'Experiments & personalization',
    summary: 'Experience rules, A/B experiments, variants, and traffic allocation.',
    collections: [
      'experience-rules',
      'experience-variants',
      'experiments',
      'experiment-variants',
      'traffic-allocations',
      'experiment-assignments',
      'conversion-goals',
      'experiment-events',
      'experiment-analyses',
      'experiment-decisions',
    ],
  },
  {
    id: 'quality',
    title: 'Quality scanning',
    summary: 'Editorial quality policies, rules, scans, issues, and reports.',
    collections: [
      'quality-policies',
      'quality-rules',
      'quality-scans',
      'quality-issues',
      'quality-exceptions',
      'quality-waivers',
      'quality-reports',
    ],
    tasks: ['quality-scan'],
  },
  {
    id: 'commerce',
    title: 'Commerce',
    summary: 'Products, carts, checkout, orders, payments, supporters, and entitlements.',
    collections: [
      'merchant-connections',
      'payment-method-capabilities',
      'products',
      'carts',
      'checkout-sessions',
      'payment-intents',
      'orders',
      'payment-webhook-events',
      'supporters',
      'entitlements',
    ],
    tasks: ['commerce-abandon-checkouts'],
  },
] as const

const MODULE_IDS: ReadonlySet<string> = new Set(OPTIONAL_MODULES.map((entry) => entry.id))

/** PostgreSQL caps a single function call at 100 arguments. */
export const POSTGRES_FUNCTION_ARG_LIMIT = 100
/** Warn once the registered collection count approaches the hard limit. */
export const COLLECTION_WARN_THRESHOLD = 90

/**
 * Parse the enabled-module list from `RENEGADE_MODULES`.
 * - unset / empty      → floor only (no optional modules)
 * - "all"              → every optional module (used to regenerate the full-set
 *                        payload-types.ts / import map; exceeds the PG limit, so
 *                        it must be paired with the unsafe-count override)
 * - "a, b , c"         → those modules (whitespace-tolerant, case-insensitive)
 * Unknown ids throw a clear error listing the valid module ids.
 */
export function parseEnabledModules(raw: string | undefined): Set<ModuleId> {
  const value = (raw ?? '').trim()
  if (!value) return new Set()
  if (value.toLowerCase() === 'all') return new Set(OPTIONAL_MODULES.map((entry) => entry.id))

  const requested = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  const unknown = requested.filter((id) => !MODULE_IDS.has(id))
  if (unknown.length)
    throw new Error(
      `Unknown RENEGADE_MODULES entr${unknown.length === 1 ? 'y' : 'ies'}: ${unknown.join(', ')}. ` +
        `Valid modules: ${[...MODULE_IDS].sort().join(', ')}.`,
    )
  return new Set(requested as ModuleId[])
}

type OwnershipMaps = {
  collections: Map<string, ModuleId>
  globals: Map<string, ModuleId>
  tasks: Map<string, ModuleId>
}

function buildOwnership(): OwnershipMaps {
  const collections = new Map<string, ModuleId>()
  const globals = new Map<string, ModuleId>()
  const tasks = new Map<string, ModuleId>()
  for (const entry of OPTIONAL_MODULES) {
    for (const slug of entry.collections) {
      if (collections.has(slug))
        throw new Error(
          `Collection "${slug}" is claimed by both "${collections.get(slug)}" and "${entry.id}" modules.`,
        )
      collections.set(slug, entry.id)
    }
    for (const slug of entry.globals ?? []) {
      if (globals.has(slug))
        throw new Error(
          `Global "${slug}" is claimed by both "${globals.get(slug)}" and "${entry.id}" modules.`,
        )
      globals.set(slug, entry.id)
    }
    for (const slug of entry.tasks ?? []) {
      if (tasks.has(slug))
        throw new Error(
          `Task "${slug}" is claimed by both "${tasks.get(slug)}" and "${entry.id}" modules.`,
        )
      tasks.set(slug, entry.id)
    }
  }
  return { collections, globals, tasks }
}

export type GateOptions = {
  /** Enabled optional modules. */
  enabled: Set<ModuleId>
  /** Bypass the hard PostgreSQL count guard. Reserved for full-set artifact generation. */
  allowUnsafeCollectionCount?: boolean
  /** Injected for tests; defaults to console. */
  warn?: (message: string) => void
}

/**
 * Validate that every module slug actually exists in the composed registration
 * set. Catches typos and collections renamed out from under the manifest before
 * they can silently fall into floor. Called once against the full registrations.
 */
export function assertManifestMatchesRegistrations(full: PayloadRegistrations): void {
  const collectionSlugs = new Set(full.collections.map((collection) => collection.slug))
  const globalSlugs = new Set(full.globals.map((global) => global.slug))
  const taskSlugs = new Set(full.tasks.map((task) => task.slug))
  const missing: string[] = []
  for (const entry of OPTIONAL_MODULES) {
    for (const slug of entry.collections)
      if (!collectionSlugs.has(slug)) missing.push(`collection "${slug}" (module ${entry.id})`)
    for (const slug of entry.globals ?? [])
      if (!globalSlugs.has(slug)) missing.push(`global "${slug}" (module ${entry.id})`)
    for (const slug of entry.tasks ?? [])
      if (!taskSlugs.has(slug)) missing.push(`task "${slug}" (module ${entry.id})`)
  }
  if (missing.length)
    throw new Error(
      `module-registry is out of sync with the codebase. Unknown ${missing.join('; ')}. ` +
        `Update src/modules/module-registry.ts.`,
    )
}

/**
 * Fail loud before PostgreSQL's 100-argument limit turns into a cryptic /admin
 * 500. Throws above the hard limit; warns as the count approaches it.
 */
export function assertCollectionCountWithinLimit(
  count: number,
  options: Pick<GateOptions, 'allowUnsafeCollectionCount' | 'warn'> = {},
): void {
  const warn = options.warn ?? ((message: string) => console.warn(message))
  if (count >= POSTGRES_FUNCTION_ARG_LIMIT && !options.allowUnsafeCollectionCount)
    throw new Error(
      `Renegade is configured to register ${count} collections, at or beyond PostgreSQL's ` +
        `${POSTGRES_FUNCTION_ARG_LIMIT}-argument function limit. Payload's locked-documents ` +
        `dashboard query would fail at runtime with a cryptic 500 (SQLSTATE 54023). ` +
        `Enable fewer optional modules via RENEGADE_MODULES, or split the deployment.`,
    )
  if (count >= COLLECTION_WARN_THRESHOLD)
    warn(
      `[renegade] ${count} collections registered — approaching PostgreSQL's ` +
        `${POSTGRES_FUNCTION_ARG_LIMIT}-argument limit (warn threshold ${COLLECTION_WARN_THRESHOLD}). ` +
        `Consider disabling optional modules via RENEGADE_MODULES.`,
    )
}

/**
 * A registered target is any collection still in the registered set, plus
 * Payload's own internal collections (payload-jobs, payload-locked-documents,
 * payload-preferences, payload-migrations), which Payload always adds itself.
 */
function isRegisteredTarget(slug: string, registered: ReadonlySet<string>): boolean {
  return registered.has(slug) || slug.startsWith('payload-')
}

/**
 * Recursively rewrite a field tree so no relationship/upload field points at a
 * collection that is gated off. Payload's `buildConfig` hard-rejects a
 * relationship whose target is not registered (InvalidFieldRelationship), so a
 * floor collection that references an optional collection (e.g. media-assets ->
 * albums) would crash the whole config the moment that module is disabled.
 *
 * - Polymorphic relationship (relationTo: string[]): drop the missing targets,
 *   keeping the registered ones. If none remain, drop the field.
 * - Single-target relationship (relationTo: string): drop the field if its
 *   target is gated off.
 *
 * Fields are shallow-cloned only where something changed, so hook/validate/access
 * function references on untouched fields are preserved. The gated columns/tables
 * still exist in the database (migrations are unchanged); the field is merely not
 * surfaced at runtime, exactly like a gated collection's unused table.
 */
function pruneDanglingRelationships(fields: unknown[], registered: ReadonlySet<string>): unknown[] {
  const result: unknown[] = []
  for (const raw of fields) {
    const field = raw as Record<string, unknown>
    const type = field.type
    if ((type === 'relationship' || type === 'upload') && field.relationTo) {
      if (Array.isArray(field.relationTo)) {
        const kept = field.relationTo.filter((target: string) =>
          isRegisteredTarget(target, registered),
        )
        if (kept.length === 0) continue
        result.push(
          kept.length === field.relationTo.length ? field : { ...field, relationTo: kept },
        )
      } else if (isRegisteredTarget(field.relationTo as string, registered)) {
        result.push(field)
      }
      continue
    }

    let next = field
    if (Array.isArray(field.fields))
      next = { ...next, fields: pruneDanglingRelationships(field.fields, registered) }
    if (Array.isArray(field.blocks))
      next = {
        ...next,
        blocks: (field.blocks as Record<string, unknown>[]).map((block) => ({
          ...block,
          fields: pruneDanglingRelationships(block.fields as unknown[], registered),
        })),
      }
    if (Array.isArray(field.tabs))
      next = {
        ...next,
        tabs: (field.tabs as Record<string, unknown>[]).map((tab) => ({
          ...tab,
          fields: pruneDanglingRelationships(tab.fields as unknown[], registered),
        })),
      }
    result.push(next)
  }
  return result
}

function pruneEntityRelationships<T extends { fields?: unknown[] }>(
  entity: T,
  registered: ReadonlySet<string>,
): T {
  if (!Array.isArray(entity.fields)) return entity
  return { ...entity, fields: pruneDanglingRelationships(entity.fields, registered) }
}

/**
 * Filter the full, order-preserved registrations down to floor + enabled modules.
 * Floor is everything no optional module owns. Order is preserved because we
 * filter the already-ordered arrays rather than rebuilding them. After filtering,
 * relationship fields that point at gated-off collections are pruned so Payload's
 * config builder does not reject the (now dangling) relationships.
 */
export function gatePayloadRegistrations(
  full: PayloadRegistrations,
  options: GateOptions,
): PayloadRegistrations {
  assertManifestMatchesRegistrations(full)
  const ownership = buildOwnership()
  const { enabled } = options

  const keep = (owner: ModuleId | undefined): boolean => owner === undefined || enabled.has(owner)

  const selectedCollections = full.collections.filter((collection) =>
    keep(ownership.collections.get(collection.slug)),
  )
  const globals = full.globals.filter((global) => keep(ownership.globals.get(global.slug)))
  const tasks = full.tasks.filter((task) => keep(ownership.tasks.get(task.slug)))

  assertCollectionCountWithinLimit(selectedCollections.length, options)

  const registeredSlugs = new Set(selectedCollections.map((collection) => collection.slug))
  const collections = selectedCollections.map((collection) =>
    pruneEntityRelationships(collection, registeredSlugs),
  )
  const prunedGlobals = globals.map((global) => pruneEntityRelationships(global, registeredSlugs))

  return { collections, globals: prunedGlobals, tasks }
}

/** Collection slugs that make up the always-on floor (owned by no optional module). */
export function floorCollectionSlugs(full: PayloadRegistrations): string[] {
  const owned = buildOwnership().collections
  return full.collections.map((c) => c.slug).filter((slug) => !owned.has(slug))
}
