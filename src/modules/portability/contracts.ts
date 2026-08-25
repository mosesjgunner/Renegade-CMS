import { createHash } from 'node:crypto'

/** Versioned, lawful-export-only M15 portability interchange boundary. */
export const PORTABILITY_FORMAT_VERSION = 1
export const IMPORT_FRAMEWORK_VERSION = 1

export type ImportAdapterKey =
  | 'markdown'
  | 'rss'
  | 'json-csv'
  | 'wordpress-export'
  | 'wordpress-api'
  | 'ghost-export'
  | 'medium-export'
  | 'substack-export'
  | 'podcast-rss'
  | 'youtube-export'
  | 'event-timeline-map'
  | 'legacy-cms-map'
  | 'phpbb-export'
  | 'bbpress-export'
  | 'discourse-export'
export type ImportAdapter = {
  key: ImportAdapterKey
  version: number
  acceptedInputs: readonly string[]
  access: 'local-export' | 'authorized-api' | 'feed'
  status: 'implemented-contract' | 'requires-source-fixture'
  preserves: readonly string[]
  limitations: readonly string[]
}
export const IMPORT_ADAPTERS: readonly ImportAdapter[] = [
  {
    key: 'markdown',
    version: 1,
    acceptedInputs: ['.md', '.markdown'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['content', 'frontmatter', 'slug'],
    limitations: ['unsupported Markdown extensions are reported'],
  },
  {
    key: 'rss',
    version: 1,
    acceptedInputs: ['RSS 2.0', 'Atom'],
    access: 'feed',
    status: 'implemented-contract',
    preserves: ['entries', 'dates', 'enclosures'],
    limitations: ['feed-only fields are reported'],
  },
  {
    key: 'json-csv',
    version: 1,
    acceptedInputs: ['.json', '.csv'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['mapped records', 'source rows'],
    limitations: ['mapping and identity review are required'],
  },
  {
    key: 'wordpress-export',
    version: 1,
    acceptedInputs: ['WXR XML'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['posts', 'pages', 'authors', 'taxonomy', 'comments', 'attachments'],
    limitations: ['plugin/shortcode behavior is not imported'],
  },
  {
    key: 'wordpress-api',
    version: 1,
    acceptedInputs: ['authorized WP REST API'],
    access: 'authorized-api',
    status: 'requires-source-fixture',
    preserves: ['public API records'],
    limitations: ['requires source authorization; no access-control bypass'],
  },
  {
    key: 'ghost-export',
    version: 1,
    acceptedInputs: ['Ghost JSON export'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['posts', 'tags', 'authors'],
    limitations: ['theme code requires conversion review'],
  },
  {
    key: 'medium-export',
    version: 1,
    acceptedInputs: ['authorized Medium export'],
    access: 'local-export',
    status: 'requires-source-fixture',
    preserves: ['exported stories'],
    limitations: ['only user-supplied lawful exports'],
  },
  {
    key: 'substack-export',
    version: 1,
    acceptedInputs: ['authorized Substack export'],
    access: 'local-export',
    status: 'requires-source-fixture',
    preserves: ['exported posts and subscribers'],
    limitations: ['consent review is mandatory'],
  },
  {
    key: 'podcast-rss',
    version: 1,
    acceptedInputs: ['podcast RSS'],
    access: 'feed',
    status: 'implemented-contract',
    preserves: ['episodes', 'dates', 'enclosures'],
    limitations: ['remote media requires transfer verification'],
  },
  {
    key: 'youtube-export',
    version: 1,
    acceptedInputs: ['existing authorized YouTube adapter output'],
    access: 'authorized-api',
    status: 'requires-source-fixture',
    preserves: ['videos', 'captions when exported'],
    limitations: ['uses the existing media adapter boundary'],
  },
  {
    key: 'event-timeline-map',
    version: 1,
    acceptedInputs: ['.csv', '.json'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['events', 'date ranges', 'memberships', 'manual order'],
    limitations: ['unmapped source fields are reported'],
  },
  {
    key: 'legacy-cms-map',
    version: 1,
    acceptedInputs: ['documented database/export map'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['declared mapped fields'],
    limitations: ['requires an explicit source mapping document'],
  },
  {
    key: 'phpbb-export',
    version: 1,
    acceptedInputs: ['authorized phpBB database/export'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['forum hierarchy', 'threads', 'posts', 'quotes', 'attachments'],
    limitations: ['extension-specific fields are reported'],
  },
  {
    key: 'bbpress-export',
    version: 1,
    acceptedInputs: ['WordPress/bbPress export'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['forums', 'topics', 'replies'],
    limitations: ['plugin fields are reported'],
  },
  {
    key: 'discourse-export',
    version: 1,
    acceptedInputs: ['official Discourse export'],
    access: 'local-export',
    status: 'implemented-contract',
    preserves: ['categories', 'topics', 'posts', 'users'],
    limitations: ['only official supplied exports are accepted'],
  },
]
export type SourceRecord = {
  sourceId: string
  kind: string
  payload: Record<string, unknown>
  checksum?: string
}
export type ImportDiscovery = {
  adapter: ImportAdapterKey
  sourceChecksum: string
  records: readonly SourceRecord[]
  mediaReferences: readonly string[]
  warnings: readonly string[]
}
export type FieldMapping = {
  source: string
  target: string
  transform: 'copy' | 'date' | 'slug' | 'identity' | 'markdown'
  required?: boolean
}
export type MappingPreview = {
  adapter: ImportAdapterKey
  mappings: readonly FieldMapping[]
  sample: readonly Record<string, unknown>[]
  unmappedSourceFields: readonly string[]
  identityReviewRequired: boolean
  consentReviewRequired: boolean
  financialReviewRequired: boolean
}
export type ImportWarning = { code: string; sourceId: string | null; message: string }
export type ImportError = ImportWarning & { severity: 'error' }
export type RedirectOutput = {
  fromPath: string
  toPath: string
  status: 301 | 302
  sourceId: string
}
export type ImportCheckpoint = {
  runId: string
  completedSourceIds: readonly string[]
  sourceChecksum: string
  frameworkVersion: number
}
export type ImportPlan = {
  runId: string
  adapter: ImportAdapterKey
  discovery: ImportDiscovery
  mapping: MappingPreview
  dryRun: boolean
  allowMarketingEnrollment: false
  allowFinancialFinalization: false
  rollbackBoundary: 'created-by-run-only'
}
export type ImportResult = {
  completed: number
  total: number
  resumed: boolean
  state: 'dry-run' | 'completed' | 'failed'
  checkpoint: ImportCheckpoint
  deterministicIds: Record<string, string>
  warnings: ImportWarning[]
  errors: ImportError[]
  redirects: RedirectOutput[]
  unsupportedFields: readonly string[]
}
const canonical = (value: unknown): string =>
  value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonical).join(',')}]`
      : `{${Object.keys(value as Record<string, unknown>)
          .sort()
          .map(
            (key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
          )
          .join(',')}}`
export const checksum = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
export const deterministicImportId = (adapter: ImportAdapterKey, sourceId: string) =>
  `imp_${createHash('sha256').update(`${IMPORT_FRAMEWORK_VERSION}:${adapter}:${sourceId}`).digest('hex').slice(0, 32)}`
export function discoverImport(
  adapter: ImportAdapterKey,
  records: readonly SourceRecord[],
  mediaReferences: readonly string[] = [],
): ImportDiscovery {
  if (!IMPORT_ADAPTERS.some((candidate) => candidate.key === adapter))
    throw new Error('Unknown import adapter.')
  if (records.some((record) => !record.sourceId || !record.kind))
    throw new Error('Each imported record needs a stable source ID and kind.')
  return { adapter, sourceChecksum: checksum(records), records, mediaReferences, warnings: [] }
}
export function previewMapping(
  input: Omit<MappingPreview, 'sample' | 'unmappedSourceFields'> & {
    records: readonly SourceRecord[]
  },
): MappingPreview {
  const fields = new Set(input.records.flatMap((record) => Object.keys(record.payload)))
  const mapped = new Set(input.mappings.map((mapping) => mapping.source))
  return {
    ...input,
    sample: input.records.slice(0, 5).map((record) => record.payload),
    unmappedSourceFields: [...fields].filter((field) => !mapped.has(field)).sort(),
  }
}
export function validateImportPlan(plan: ImportPlan): ImportError[] {
  const errors: ImportError[] = []
  if (plan.allowMarketingEnrollment !== false)
    errors.push({
      severity: 'error',
      code: 'import.marketing_enrollment_forbidden',
      sourceId: null,
      message: 'Imports never silently enroll a person in marketing.',
    })
  if (plan.allowFinancialFinalization !== false)
    errors.push({
      severity: 'error',
      code: 'import.financial_finalization_forbidden',
      sourceId: null,
      message: 'Imports never silently finalize financial records or processor mandates.',
    })
  if (
    !plan.dryRun &&
    (plan.mapping.consentReviewRequired ||
      plan.mapping.financialReviewRequired ||
      plan.mapping.identityReviewRequired)
  )
    errors.push({
      severity: 'error',
      code: 'import.review_required',
      sourceId: null,
      message:
        'Identity, consent, and financial mappings require an explicit reviewed run after dry run.',
    })
  return errors
}
export function executeImport(plan: ImportPlan, prior?: ImportCheckpoint): ImportResult {
  const errors = validateImportPlan(plan)
  const resumed =
    prior?.sourceChecksum === plan.discovery.sourceChecksum &&
    prior.frameworkVersion === IMPORT_FRAMEWORK_VERSION
  const done = new Set(resumed ? prior.completedSourceIds : [])
  const deterministicIds: Record<string, string> = {}
  const redirects: RedirectOutput[] = []
  for (const record of plan.discovery.records) {
    deterministicIds[record.sourceId] = deterministicImportId(plan.adapter, record.sourceId)
    if (!plan.dryRun) done.add(record.sourceId)
    const { legacyUrl, canonicalPath } = record.payload
    if (
      typeof legacyUrl === 'string' &&
      typeof canonicalPath === 'string' &&
      legacyUrl !== canonicalPath
    )
      redirects.push({
        fromPath: legacyUrl,
        toPath: canonicalPath,
        status: 301,
        sourceId: record.sourceId,
      })
  }
  const warnings = plan.mapping.unmappedSourceFields.map((field) => ({
    code: 'import.unsupported_field',
    sourceId: null,
    message: `Unmapped source field: ${field}`,
  }))
  return {
    completed: plan.dryRun ? 0 : done.size,
    total: plan.discovery.records.length,
    resumed,
    state: errors.length ? 'failed' : plan.dryRun ? 'dry-run' : 'completed',
    checkpoint: {
      runId: plan.runId,
      completedSourceIds: [...done].sort(),
      sourceChecksum: plan.discovery.sourceChecksum,
      frameworkVersion: IMPORT_FRAMEWORK_VERSION,
    },
    deterministicIds,
    warnings,
    errors,
    redirects,
    unsupportedFields: plan.mapping.unmappedSourceFields,
  }
}
export type MediaManifestEntry = {
  id: string
  originalChecksum: string
  derivativeChecksums: readonly string[]
  encryptedBlobChecksum: string | null
}
export type PortableRecord = { collection: string; id: string; data: Record<string, unknown> }
export type PortableManifest = {
  format: 'renegade-portable-export'
  version: number
  createdAt: string
  records: readonly PortableRecord[]
  media: readonly MediaManifestEntry[]
  checksums: Record<string, string>
  exclusions: readonly string[]
  transferNotes: readonly string[]
}
const forbiddenPortableKey =
  /(^|_)(secret|token|password|private.?key|recovery.?key|seed.?phrase|card.?number|oauth)(_|$)/i
const containsForbiddenPortableMaterial = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenPortableMaterial)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => forbiddenPortableKey.test(key) || containsForbiddenPortableMaterial(nested),
  )
}
export function createPortableManifest(
  input: Omit<
    PortableManifest,
    'format' | 'version' | 'checksums' | 'exclusions' | 'transferNotes'
  >,
): PortableManifest {
  for (const record of input.records)
    if (containsForbiddenPortableMaterial(record.data))
      throw new Error(
        `Portable export refuses secret material in ${record.collection}/${record.id}.`,
      )
  const checksums = Object.fromEntries(
    input.records.map((record) => [`${record.collection}/${record.id}`, checksum(record.data)]),
  )
  for (const media of input.media) checksums[`media/${media.id}`] = checksum(media)
  return {
    ...input,
    format: 'renegade-portable-export',
    version: PORTABILITY_FORMAT_VERSION,
    checksums,
    exclusions: [
      'OAuth tokens',
      'passkey private material',
      'message private/recovery keys unless separately member-encrypted',
      'wallet private keys',
      'raw payment credentials',
      'provider secrets',
    ],
    transferNotes: [
      'Processor billing mandates and external fulfillment accounts may not transfer automatically.',
      'Optional Neo4j/graph projections are rebuildable and are not canonical.',
      'Canonical Events and Timelines transfer.',
    ],
  }
}
export function validatePortableManifest(manifest: PortableManifest): void {
  if (
    manifest.format !== 'renegade-portable-export' ||
    manifest.version !== PORTABILITY_FORMAT_VERSION
  )
    throw new Error('Unsupported portable manifest version.')
  for (const record of manifest.records)
    if (manifest.checksums[`${record.collection}/${record.id}`] !== checksum(record.data))
      throw new Error(`Checksum mismatch for ${record.collection}/${record.id}.`)
}
export type TemplateInventory = {
  files: readonly string[]
  assets: readonly string[]
  recognizableRegions: readonly string[]
  unconvertibleCode: readonly string[]
}
export type TemplateConversionReport = {
  inventory: TemplateInventory
  componentCandidates: readonly {
    region: string
    component: string | null
    confidence: 'high' | 'medium' | 'low'
  }[]
  importedAssets: readonly string[]
  redirects: readonly RedirectOutput[]
  requiresVisualReview: true
  requiresEditorReview: true
}
export function createTemplateConversionReport(
  inventory: TemplateInventory,
  redirects: readonly RedirectOutput[] = [],
): TemplateConversionReport {
  return {
    inventory,
    componentCandidates: inventory.recognizableRegions.map((region) => ({
      region,
      component: region.toLowerCase().includes('hero') ? 'core.hero' : null,
      confidence: region.toLowerCase().includes('hero') ? 'medium' : 'low',
    })),
    importedAssets: inventory.assets,
    redirects,
    requiresVisualReview: true,
    requiresEditorReview: true,
  }
}
