export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational'

export type DataSufficiency = 'sufficient' | 'partial' | 'insufficient'

export type TopicAuthorityHub = {
  topicId: string
  topicName: string
  topicSlug: string
  hubContent: {
    id: string
    title: string
    canonicalPath: string
    isHub: boolean
  } | null
  spokes: Array<{
    id: string
    title: string
    canonicalPath: string
    inDegree: number
    wordCount: number
  }>
  authorityScore: number // 0 - 100
  topicalCompleteness: number // 0.0 - 1.0
  tier: 'nascent' | 'emerging' | 'authoritative' | 'pillar'
  evidence: {
    spokeCount: number
    internalLinksTotal: number
    entitiesCovered: string[]
    averageWordCount: number
    dataSufficiency: DataSufficiency
    notes: string
  }
  recommendations: string[]
}

export type ContentBrief = {
  id: string
  topicId: string
  topicName: string
  proposedTitle: string
  targetAudience: string
  searchIntent: SearchIntent
  specificGapFilled: string
  evidence: {
    competingPages: Array<{
      id: string
      title: string
      canonicalPath: string
      overlapReason: string
    }>
    sourceCitations: Array<{
      title: string
      url: string
      quote?: string
    }>
    knownEntityReferences: string[]
    dataSufficiency: DataSufficiency
    evidenceSummary: string
  }
  generatedSuggestions: {
    questionsToAnswer: string[]
    entitiesToCover: string[]
    suggestedInternalLinks: Array<{
      targetId: string
      targetTitle: string
      canonicalPath: string
      suggestedAnchor: string
      rationale: string
    }>
    outline: Array<{
      heading: string
      keyPoints: string[]
    }>
  }
  createdAt: string
}

export type InformationGainAssessment = {
  contentId: string
  contentTitle: string
  benchmarkSources: Array<{
    type: 'internal_content' | 'external_source'
    title: string
    identifier: string
  }>
  novelInsights: Array<{
    concept: string
    explanation: string
    significance: 'high' | 'medium' | 'low'
  }>
  redundantPoints: Array<{
    concept: string
    overlapWith: string
    explanation: string
  }>
  missingAngles: Array<{
    concept: string
    benchmarkSource: string
    rationale: string
  }>
  qualitativeGainTier: 'high_originality' | 'moderate_gain' | 'derivative' | 'insufficient_evidence'
  explanation: string
  evidence: {
    uniqueEntityCount: number
    sharedEntityCount: number
    uniqueClaimsCount: number
    hasComparisonBenchmark: boolean
    dataSufficiency: DataSufficiency
    notes: string
  }
}

export type CannibalizationCandidate = {
  id: string
  pageA: {
    id: string
    title: string
    canonicalPath: string
    primaryIntent: SearchIntent
  }
  pageB: {
    id: string
    title: string
    canonicalPath: string
    primaryIntent: SearchIntent
  }
  sharedQueries: Array<{
    query: string
    impressionsA?: number
    impressionsB?: number
    positionA?: number
    positionB?: number
  }>
  hasQueryData: boolean
  intentConflictLevel: 'high' | 'moderate' | 'low' | 'none'
  severity: 'critical' | 'warning' | 'info'
  evidence: {
    lexicalSimilarity: number
    intentOverlapExplanation: string
    queryOverlapExplanation: string
    dataSufficiency: 'sufficient' | 'insufficient_query_data'
  }
  suggestedAction: 'merge_redirect' | 'canonicalize' | 'differentiate_intent' | 'retain_distinct'
  status: 'open' | 'dismissed' | 'deferred' | 'task_created'
}

export type ContentDecaySignal = {
  contentId: string
  title: string
  canonicalPath: string
  publishedAt: string | null
  lastModifiedAt: string
  diagnosis: 'genuine_decay' | 'seasonal_pattern' | 'tracking_gap' | 'url_migration' | 'stable'
  evidence: {
    trafficTrend: 'declining' | 'flat' | 'growing' | 'erratic'
    recentUrlChange: boolean
    recentRedirectDate?: string
    seasonalitySignal: boolean
    trackingHealth: 'healthy' | 'missing_consent' | 'broken_tracking'
    timeElapsedSincePublishDays: number
    dataSufficiency: 'sufficient' | 'insufficient_historical_data'
    notes: string
  }
  recommendedAction:
    | 'refresh_content'
    | 'investigate_tracking'
    | 'monitor_seasonality'
    | 'preserve_current'
  status: 'open' | 'dismissed' | 'deferred' | 'task_created'
}

export type CoverageGap = {
  id: string
  topicId: string
  topicName: string
  gapType: 'uncovered_entity' | 'unanswered_question' | 'missing_subtopic' | 'orphan_concept'
  subject: string
  rationale: string
  evidence: {
    clusterContentCount: number
    existingEntitiesInCluster: string[]
    uncoveredEntityId?: string
    uncoveredEntityName?: string
    dataSufficiency: DataSufficiency
  }
  priority: 'high' | 'medium' | 'low'
}

export type EditorialWorkflowActionInput = {
  action: 'dismiss' | 'defer' | 'merge' | 'create_task'
  findingType: 'cannibalization' | 'decay' | 'coverage_gap' | 'hub_health'
  findingId: string
  siteId: string
  userId: string
  deferUntilDate?: string
  mergeConfig?: {
    sourceId: string
    targetId: string
    redirectType: '308' | '301'
  }
  taskConfig?: {
    title: string
    notes: string
    assigneeId?: string
    priority?: 'low' | 'medium' | 'high'
  }
}

export type EditorialWorkflowActionResult = {
  success: boolean
  actionApplied: 'dismiss' | 'defer' | 'merge' | 'create_task'
  findingId: string
  createdTaskId?: string
  details: Record<string, unknown>
}
