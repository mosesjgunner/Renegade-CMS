import type { Payload } from 'payload'
import type {
  LinkOpportunityScoringSignals,
  LinkOpportunitySuggestion,
  MissingHubRelationshipFinding,
  OrphanPageFinding,
  WeakTopicClusterFinding,
} from './contracts'
import type { MemoryGraphStore } from './neo4j-adapter'

/**
 * Calculates Jaccard similarity between two sets of strings.
 */
function jaccardSimilarity(setA: string[], setB: string[]): number {
  if (setA.length === 0 || setB.length === 0) return 0
  const a = new Set(setA)
  const b = new Set(setB)
  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union > 0 ? Number((intersection / union).toFixed(3)) : 0
}

/**
 * Detects orphan pages (published content with zero incoming internal links).
 */
export function detectOrphanPages(store: MemoryGraphStore): OrphanPageFinding[] {
  const orphans: OrphanPageFinding[] = []
  const allContent = store.getAllContent()

  for (const content of allContent) {
    const inDegree = store.getInDegree(content.id)
    if (inDegree === 0) {
      orphans.push({
        contentId: content.id,
        title: content.title,
        slug: content.slug,
        canonicalPath: content.canonicalPath,
        inDegree: 0,
        outDegree: store.getOutDegree(content.id),
        publishedAt: content.publishedAt,
      })
    }
  }

  // Sort by publishedAt descending (newest orphans first)
  return orphans.sort((a, b) => {
    const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return timeB - timeA
  })
}

/**
 * Detects weak topic clusters (clusters with low internal link density or missing hub).
 */
export function detectWeakTopicClusters(store: MemoryGraphStore): WeakTopicClusterFinding[] {
  const weakClusters: WeakTopicClusterFinding[] = []
  const topics = store.getAllTopics()
  const allContent = store.getAllContent()

  for (const topic of topics) {
    const clusterContent = allContent.filter((c) => c.topics.includes(topic.id))
    const contentCount = clusterContent.length

    if (contentCount < 1) continue

    // Find hub in cluster
    const hub = clusterContent.find((c) => c.isHub) || null

    // Compute internal link density within the cluster
    const clusterIds = new Set(clusterContent.map((c) => c.id))
    let internalLinks = 0
    for (const c of clusterContent) {
      const outLinks = store.getOutLinks(c.id)
      for (const link of outLinks) {
        if (clusterIds.has(link.targetId)) {
          internalLinks++
        }
      }
    }

    const maxPossibleLinks = contentCount > 1 ? contentCount * (contentCount - 1) : 1
    const density = contentCount > 1 ? Number((internalLinks / maxPossibleLinks).toFixed(3)) : 0.0

    // A cluster is considered weak if density < 0.25 or if contentCount >= 2 and there is no hub
    if (density < 0.25 || (!hub && contentCount >= 2)) {
      let recommendation = ''
      if (!hub) {
        recommendation = `Topic "${topic.name}" lacks a dedicated hub or pillar page. Create or designate a landing page to anchor this cluster.`
      } else {
        recommendation = `Topic "${topic.name}" has low internal link density (${(density * 100).toFixed(0)}%). Interlink related articles with the hub "${hub.title}".`
      }

      weakClusters.push({
        topicId: topic.id,
        topicName: topic.name,
        topicSlug: topic.slug,
        contentCount,
        internalLinkDensity: density,
        hubContentId: hub ? hub.id : null,
        hubTitle: hub ? hub.title : null,
        recommendation,
      })
    }
  }

  return weakClusters.sort((a, b) => b.contentCount - a.contentCount)
}

/**
 * Detects missing hub relationships (hub missing links to spokes or spokes missing links to hub).
 */
export function detectMissingHubRelationships(
  store: MemoryGraphStore,
): MissingHubRelationshipFinding[] {
  const findings: MissingHubRelationshipFinding[] = []
  const topics = store.getAllTopics()
  const allContent = store.getAllContent()

  for (const topic of topics) {
    const clusterContent = allContent.filter((c) => c.topics.includes(topic.id))
    const hubs = clusterContent.filter((c) => c.isHub)

    for (const hub of hubs) {
      const spokes = clusterContent.filter((c) => c.id !== hub.id)

      for (const spoke of spokes) {
        const hubLinksToSpoke = store.hasLink(hub.id, spoke.id)
        const spokeLinksToHub = store.hasLink(spoke.id, hub.id)

        if (!hubLinksToSpoke || !spokeLinksToHub) {
          let missingDirection: 'hub_to_spoke' | 'spoke_to_hub' | 'bidirectional' = 'bidirectional'
          let recommendation = ''

          if (!hubLinksToSpoke && !spokeLinksToHub) {
            missingDirection = 'bidirectional'
            recommendation = `Hub "${hub.title}" and spoke "${spoke.title}" have no reciprocal links. Add mutual links to bind topic "${topic.name}".`
          } else if (!hubLinksToSpoke) {
            missingDirection = 'hub_to_spoke'
            recommendation = `Hub "${hub.title}" is missing an outbound link to subtopic spoke "${spoke.title}".`
          } else {
            missingDirection = 'spoke_to_hub'
            recommendation = `Spoke "${spoke.title}" is missing a contextual backlink to hub "${hub.title}".`
          }

          findings.push({
            hubId: hub.id,
            hubTitle: hub.title,
            spokeId: spoke.id,
            spokeTitle: spoke.title,
            topicId: topic.id,
            topicName: topic.name,
            missingDirection,
            recommendation,
          })
        }
      }
    }
  }

  return findings
}

export interface DetectLinkOpportunitiesOptions {
  siteId?: string
  redirectSources?: Set<string>
  minScore?: number
}

/**
 * Detects and scores high-relevance internal linking opportunities.
 * Enforces negative constraints:
 * - No self-links
 * - No duplicate links
 * - No private/draft targets
 * - No redirect targets
 * - No repetitive anchor text
 */
export async function detectLinkOpportunities(
  store: MemoryGraphStore,
  payload?: Payload,
  options: DetectLinkOpportunitiesOptions = {},
): Promise<LinkOpportunitySuggestion[]> {
  const suggestions: LinkOpportunitySuggestion[] = []
  const allContent = store.getAllContent()
  const siteId = options.siteId || 'default-site'
  const minScore = options.minScore ?? 0.25

  // 1. Fetch active redirect sources to prevent pointing links to redirect chains
  let redirectSources = options.redirectSources
  if (!redirectSources && payload) {
    try {
      const redirects = await payload.find({
        collection: 'public-redirects',
        where: { enabled: { equals: true } },
        limit: 1000,
        overrideAccess: true,
      })
      redirectSources = new Set(
        redirects.docs.map((r) =>
          String((r as unknown as Record<string, unknown>).fromPath || '').trim(),
        ),
      )
    } catch {
      redirectSources = new Set()
    }
  }
  if (!redirectSources) {
    redirectSources = new Set()
  }

  // Track anchor text occurrences to avoid repetitive anchors
  const anchorUsageCounts = new Map<string, number>()

  for (const source of allContent) {
    for (const target of allContent) {
      // Constraint 1: Avoid self-links and duplicate documents
      if (
        source.id === target.id ||
        (source.canonicalPath && source.canonicalPath === target.canonicalPath) ||
        (source.title &&
          target.title &&
          source.title.trim().toLowerCase() === target.title.trim().toLowerCase())
      ) {
        continue
      }

      // Constraint 2: Avoid duplicate links (link already exists)
      if (store.hasLink(source.id, target.id)) continue

      // Constraint 3: Avoid private or draft targets
      if (target.status !== 'published' && target.status !== 'updated') continue

      // Constraint 4: Avoid redirect targets
      if (redirectSources.has(target.canonicalPath)) continue

      // Scoring Signals:
      // a. Topic overlap (Jaccard)
      const topicOverlap = jaccardSimilarity(source.topics, target.topics)

      // b. Entity overlap (Jaccard)
      const entityOverlap = jaccardSimilarity(source.entities, target.entities)

      // Only consider if there is at least some topic or entity connection, or hub relationship
      const isHubSpoke =
        (source.isHub && target.topics.some((t) => source.topics.includes(t))) ||
        (target.isHub && source.topics.some((t) => target.topics.includes(t)))

      if (topicOverlap === 0 && entityOverlap === 0 && !isHubSpoke) continue

      // c. Intent alignment
      let intentAlignment = 0.5
      if (isHubSpoke) {
        intentAlignment = 0.95
      } else if (topicOverlap > 0.4) {
        intentAlignment = 0.8
      } else if (entityOverlap > 0.4) {
        intentAlignment = 0.75
      }

      // d. Target suitability
      let targetSuitability = 0.5
      if (target.isHub) targetSuitability += 0.25
      const targetInDegree = store.getInDegree(target.id)
      if (targetInDegree < 2) targetSuitability += 0.2 // Needs link equity
      if (target.wordCount > 300) targetSuitability += 0.05
      targetSuitability = Math.min(1.0, Number(targetSuitability.toFixed(3)))

      // Weighted score
      const score = Number(
        (
          0.35 * topicOverlap +
          0.3 * entityOverlap +
          0.2 * intentAlignment +
          0.15 * targetSuitability
        ).toFixed(3),
      )

      if (score < minScore) continue

      // Determine proposed anchor text
      let proposedAnchor = ''
      const sharedEntities = source.entities.filter((e) => target.entities.includes(e))
      if (sharedEntities.length > 0) {
        const ent = store.getEntity(sharedEntities[0])
        if (ent) proposedAnchor = ent.name
      }

      if (!proposedAnchor) {
        const sharedTopics = source.topics.filter((t) => target.topics.includes(t))
        if (sharedTopics.length > 0) {
          const top = store.getTopic(sharedTopics[0])
          if (top) proposedAnchor = top.name
        }
      }

      if (!proposedAnchor) {
        proposedAnchor = target.title
      }

      // Constraint 5: Avoid repetitive anchor text (> 2 suggestions with same anchor)
      const currentCount = anchorUsageCounts.get(proposedAnchor.toLowerCase()) || 0
      if (currentCount >= 2) {
        // Diversify anchor: append context or use target title
        if (proposedAnchor.toLowerCase() !== target.title.toLowerCase()) {
          proposedAnchor = target.title
        } else {
          // If already saturated, skip to keep anchor profile healthy
          continue
        }
      }
      anchorUsageCounts.set(
        proposedAnchor.toLowerCase(),
        (anchorUsageCounts.get(proposedAnchor.toLowerCase()) || 0) + 1,
      )

      const signals: LinkOpportunityScoringSignals = {
        topicOverlap,
        entityOverlap,
        intentAlignment,
        targetSuitability,
      }

      const reason = isHubSpoke
        ? `Strengthens topic cluster hub/spoke architecture between "${source.title}" and "${target.title}".`
        : `High contextual overlap (${(topicOverlap * 100).toFixed(0)}% topic, ${(entityOverlap * 100).toFixed(0)}% entity) enhances navigational link equity.`

      const opportunityId = `opp_${source.id}_to_${target.id}`

      suggestions.push({
        id: opportunityId,
        siteId,
        source: {
          id: source.id,
          title: source.title,
          canonicalPath: source.canonicalPath,
          revision: source.contentRevision,
        },
        target: {
          id: target.id,
          title: target.title,
          canonicalPath: target.canonicalPath,
          isHub: target.isHub,
        },
        anchor: proposedAnchor,
        placement: 'Body > Paragraph 2',
        score,
        signals,
        reason,
        status: 'pending',
        createdAt: new Date().toISOString(),
      })
    }
  }

  // Sort by score descending (highest quality suggestions first)
  return suggestions.sort((a, b) => b.score - a.score)
}
