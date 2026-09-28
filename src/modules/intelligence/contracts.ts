export type IntelligenceEntityType =
  | 'person'
  | 'organization'
  | 'place'
  | 'concept'
  | 'product'
  | 'event'
  | 'work'

export type IntelligenceVerificationStatus = 'unverified' | 'supported' | 'refuted' | 'contested'

export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale'

export type FindingNature = 'deterministic' | 'ai_assessment'

export type FindingSeverity = 'info' | 'warning' | 'critical'

export type FindingStatus = 'open' | 'resolved' | 'dismissed' | 'uncertain'

export type RecommendationNature = 'deterministic' | 'ai'

export type RecommendationAction =
  | 'update_seo_title'
  | 'update_seo_description'
  | 'update_canonical_path'
  | 'link_entity'
  | 'add_citation'
  | 'assign_topic'
  | 'custom'

export type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'applied'

export type ProvenanceMetadata = {
  sourceUrl?: string
  compilerVersion?: string
  importedAt: string
  method?: 'scraped' | 'extracted' | 'imported' | 'manual'
  author?: string
  notes?: string
}

export interface IntelligenceEntityInput {
  name: string
  slug: string
  entityType: IntelligenceEntityType
  description?: string
  aliases?: string[]
  sameAs?: string[]
  confidence?: number
  externalId: string
  provenance: ProvenanceMetadata
  topicSlugs?: string[]
}

export interface IntelligenceClaimInput {
  statement: string
  externalId: string
  subjectEntityExternalId?: string
  predicate?: string
  objectValue?: string
  uncertainty?: number // 0.0 - 1.0 (default 0.5)
  verificationStatus?: IntelligenceVerificationStatus // MUST default to 'unverified' on import
  provenance: ProvenanceMetadata
  quote?: string
  targetContentSlug?: string
  targetTopicSlug?: string
}

export interface IntelligenceCitationInput {
  externalId: string
  claimExternalId?: string
  targetContentSlug?: string
  sourceUrl: string
  title?: string
  author?: string
  publisher?: string
  publishedAt?: string
  accessedAt?: string
  quote?: string
  locator?: string
  relevanceScore?: number
}

export interface IngestionBatchPayload {
  version: string
  compiler: string
  generatedAt: string
  siteId: string
  entities?: IntelligenceEntityInput[]
  claims?: IntelligenceClaimInput[]
  citations?: IntelligenceCitationInput[]
}

export interface DeterministicCheckResult {
  ruleId: string
  severity: FindingSeverity
  message: string
  evidence: Record<string, unknown>
  recommendation?: {
    action: RecommendationAction
    currentValue: unknown
    proposedValue: unknown
    rationale: string
  }
}

export interface AiAssessmentResult {
  task: string
  provider: string
  model: string
  findings: Array<{
    ruleId: string
    severity: FindingSeverity
    message: string
    evidence: Record<string, unknown>
  }>
  recommendations: Array<{
    action: RecommendationAction
    targetCollection: 'content' | 'topics' | 'sites'
    targetId: string
    currentValue: unknown
    proposedValue: unknown
    rationale: string
  }>
  rawResponse?: unknown
  error?: {
    code: string
    message: string
    retriesExhausted?: boolean
  }
}

export interface AnalysisExecutionEvidence {
  contentRevision: string
  source: string
  version: string
  timestamp: string
  titleLength: number
  descriptionLength: number
  wordCount: number
  h1Count: number
  headingsSummary: string[]
  hasCanonical: boolean
  matchedEntities: string[]
  unverifiedClaimsCount: number
  citationsCount: number
  rawChecks: DeterministicCheckResult[]
  aiAssessment?: {
    provider: string
    model: string
    ran: boolean
    success: boolean
    error?: string
  }
}
