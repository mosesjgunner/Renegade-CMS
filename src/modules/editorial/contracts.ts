import { createHash } from 'node:crypto'

import type {
  ActorID,
  AuditMetadata,
  EntityID,
  ImportExportHooks,
  JobID,
  MemberID,
  RetentionPolicy,
  SEOFields,
  SoftDeletion,
  SpaceID,
  StructuredDataSource,
} from '../core/contracts'

export type ArticleFamilyContentID = EntityID<'article-family-content'>
export type EditorialWorkspaceID = EntityID<'editorial-workspace'>
export type EditorialChangeSetID = EntityID<'editorial-change-set'>
export type ReviewRequestID = EntityID<'review-request'>
export type RevisionRecordID = EntityID<'revision-record'>
export type CitationMarkID = EntityID<'citation-mark'>
export type CitationAttachmentID = EntityID<'citation-attachment'>
export type SourceReferenceID = EntityID<'source-reference'>
export type MarkdownImportReportID = EntityID<'markdown-import-report'>
export type MarkdownExportReportID = EntityID<'markdown-export-report'>
export type GrammarIssueID = EntityID<'grammar-issue'>
export type GrammarSuggestionID = EntityID<'grammar-suggestion'>
export type StyleGuideRuleID = EntityID<'style-guide-rule'>
export type LocalDictionaryEntryID = EntityID<'local-dictionary-entry'>
export type OfflineDraftID = EntityID<'offline-draft'>
export type ClientMutationID = EntityID<'client-mutation'>
export type PreviewTokenID = EntityID<'preview-token'>
export type ScheduledPublishJobID = EntityID<'scheduled-publish-job'>

export type EditorialLifecycle =
  | 'draft'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'updated'
  | 'archived'
  | 'rejected'

export type RichTextDocument = {
  format: 'payload-lexical'
  schemaVersion: number
  document: Record<string, unknown>
  canonicalHash: string
  plainTextProjection: string
  unknownNodePolicy: 'preserve'
}

export type EditorialContractOwnership = {
  moduleKey: 'editorial.m04'
  migrationOwner: 'editorial.m04'
  rollbackPolicy: 'review-required'
  exportFormatVersion: number
  exportOwnership: 'editorial.m04'
}

export type MarkdownConstructSupport = 'supported' | 'preserved-with-warning' | 'rejected'

export type MarkdownFidelityBoundary = {
  formatVersion: 1
  sourceFormat: 'commonmark-compatible-markdown'
  canonicalDocumentFormat: RichTextDocument['format']
  htmlPolicy: 'reject-as-canonical-preserve-as-source'
  unsupportedConstructPolicy: 'preserve-source-and-warn'
  supportedConstructs: readonly MarkdownConstruct[]
  preservedWithWarningConstructs: readonly UnsupportedMarkdownConstructKind[]
  rejectedConstructs: readonly string[]
}

export type MarkdownConstruct =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'ordered-list'
  | 'unordered-list'
  | 'thematic-break'
  | 'link'
  | 'emphasis'
  | 'strong'
  | 'inline-code'
  | 'fenced-code'

export type UnsupportedMarkdownConstructKind =
  | 'raw-html'
  | 'table'
  | 'footnote'
  | 'definition-list'
  | 'math'
  | 'directive'
  | 'unknown-extension'

export type MarkdownConversionWarningCode =
  | 'markdown.raw_html_preserved'
  | 'markdown.table_preserved'
  | 'markdown.footnote_preserved'
  | 'markdown.definition_list_preserved'
  | 'markdown.math_preserved'
  | 'markdown.directive_preserved'
  | 'markdown.unknown_extension_preserved'

export type MarkdownConversionWarning = {
  code: MarkdownConversionWarningCode
  message: string
  sourceRange: string | null
}

export type UnsupportedMarkdownConstruct = {
  kind: UnsupportedMarkdownConstructKind
  sourceRange: string | null
  preservation: 'source-slice'
  sourceChecksum: string
}

export type MarkdownFidelityAnalysis = {
  boundary: MarkdownFidelityBoundary
  sourceChecksum: string
  status: 'accepted' | 'accepted-with-warnings'
  warnings: readonly MarkdownConversionWarning[]
  unsupportedConstructs: readonly UnsupportedMarkdownConstruct[]
}

export type ArticleFamilyContent = {
  id: ArticleFamilyContentID
  contentId: EntityID<'content'>
  tenantId: EntityID<'tenant'>
  siteId: EntityID<'site'>
  brandId: EntityID<'brand'> | null
  publicationId: EntityID<'publication'>
  spaceId: SpaceID | null
  ownerMemberId: MemberID | null
  lifecycle: EditorialLifecycle
  document: RichTextDocument
  retentionPolicy: RetentionPolicy | null
  seo: SEOFields
  structuredDataSource: StructuredDataSource
  importExportHooks: ImportExportHooks
  ownership: EditorialContractOwnership
} & AuditMetadata &
  SoftDeletion

export type EditorialWorkspace = {
  id: EditorialWorkspaceID
  articleId: ArticleFamilyContentID
  tenantId: EntityID<'tenant'>
  siteId: EntityID<'site'>
  publicationId: EntityID<'publication'>
  spaceId: SpaceID | null
  participantMemberIds: readonly MemberID[]
  permissions: readonly EditorialPermission[]
  lifecycle: 'active' | 'read-only' | 'archived'
} & AuditMetadata

export type EditorialPermission = {
  actorId: ActorID
  action: 'read' | 'edit' | 'request-review' | 'review' | 'approve' | 'schedule' | 'publish'
  grantedBy: ActorID | null
  grantedAt: string
  expiresAt: string | null
}

export type EditorialChangeSet = {
  id: EditorialChangeSetID
  articleId: ArticleFamilyContentID
  workspaceId: EditorialWorkspaceID
  baseRevisionId: RevisionRecordID | null
  baseDocumentHash: string
  proposedDocument: RichTextDocument
  authorId: ActorID
  status: 'open' | 'submitted' | 'superseded' | 'accepted' | 'rejected'
  idempotencyKey: string
} & AuditMetadata

export type ReviewRequest = {
  id: ReviewRequestID
  articleId: ArticleFamilyContentID
  changeSetId: EditorialChangeSetID
  requestedBy: ActorID
  reviewerIds: readonly ActorID[]
  status: 'open' | 'changes-requested' | 'approved' | 'rejected' | 'cancelled'
  dueAt: string | null
  resolvedAt: string | null
} & AuditMetadata

export type RevisionRecord = {
  id: RevisionRecordID
  articleId: ArticleFamilyContentID
  parentRevisionId: RevisionRecordID | null
  changeSetId: EditorialChangeSetID | null
  sequence: number
  document: RichTextDocument
  documentHash: string
  reason: 'created' | 'edited' | 'reviewed' | 'published' | 'restored' | 'imported'
  immutable: true
  restoredFromRevisionId: RevisionRecordID | null
  createdBy: ActorID | null
  createdAt: string
}

export type CitationMark = {
  id: CitationMarkID
  articleId: ArticleFamilyContentID
  sourceReferenceId: SourceReferenceID
  anchor: { nodeKey: string; offsetStart: number; offsetEnd: number }
  ordinal: number
  passageChecksum: string | null
} & AuditMetadata

export type CitationAttachment = {
  id: CitationAttachmentID
  citationMarkId: CitationMarkID
  mediaAssetId: EntityID<'media-asset'>
  role: 'excerpt' | 'scan' | 'transcript' | 'supporting-document'
  checksum: string
} & AuditMetadata

export type SourceReference = {
  id: SourceReferenceID
  articleId: ArticleFamilyContentID
  sourceId: EntityID<'source'>
  locator: string | null
  bibliographyKey: string
  publicVisibility: 'public' | 'staff'
} & AuditMetadata

export type MarkdownImportReport = {
  id: MarkdownImportReportID
  articleId: ArticleFamilyContentID | null
  sourceChecksum: string
  targetDocumentHash: string | null
  formatVersion: number
  status: 'accepted' | 'accepted-with-warnings' | 'rejected'
  fidelityBoundary: MarkdownFidelityBoundary
  warnings: readonly MarkdownConversionWarning[]
  unsupportedConstructs: readonly UnsupportedMarkdownConstruct[]
  createdBy: ActorID | null
  createdAt: string
}

export type MarkdownExportReport = {
  id: MarkdownExportReportID
  articleId: ArticleFamilyContentID
  sourceDocumentHash: string
  markdownChecksum: string
  formatVersion: number
  status: 'accepted' | 'accepted-with-warnings'
  fidelityBoundary: MarkdownFidelityBoundary
  warnings: readonly MarkdownConversionWarning[]
  unsupportedConstructs: readonly UnsupportedMarkdownConstruct[]
  createdBy: ActorID | null
  createdAt: string
}

export type ArticleFamilyPersistenceBoundary = {
  owner: 'editorial.m04'
  strategy: 'additive-extension-of-content-spine'
  existingCollection: 'content'
  plannedCollections: readonly ['article-family-content', 'markdown-conversion-reports']
  requiredContentFields: readonly [
    'title',
    'slug',
    'canonicalPath',
    'summary',
    'authors',
    'sections',
    'categories',
    'topics',
    'tags',
    'series',
    'heroMedia',
    'commentsPolicy',
    'seoOverride',
    'socialOverride',
    'structuredDataSource',
    'importExportHooks',
    'retention',
  ]
  deferredCollections: readonly [
    'editorial-workspaces',
    'editorial-change-sets',
    'review-requests',
    'revision-records',
    'preview-tokens',
    'scheduled-publish-jobs',
  ]
  migrationPolicy: EditorialContractOwnership
}

export type GrammarIssue = {
  id: GrammarIssueID
  articleId: ArticleFamilyContentID
  documentHash: string
  ruleId: StyleGuideRuleID | null
  status: 'open' | 'dismissed' | 'resolved' | 'stale'
  anchor: { nodeKey: string; offsetStart: number; offsetEnd: number }
  createdAt: string
}

export type GrammarSuggestion = {
  id: GrammarSuggestionID
  issueId: GrammarIssueID
  providerKey: string | null
  replacement: string | null
  explanation: string
  status: 'proposed' | 'accepted' | 'rejected' | 'expired'
  createdAt: string
}

export type StyleGuideRule = {
  id: StyleGuideRuleID
  siteId: EntityID<'site'>
  publicationId: EntityID<'publication'> | null
  spaceId: SpaceID | null
  key: string
  status: 'active' | 'disabled' | 'archived'
  definitionVersion: number
} & AuditMetadata

export type LocalDictionaryEntry = {
  id: LocalDictionaryEntryID
  siteId: EntityID<'site'>
  publicationId: EntityID<'publication'> | null
  spaceId: SpaceID | null
  term: string
  normalizedTerm: string
  status: 'active' | 'disabled'
} & AuditMetadata

export type OfflineDraft = {
  id: OfflineDraftID
  articleId: ArticleFamilyContentID
  deviceId: string
  baseRevisionId: RevisionRecordID | null
  baseDocumentHash: string
  document: RichTextDocument
  status: 'local-only' | 'queued' | 'submitted' | 'conflicted' | 'discarded'
  updatedAt: string
}

export type ClientMutation = {
  id: ClientMutationID
  articleId: ArticleFamilyContentID
  offlineDraftId: OfflineDraftID | null
  idempotencyKey: string
  baseDocumentHash: string
  mutationType: 'save-draft' | 'submit-review' | 'resolve-conflict'
  status: 'queued' | 'accepted' | 'conflicted' | 'rejected'
  createdAt: string
}

export type PreviewToken = {
  id: PreviewTokenID
  articleId: ArticleFamilyContentID
  revisionId: RevisionRecordID | null
  tokenHash: string
  scope: 'article-preview'
  expiresAt: string
  revokedAt: string | null
  createdBy: ActorID | null
  createdAt: string
}

export type ScheduledPublishJob = {
  id: ScheduledPublishJobID
  articleId: ArticleFamilyContentID
  jobId: JobID | null
  revisionId: RevisionRecordID
  scheduledFor: string
  timeZone: string
  idempotencyKey: string
  status: 'pending-contract' | 'queued' | 'completed' | 'cancelled' | 'failed'
  createdBy: ActorID | null
  createdAt: string
}

export const MARKDOWN_FIDELITY_BOUNDARY: MarkdownFidelityBoundary = {
  formatVersion: 1,
  sourceFormat: 'commonmark-compatible-markdown',
  canonicalDocumentFormat: 'payload-lexical',
  htmlPolicy: 'reject-as-canonical-preserve-as-source',
  unsupportedConstructPolicy: 'preserve-source-and-warn',
  supportedConstructs: [
    'paragraph',
    'heading',
    'blockquote',
    'ordered-list',
    'unordered-list',
    'thematic-break',
    'link',
    'emphasis',
    'strong',
    'inline-code',
    'fenced-code',
  ],
  preservedWithWarningConstructs: [
    'raw-html',
    'table',
    'footnote',
    'definition-list',
    'math',
    'directive',
    'unknown-extension',
  ],
  rejectedConstructs: [],
}

export const ARTICLE_FAMILY_PERSISTENCE_BOUNDARY: ArticleFamilyPersistenceBoundary = {
  owner: 'editorial.m04',
  strategy: 'additive-extension-of-content-spine',
  existingCollection: 'content',
  plannedCollections: ['article-family-content', 'markdown-conversion-reports'],
  requiredContentFields: [
    'title',
    'slug',
    'canonicalPath',
    'summary',
    'authors',
    'sections',
    'categories',
    'topics',
    'tags',
    'series',
    'heroMedia',
    'commentsPolicy',
    'seoOverride',
    'socialOverride',
    'structuredDataSource',
    'importExportHooks',
    'retention',
  ],
  deferredCollections: [
    'editorial-workspaces',
    'editorial-change-sets',
    'review-requests',
    'revision-records',
    'preview-tokens',
    'scheduled-publish-jobs',
  ],
  migrationPolicy: {
    moduleKey: 'editorial.m04',
    migrationOwner: 'editorial.m04',
    rollbackPolicy: 'review-required',
    exportFormatVersion: 1,
    exportOwnership: 'editorial.m04',
  },
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`
}

export function hashRichTextDocument(document: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(canonicalize(document)).digest('hex')}`
}

export function hashMarkdownSource(source: string): string {
  return `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`
}

export function analyzeMarkdownFidelity(source: string): MarkdownFidelityAnalysis {
  const sourceChecksum = hashMarkdownSource(source)
  const warnings: MarkdownConversionWarning[] = []
  const findings = new Map<UnsupportedMarkdownConstructKind, UnsupportedMarkdownConstruct>()

  const addFinding = (
    kind: UnsupportedMarkdownConstructKind,
    code: MarkdownConversionWarningCode,
    message: string,
    lineNumber: number | null,
  ) => {
    if (findings.has(kind)) return
    const sourceRange = lineNumber === null ? null : `line ${lineNumber}`
    findings.set(kind, { kind, sourceRange, preservation: 'source-slice', sourceChecksum })
    warnings.push({ code, message, sourceRange })
  }

  const lines = source.split(/\r?\n/)
  let inFence = false

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const lineNumber = index + 1
    if (/^<([A-Za-z][A-Za-z0-9-]*)(\s|>|\/>)/.test(trimmed)) {
      addFinding(
        'raw-html',
        'markdown.raw_html_preserved',
        'Raw HTML is preserved as source and is not canonical editorial content.',
        lineNumber,
      )
    }
    if (/^\|.+\|$/.test(trimmed)) {
      addFinding(
        'table',
        'markdown.table_preserved',
        'Markdown tables require converter support before they can be represented losslessly.',
        lineNumber,
      )
    }
    if (/\[\^[^\]]+\]/.test(trimmed) || /^\[\^[^\]]+\]:/.test(trimmed)) {
      addFinding(
        'footnote',
        'markdown.footnote_preserved',
        'Markdown footnotes are preserved as source until citation and footnote ordering is implemented.',
        lineNumber,
      )
    }
    if (/^\S.*:$/.test(trimmed) && lines[index + 1]?.trim().startsWith(':')) {
      addFinding(
        'definition-list',
        'markdown.definition_list_preserved',
        'Definition lists are preserved as source because they are not part of the current canonical block set.',
        lineNumber,
      )
    }
    if (/\$\$|\\\(|\\\[/.test(trimmed)) {
      addFinding(
        'math',
        'markdown.math_preserved',
        'Math notation is preserved as source until a math block contract is accepted.',
        lineNumber,
      )
    }
    if (/^:::\w+/.test(trimmed)) {
      addFinding(
        'directive',
        'markdown.directive_preserved',
        'Markdown directives are preserved as source until registered custom block mapping exists.',
        lineNumber,
      )
    }
  })

  return {
    boundary: MARKDOWN_FIDELITY_BOUNDARY,
    sourceChecksum,
    status: warnings.length === 0 ? 'accepted' : 'accepted-with-warnings',
    warnings,
    unsupportedConstructs: [...findings.values()],
  }
}

export function createMarkdownImportReport(input: {
  id: MarkdownImportReportID
  articleId: ArticleFamilyContentID | null
  sourceMarkdown: string
  targetDocument: RichTextDocument | null
  createdBy: ActorID | null
  createdAt: string
}): MarkdownImportReport {
  if (input.targetDocument) assertRichTextDocument(input.targetDocument)
  const analysis = analyzeMarkdownFidelity(input.sourceMarkdown)
  return {
    id: input.id,
    articleId: input.articleId,
    sourceChecksum: analysis.sourceChecksum,
    targetDocumentHash: input.targetDocument?.canonicalHash ?? null,
    formatVersion: analysis.boundary.formatVersion,
    status: analysis.status,
    fidelityBoundary: analysis.boundary,
    warnings: analysis.warnings,
    unsupportedConstructs: analysis.unsupportedConstructs,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
  }
}

export function assertMarkdownImportReport(value: MarkdownImportReport): void {
  if (value.formatVersion !== MARKDOWN_FIDELITY_BOUNDARY.formatVersion) {
    throw new Error('MarkdownImportReport formatVersion must match the accepted fidelity boundary.')
  }
  if (value.fidelityBoundary.unsupportedConstructPolicy !== 'preserve-source-and-warn') {
    throw new Error('MarkdownImportReport must preserve unsupported Markdown with warnings.')
  }
  if (value.status === 'accepted' && value.warnings.length > 0) {
    throw new Error('MarkdownImportReport accepted status cannot include warnings.')
  }
  if (value.status === 'accepted-with-warnings' && value.warnings.length === 0) {
    throw new Error('MarkdownImportReport warning status requires at least one warning.')
  }
  if (value.unsupportedConstructs.some((construct) => construct.preservation !== 'source-slice')) {
    throw new Error('Unsupported Markdown constructs must preserve their source slice.')
  }
}

export function assertArticleFamilyPersistenceBoundary(
  value: ArticleFamilyPersistenceBoundary,
): void {
  if (value.owner !== 'editorial.m04' || value.migrationPolicy.migrationOwner !== 'editorial.m04') {
    throw new Error('Article family persistence must remain owned by editorial.m04.')
  }
  if (value.strategy !== 'additive-extension-of-content-spine') {
    throw new Error('Article family persistence must extend the existing content spine additively.')
  }
  if (value.deferredCollections.includes('revision-records')) return
  throw new Error('M04-B must defer revision persistence to the next gate.')
}
export function assertRichTextDocument(value: RichTextDocument): void {
  if (value.format !== 'payload-lexical')
    throw new Error('RichTextDocument must use Payload Lexical.')
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    throw new Error('RichTextDocument schemaVersion must be a positive integer.')
  }
  if ('html' in value.document)
    throw new Error('Rendered HTML cannot be canonical editorial content.')
  if (value.canonicalHash !== hashRichTextDocument(value.document)) {
    throw new Error('RichTextDocument canonicalHash does not match the canonical document.')
  }
}

export function assertArticleFamilyContent(value: ArticleFamilyContent): void {
  assertRichTextDocument(value.document)
  if (
    value.ownership.moduleKey !== 'editorial.m04' ||
    value.ownership.migrationOwner !== 'editorial.m04'
  ) {
    throw new Error('ArticleFamilyContent must declare editorial.m04 migration ownership.')
  }
  if (value.importExportHooks.exportOwnership?.module !== 'editorial.m04') {
    throw new Error('ArticleFamilyContent export ownership must remain editorial.m04.')
  }
}
