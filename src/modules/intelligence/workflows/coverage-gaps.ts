import type { MemoryGraphStore } from '../graph/neo4j-adapter'
import type { CoverageGap, DataSufficiency } from './contracts'

/**
 * Identifies high-value topical, entity, and question coverage gaps across published content.
 */
export function detectCoverageGaps(store: MemoryGraphStore): CoverageGap[] {
  const gaps: CoverageGap[] = []
  const allTopics = store.getAllTopics()
  const allContent = store.getAllContent()
  const allEntities = store.getAllEntities()

  // 1. Uncovered Entities (entities registered in CMS with 0 published content mentions)
  for (const entity of allEntities) {
    const mentioningContent = allContent.filter((c) => c.entities.includes(entity.id))
    if (mentioningContent.length === 0) {
      // Find closest related topic or fallback to first topic
      const relatedTopic = allTopics[0]
      const topicId = relatedTopic ? relatedTopic.id : 'general'
      const topicName = relatedTopic ? relatedTopic.name : 'General'

      gaps.push({
        id: `gap_ent_${entity.id}`,
        topicId,
        topicName,
        gapType: 'uncovered_entity',
        subject: `Uncovered Domain Entity: ${entity.name}`,
        rationale: `Entity "${entity.name}" (${entity.entityType}) is defined in the knowledge base but has zero mentions in published content. Publishing content covering this entity expands domain authority.`,
        evidence: {
          clusterContentCount: 0,
          existingEntitiesInCluster: [],
          uncoveredEntityId: entity.id,
          uncoveredEntityName: entity.name,
          dataSufficiency: 'sufficient',
        },
        priority: 'high',
      })
    }
  }

  // 2. Missing Subtopics in Sparse Clusters
  for (const topic of allTopics) {
    const clusterContent = allContent.filter((c) => c.topics.includes(topic.id))
    const clusterCount = clusterContent.length

    if (clusterCount >= 1 && clusterCount < 3) {
      const existingEntities = clusterContent.flatMap((c) => c.entities)
      const dataSufficiency: DataSufficiency = clusterCount > 0 ? 'sufficient' : 'partial'

      gaps.push({
        id: `gap_subtopic_${topic.id}`,
        topicId: topic.id,
        topicName: topic.name,
        gapType: 'missing_subtopic',
        subject: `Underdeveloped Cluster: "${topic.name}" has only ${clusterCount} article(s)`,
        rationale: `Search engines favor clusters with at least 3-5 comprehensive spokes anchoring a pillar. Expand "${topic.name}" with supporting subtopics.`,
        evidence: {
          clusterContentCount: clusterCount,
          existingEntitiesInCluster: existingEntities,
          dataSufficiency,
        },
        priority: 'medium',
      })
    }

    // 3. Hub without FAQ / Unanswered Questions
    const hasHub = clusterContent.some((c) => c.isHub)
    if (!hasHub && clusterCount >= 2) {
      gaps.push({
        id: `gap_hub_${topic.id}`,
        topicId: topic.id,
        topicName: topic.name,
        gapType: 'orphan_concept',
        subject: `Missing Pillar Hub: "${topic.name}" lacks a central authority page`,
        rationale: `Articles in "${topic.name}" are unanchored by a designated pillar or landing hub. Establishing a hub consolidates topical equity.`,
        evidence: {
          clusterContentCount: clusterCount,
          existingEntitiesInCluster: [],
          dataSufficiency: 'sufficient',
        },
        priority: 'high',
      })
    }
  }

  return gaps.sort((a, b) => {
    const priorityWeight = { high: 3, medium: 2, low: 1 }
    return priorityWeight[b.priority] - priorityWeight[a.priority]
  })
}
