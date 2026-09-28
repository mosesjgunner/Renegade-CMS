import type { MemoryGraphStore } from '../graph/neo4j-adapter'
import type { DataSufficiency, TopicAuthorityHub } from './contracts'

/**
 * Builds Topic Hubs and Authority Maps from the projected graph.
 */
export function buildTopicAuthorityMaps(store: MemoryGraphStore): TopicAuthorityHub[] {
  const hubs: TopicAuthorityHub[] = []
  const allTopics = store.getAllTopics()
  const allContent = store.getAllContent()
  const allEntities = store.getAllEntities()

  for (const topic of allTopics) {
    const clusterContent = allContent.filter((c) => c.topics.includes(topic.id))
    const totalContent = clusterContent.length

    // Determine Hub Page
    // First priority: designated hub (landing page, pillar, parent page)
    let hubDoc = clusterContent.find((c) => c.isHub) || null
    if (!hubDoc && clusterContent.length > 0) {
      // Secondary: content with highest in-degree
      hubDoc = [...clusterContent].sort((a, b) => {
        const inA = store.getInDegree(a.id)
        const inB = store.getInDegree(b.id)
        if (inB !== inA) return inB - inA
        return b.wordCount - a.wordCount
      })[0]
    }

    const spokes = clusterContent
      .filter((c) => (hubDoc ? c.id !== hubDoc.id : true))
      .map((c) => ({
        id: c.id,
        title: c.title,
        canonicalPath: c.canonicalPath,
        inDegree: store.getInDegree(c.id),
        wordCount: c.wordCount,
      }))

    // Calculate cluster internal links
    const clusterIds = new Set(clusterContent.map((c) => c.id))
    let internalLinksTotal = 0
    for (const c of clusterContent) {
      const outLinks = store.getOutLinks(c.id)
      for (const link of outLinks) {
        if (clusterIds.has(link.targetId)) {
          internalLinksTotal++
        }
      }
    }

    // Entities covered in cluster
    const clusterEntityIds = new Set<string>()
    for (const c of clusterContent) {
      for (const entId of c.entities) {
        clusterEntityIds.add(entId)
      }
    }
    const entitiesCovered = Array.from(clusterEntityIds)
      .map((id) => store.getEntity(id)?.name || id)
      .filter(Boolean)

    // Average word count
    const totalWords = clusterContent.reduce((sum, c) => sum + c.wordCount, 0)
    const averageWordCount = totalContent > 0 ? Math.round(totalWords / totalContent) : 0

    // Data sufficiency assessment
    let dataSufficiency: DataSufficiency = 'sufficient'
    let notes = ''
    if (totalContent === 0) {
      dataSufficiency = 'insufficient'
      notes = `No published content found for topic "${topic.name}". Authority metrics cannot be determined.`
    } else if (totalContent < 3 || entitiesCovered.length === 0) {
      dataSufficiency = 'partial'
      notes = `Limited cluster size (${totalContent} pages, ${entitiesCovered.length} entities). Metrics based on initial sample.`
    } else {
      notes = `Robust cluster with ${totalContent} published pages and ${entitiesCovered.length} distinct entities.`
    }

    // Topical completeness calculation:
    // Ratio of entities covered in cluster to total relevant entities known in system
    const totalSiteEntities = allEntities.length
    const topicalCompleteness =
      totalSiteEntities > 0
        ? Number((clusterEntityIds.size / Math.min(totalSiteEntities, 10)).toFixed(2))
        : totalContent > 0
          ? 0.5
          : 0.0

    // Composite Authority Score (0 - 100)
    let authorityScore = 0
    if (totalContent > 0) {
      // 1. Spoke scale (up to 25 pts)
      const spokePts = Math.min(25, spokes.length * 5)
      // 2. Connectivity (up to 30 pts)
      const maxPossibleEdges = totalContent > 1 ? totalContent * (totalContent - 1) : 1
      const linkDensity = internalLinksTotal / maxPossibleEdges
      const linkPts = Math.min(30, Math.round(linkDensity * 40) + internalLinksTotal * 3)
      // 3. Entity breadth (up to 25 pts)
      const entityPts = Math.min(25, entitiesCovered.length * 8)
      // 4. Content depth (up to 20 pts)
      const depthPts = averageWordCount >= 1000 ? 20 : averageWordCount >= 600 ? 12 : 5

      authorityScore = Math.min(100, spokePts + linkPts + entityPts + depthPts)
    }

    // Tier assignment
    let tier: 'nascent' | 'emerging' | 'authoritative' | 'pillar' = 'nascent'
    if (authorityScore >= 80) tier = 'pillar'
    else if (authorityScore >= 55) tier = 'authoritative'
    else if (authorityScore >= 25) tier = 'emerging'

    // Generate actionable recommendations
    const recommendations: string[] = []
    const hasDesignatedHub = clusterContent.some((c) => c.isHub)
    if (!hasDesignatedHub) {
      recommendations.push(
        `Create a dedicated landing page or pillar article to anchor "${topic.name}".`,
      )
    } else if (spokes.length < 2 && hubDoc) {
      recommendations.push(
        `Expand cluster with 2-3 focused subtopic articles to support hub "${hubDoc.title}".`,
      )
    }

    if (internalLinksTotal < spokes.length) {
      recommendations.push(
        `Interlink spokes back to the hub to strengthen topic link equity and crawl paths.`,
      )
    }

    if (entitiesCovered.length === 0) {
      recommendations.push(`Tag core domain entities to establish semantic clarity for this topic.`)
    }

    hubs.push({
      topicId: topic.id,
      topicName: topic.name,
      topicSlug: topic.slug,
      hubContent: hubDoc
        ? {
            id: hubDoc.id,
            title: hubDoc.title,
            canonicalPath: hubDoc.canonicalPath,
            isHub: hubDoc.isHub,
          }
        : null,
      spokes,
      authorityScore,
      topicalCompleteness: Math.min(1.0, topicalCompleteness),
      tier,
      evidence: {
        spokeCount: spokes.length,
        internalLinksTotal,
        entitiesCovered,
        averageWordCount,
        dataSufficiency,
        notes,
      },
      recommendations,
    })
  }

  return hubs.sort((a, b) => b.authorityScore - a.authorityScore)
}
