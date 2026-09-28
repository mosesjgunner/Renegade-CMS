export type GraphNodeContent = {
  id: string
  title: string
  slug: string
  canonicalPath: string
  contentType: string
  status: string
  wordCount: number
  publishedAt: string | null
  updatedAt: string
  contentRevision: string
  topics: string[]
  entities: string[]
  isHub: boolean
}

export type GraphNodeTopic = {
  id: string
  name: string
  slug: string
  parentTopicId?: string | null
}

export type GraphNodeEntity = {
  id: string
  name: string
  slug: string
  entityType: string
  externalId: string
}

export type GraphEdgeLink = {
  sourceId: string
  targetId: string
  anchor: string
  href: string
  placement: string
}

export type GraphProjectionStatus = {
  lastProjectedAt: string | null
  contentLagMs: number
  isAvailable: boolean
  projector: 'neo4j-optional' | 'in-memory'
  nodes: {
    contentCount: number
    topicsCount: number
    entitiesCount: number
  }
  edges: {
    linksCount: number
    aboutCount: number
    mentionsCount: number
  }
  error: string | null
}

export type OrphanPageFinding = {
  contentId: string
  title: string
  slug: string
  canonicalPath: string
  inDegree: number
  outDegree: number
  publishedAt: string | null
}

export type WeakTopicClusterFinding = {
  topicId: string
  topicName: string
  topicSlug: string
  contentCount: number
  internalLinkDensity: number // 0.0 - 1.0
  hubContentId: string | null
  hubTitle: string | null
  recommendation: string
}

export type MissingHubRelationshipFinding = {
  hubId: string
  hubTitle: string
  spokeId: string
  spokeTitle: string
  topicId: string
  topicName: string
  missingDirection: 'hub_to_spoke' | 'spoke_to_hub' | 'bidirectional'
  recommendation: string
}

export type LinkOpportunityScoringSignals = {
  topicOverlap: number // 0.0 - 1.0
  entityOverlap: number // 0.0 - 1.0
  intentAlignment: number // 0.0 - 1.0
  targetSuitability: number // 0.0 - 1.0
}

export type LinkOpportunitySuggestion = {
  id: string
  siteId: string
  source: {
    id: string
    title: string
    canonicalPath: string
    revision: string
  }
  target: {
    id: string
    title: string
    canonicalPath: string
    isHub?: boolean
  }
  anchor: string
  placement: string
  score: number // 0.0 - 1.0
  signals: LinkOpportunityScoringSignals
  reason: string
  status: 'pending' | 'accepted' | 'dismissed' | 'applied'
  createdAt: string
  appliedAt?: string | null
}

export type LinkApplicationInput = {
  sourceContentId: string
  targetContentId: string
  expectedRevision: string
  anchorText: string
  placementSelector?: string
  userId: string
  opportunityId?: string
}

export type LinkApplicationResult = {
  success: boolean
  executionId: string
  sourceContentId: string
  newRevision: string
  anchorApplied: string
  beforeSnapshot: Record<string, unknown>
  afterSnapshot: Record<string, unknown>
}

export type BulkReviewItem = {
  id: string
  action: 'accept' | 'dismiss' | 'edit'
  editedAnchor?: string
  editedPlacement?: string
}

export type BulkReviewResult = {
  processed: number
  accepted: number
  dismissed: number
  applied: number
  errors: string[]
}

export type CypherStatement = {
  cypher: string
  params: Record<string, unknown>
}
