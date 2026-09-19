export type ReleaseStatus =
  | 'draft'
  | 'in-review'
  | 'approved'
  | 'scheduled'
  | 'executing'
  | 'completed'
  | 'partially-failed'
  | 'failed'
  | 'cancelled'
  | 'rolled-back'
  // Backwards-compatibility aliases
  | 'released'
  | 'blocked'
  | 'partial-failure'

export type ReleaseTargetType =
  | 'article'
  | 'page'
  | 'presentation'
  | 'media'
  | 'redirect'
  | 'product'
  | 'distribution'

export type ReleaseItemStatus =
  | 'pending'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'compensated'

export type ReleaseArtifactItem = {
  id: string // e.g. "article:123", "page:456", "presentation:header", "redirect:r1"
  targetType: ReleaseTargetType
  targetId: string
  title: string
  canonicalUrl?: string
  pinnedRevisionId?: string
  pinnedRevisionSequence?: number
  pinnedSnapshot?: Record<string, unknown>
  pinnedHash: string
  mediaRightsStatus?: string
  mediaRightsExpiresAt?: string
  redirectRule?: {
    fromPath: string
    toPath: string
    statusCode: '301' | '302' | '307' | '308'
    match: 'exact' | 'prefix' | 'regex'
    enabled: boolean
  }
  distributionDraftId?: string
  locale?: string
  translationGroupId?: string
  isMachineDraft?: boolean
  humanReviewed?: boolean
  translationStale?: boolean
  completenessScore?: number
  status: ReleaseItemStatus
  attempts: number
  error?: string
  lastKnownGoodState?: Record<string, unknown>
  stepOutput?: Record<string, unknown>
  executedAt?: string
  updatedAt: string
}

export type ReleaseDependency = {
  releaseId: string
  releaseName?: string
  type: 'must-succeed-before' | 'co-scheduled'
}

export type ReleaseGateRuleSeverity = 'blocker' | 'warning'
export type ReleaseGateRuleStatus = 'passed' | 'failed' | 'waived'

export type ReleaseGateRuleWaiver = {
  waivedByUserId: string
  waivedByUserRole: string
  reason: string
  waivedAt: string
  expiresAt: string
}

export type ReleaseGateRuleResult = {
  ruleId: string
  ruleVersion: string
  name: string
  severity: ReleaseGateRuleSeverity
  status: ReleaseGateRuleStatus
  message: string
  repairUrl?: string
  evidence?: Record<string, unknown>
  waiver?: ReleaseGateRuleWaiver
}

export type ReleaseGateSnapshot = {
  snapshotId: string
  evaluatedAt: string
  evaluatedFingerprint: string
  isValid: boolean
  invalidationReason?: string
  overallStatus: 'passed' | 'blocked' | 'warnings'
  blockerCount: number
  warningCount: number
  rules: ReleaseGateRuleResult[]
}

export type ReleaseApproval = {
  id: string
  actorId: string
  actorRole: string
  decision: 'approved' | 'rejected'
  comment?: string
  releaseRevision: number
  gateSnapshotFingerprint: string
  decidedAt: string
}

export type ReleaseExecutionStep = {
  stepId: string
  boundary: 'transactional_db' | 'saga_outbox'
  artifactId: string
  targetType: ReleaseTargetType
  status: ReleaseItemStatus
  attempts: number
  error?: string
  output?: Record<string, unknown>
  startedAt?: string
  completedAt?: string
}

export type ReleaseAuditEvent = {
  action: string
  actorId: string
  at: string
  details?: Record<string, unknown>
  jobId?: string
  retryId?: string
  status?: string
}

export type CoordinatedRelease = {
  id: string
  name: string
  title: string // Backwards-compatible alias
  purpose: string
  ownerId: string
  ownerTeam: string
  siteId: string
  publicationId?: string
  plannedInstant: string
  scheduledFor: string // Backwards-compatible alias
  timeZone: string
  labels: string[]
  campaign?: string
  dependencies: ReleaseDependency[]
  releaseRevision: number
  status: ReleaseStatus
  artifacts: ReleaseArtifactItem[]
  executionItems: ReleaseArtifactItem[] // Backwards-compatible alias
  gateSnapshot: ReleaseGateSnapshot | null
  approvals: ReleaseApproval[]
  sagaSteps: ReleaseExecutionStep[]
  resultingUrls: string[]
  leaseOwner?: string | null
  leaseExpiresAt?: string | null
  lastScheduleMutationId?: string
  executionJob?: string
  scheduleAudit: ReleaseAuditEvent[]
  executionAudit: ReleaseAuditEvent[]
  createdAt: string
  updatedAt: string
}

export type CreateReleaseInput = {
  name: string
  purpose: string
  ownerId: string
  ownerTeam: string
  siteId: string
  publicationId?: string
  plannedInstant?: string
  scheduledFor?: string
  timeZone?: string
  labels?: string[]
  campaign?: string
  dependencies?: ReleaseDependency[]
}

export type PinArtifactInput = {
  targetType: ReleaseTargetType
  targetId: string
  title: string
  canonicalUrl?: string
  pinnedRevisionId?: string
  pinnedRevisionSequence?: number
  pinnedSnapshot?: Record<string, unknown>
  pinnedHash: string
  mediaRightsStatus?: string
  mediaRightsExpiresAt?: string
  redirectRule?: {
    fromPath: string
    toPath: string
    statusCode: '301' | '302' | '307' | '308'
    match: 'exact' | 'prefix' | 'regex'
    enabled: boolean
  }
  distributionDraftId?: string
  locale?: string
  translationGroupId?: string
  isMachineDraft?: boolean
  humanReviewed?: boolean
  translationStale?: boolean
  completenessScore?: number
}

export type ReleaseExecutionResult = {
  releaseId: string
  status: ReleaseStatus
  succeeded: number
  unresolved: number
  failedSteps: Array<{ artifactId: string; error?: string }>
  resultingUrls: string[]
}
