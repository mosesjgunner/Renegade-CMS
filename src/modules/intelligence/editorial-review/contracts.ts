/**
 * Renegade CMoS Content Intelligence - Claim, Citation & Structured Data Review Contracts
 *
 * Enforces provenance tracking, exact content location, source freshness, conflict detection,
 * strict human fact-checking separation (AI cannot auto-verify), and anti-fabrication JSON-LD validation.
 */

export type ClaimLocation = {
  /** Lexical node key if attached to a specific rich-text node */
  nodeKey?: string
  /** Block index within the content body */
  blockIndex?: number
  /** Paragraph or block index */
  paragraphIndex?: number
  /** Character offset start within the block or document text */
  offsetStart?: number
  /** Character offset end within the block or document text */
  offsetEnd?: number
  /** Heading or section path (e.g. "Introduction > Section 2") */
  sectionPath?: string
}

export type ClaimProvenance = {
  /** How the claim was identified */
  source: 'manual_ingest' | 'ai_extraction' | 'pipeline_import' | 'editorial_agent'
  /** Version of the extraction engine or model */
  extractorVersion: string
  /** ISO timestamp when extraction occurred */
  extractedAt: string
  /** User ID or agent identity responsible for extraction */
  extractedBy?: string
  /** Extraction confidence score (0.0 to 1.0) */
  confidence?: number
  /** Raw context snippet surrounding the claim */
  rawContext?: string
}

export type SourceFreshnessStatus = 'fresh' | 'aging' | 'stale' | 'undated'

export type SourceFreshness = {
  status: SourceFreshnessStatus
  publishedDate?: string
  ageYears?: number
  freshnessNotes: string
  isStale: boolean
}

export type SourceStance = 'supports' | 'contradicts' | 'neutral'

export type SourceEvidence = {
  id: string
  sourceUrl: string
  title?: string
  author?: string
  publisher?: string
  publishedDate?: string
  accessedDate?: string
  quote?: string
  locator?: string
  freshness: SourceFreshness
  stance: SourceStance
  addedAt: string
  addedBy?: string
}

export type ClaimConflict = {
  hasConflict: boolean
  conflictType?: 'direct_contradiction' | 'statistical_discrepancy' | 'scope_mismatch'
  conflictingEvidence: Array<{
    sourceId: string
    statement: string
    reason: string
  }>
}

export type ClaimReviewStatus =
  | 'unreviewed'
  | 'supported'
  | 'unsupported'
  | 'contradicted'
  | 'outdated'
  | 'human_verified'
  | 'rejected'

export type ReviewerHistoryEntry = {
  reviewerId: string
  reviewerRole: string
  previousStatus: ClaimReviewStatus
  newStatus: ClaimReviewStatus
  decidedAt: string
  notes?: string
  contentRevision: string
}

export type HumanVerificationRecord = {
  verifiedBy: string
  verifiedRole: string
  verifiedAt: string
  decision: 'verified' | 'rejected' | 'disputed'
  notes?: string
}

export type EditorialClaim = {
  id: string
  contentId: string
  contentRevision: string
  statement: string
  quote: string
  location: ClaimLocation
  provenance: ClaimProvenance
  reviewStatus: ClaimReviewStatus
  /** Automated check outcome proposed by AI or rules (never marks human_verified) */
  automatedCheck?: {
    suggestedStatus: 'unreviewed' | 'supported' | 'unsupported' | 'contradicted' | 'outdated'
    rationale: string
    modelOrRuleId: string
    checkedAt: string
  }
  sources: SourceEvidence[]
  conflict: ClaimConflict
  humanVerification?: HumanVerificationRecord
  reviewerHistory: ReviewerHistoryEntry[]
  createdAt: string
  updatedAt: string
}

// -------------------------------------------------------------------------------------------------
// STRUCTURED DATA (JSON-LD) AUDIT & ANTI-FABRICATION
// -------------------------------------------------------------------------------------------------

export type SchemaValidationSeverity = 'critical' | 'warning' | 'info'

export type SchemaAuditIssue = {
  field: string
  severity: SchemaValidationSeverity
  code:
    | 'missing_required_field'
    | 'missing_recommended_field'
    | 'fabricated_field_detected'
    | 'inconsistent_value'
    | 'invalid_format'
    | 'type_mismatch'
  message: string
  currentValue?: unknown
  suggestedValue?: unknown
}

export type AntiFabricationCheck = {
  passed: boolean
  unsupportedFields: Array<{
    field: string
    reason: string
    attemptedValue: unknown
  }>
  verifiedGrounding: {
    authorVerified: boolean
    publisherVerified: boolean
    datesVerified: boolean
    ratingsVerified: boolean
    organizationVerified: boolean
  }
}

export type SchemaAuditResult = {
  contentId: string
  contentRevision: string
  pageType: string
  canonicalUrl: string
  currentJsonLd: Record<string, unknown>
  eligibleSchemaTypes: string[]
  missingFields: string[]
  inconsistentFields: string[]
  issues: SchemaAuditIssue[]
  antiFabrication: AntiFabricationCheck
  isEligibleForRichSnippet: boolean
  auditedAt: string
}

export type SchemaProposal = {
  id: string
  contentId: string
  contentRevision: string
  pageType: string
  proposedJsonLd: Record<string, unknown>
  additions: Record<string, unknown>
  corrections: Record<string, { from: unknown; to: unknown }>
  removals: string[]
  validationStatus: 'valid' | 'invalid'
  issues: SchemaAuditIssue[]
  antiFabricationPassed: boolean
  status: 'pending_review' | 'approved' | 'rejected' | 'applied'
  proposedBy: string
  proposedAt: string
  reviewedBy?: string
  reviewedAt?: string
  appliedAt?: string
}

// -------------------------------------------------------------------------------------------------
// INTEGRITY & FACT-REVIEW REPORT
// -------------------------------------------------------------------------------------------------

export type FactReviewReport = {
  contentId: string
  contentTitle: string
  contentRevision: string
  generatedAt: string
  summary: {
    totalClaims: number
    unreviewedCount: number
    unsupportedCount: number
    contradictedCount: number
    outdatedCount: number
    humanVerifiedCount: number
    rejectedCount: number
    conflictedSourcesCount: number
  }
  /** Section A: Automated Validation (deterministic rules, AI preliminary checks, schema validity) */
  automatedValidation: {
    schemaValid: boolean
    missingSchemaFields: string[]
    antiFabricationPassed: boolean
    staleSourcesDetected: number
    aiFlaggedIssues: Array<{
      claimId: string
      suggestedStatus: string
      rationale: string
    }>
  }
  /** Section B: Human Fact Review (explicit human verification, editorial approvals) */
  humanFactReview: {
    verifiedClaimsRatio: string
    unresolvedContradictions: Array<{
      claimId: string
      statement: string
      contradictingSources: string[]
    }>
    unsupportedClaims: Array<{
      claimId: string
      statement: string
      location: string
    }>
    outdatedClaims: Array<{
      claimId: string
      statement: string
      staleSourceUrl?: string
      ageYears?: number
    }>
    reviewerSignoffs: Array<{
      claimId: string
      verifiedBy: string
      role: string
      verifiedAt: string
      decision: string
    }>
  }
}
