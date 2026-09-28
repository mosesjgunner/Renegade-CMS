import type { Payload } from 'payload'
import type { MemoryGraphStore } from '../graph/neo4j-adapter'
import type { ContentBrief, DataSufficiency, SearchIntent } from './contracts'

export interface GenerateBriefOptions {
  topicId: string
  proposedTitle: string
  targetAudience?: string
  searchIntent?: SearchIntent
  userAngle?: string
  siteId?: string
}

/**
 * Generates an actionable Content Brief, rigorously distinguishing
 * factual evidence from generated editorial suggestions.
 */
export async function generateContentBrief(
  store: MemoryGraphStore,
  payload: Payload | undefined,
  options: GenerateBriefOptions,
): Promise<ContentBrief> {
  const { topicId, proposedTitle, userAngle } = options
  const topic = store.getTopic(topicId)
  const topicName = topic?.name || 'General'

  const targetAudience =
    options.targetAudience || 'Technical practitioners, system architects, and content strategists'
  const searchIntent = options.searchIntent || 'informational'

  // 1. Collect Evidence: Existing cluster pages
  const allContent = store.getAllContent()
  const clusterContent = allContent.filter((c) => c.topics.includes(topicId))

  const competingPages = clusterContent.slice(0, 5).map((c) => ({
    id: c.id,
    title: c.title,
    canonicalPath: c.canonicalPath,
    overlapReason: `Shares topic "${topicName}". Covers related concepts in ${c.wordCount} words.`,
  }))

  // 2. Collect Evidence: Supporting sources from intelligence citations/claims
  const sourceCitations: Array<{ title: string; url: string; quote?: string }> = []
  const knownEntityReferences: string[] = []

  // Check graph entities
  const topicEntities = store
    .getAllEntities()
    .filter((e) => clusterContent.some((c) => c.entities.includes(e.id)))

  for (const ent of topicEntities.slice(0, 8)) {
    knownEntityReferences.push(ent.name)
  }

  if (payload) {
    try {
      const citations = await payload.find({
        collection: 'intelligence-citations' as never,
        where: options.siteId ? { site: { equals: options.siteId } } : {},
        limit: 5,
        overrideAccess: true,
      })
      for (const cit of citations.docs as unknown as Array<Record<string, unknown>>) {
        sourceCitations.push({
          title: String(cit.title || 'Referenced Source'),
          url: String(cit.sourceUrl || '#'),
          quote: cit.quote ? String(cit.quote) : undefined,
        })
      }
    } catch {
      // Gracefully continue if citations collection query is not available
    }
  }

  // Data sufficiency assessment
  const dataSufficiency: DataSufficiency =
    competingPages.length > 0 || knownEntityReferences.length > 0 ? 'sufficient' : 'partial'

  const existingTitles = competingPages.map((p) => `"${p.title}"`).join(', ')
  const evidenceSummary =
    competingPages.length > 0
      ? `Evidence derived from ${competingPages.length} existing articles in topic "${topicName}" (${existingTitles}) and ${knownEntityReferences.length} registered domain entities.`
      : `Initial brief created with limited topic fixture data; suggestions based on domain taxonomy and intended search intent.`

  // 3. Determine Specific Gap Filled
  const specificGapFilled = userAngle
    ? `Addresses the specific angle: ${userAngle}. While existing pages (${existingTitles || 'none'}) cover baseline topic concepts, this piece focuses directly on practical execution.`
    : `Provides focused coverage on ${proposedTitle}. Existing pages (${existingTitles || 'none'}) address adjacent subtopics, but lack a consolidated guide covering this specific workflow.`

  // 4. Generated Suggestions: Questions to answer
  const questionsToAnswer: string[] = [
    `What is the foundational architecture of ${topicName} in modern deployments?`,
    `How does ${proposedTitle} solve common operational bottlenecks?`,
    `What are the verified prerequisites and failure modes to anticipate?`,
    `How does this approach compare to conventional alternatives?`,
  ]

  // Generated Suggestions: Entities to cover
  const entitiesToCover =
    knownEntityReferences.length > 0
      ? [...knownEntityReferences.slice(0, 5)]
      : [topicName, 'System Architecture', 'Operational Integrity']

  // Generated Suggestions: Internal links
  const suggestedInternalLinks: Array<{
    targetId: string
    targetTitle: string
    canonicalPath: string
    suggestedAnchor: string
    rationale: string
  }> = []

  // Link to hub if exists
  const hubPage = clusterContent.find((c) => c.isHub)
  if (hubPage) {
    suggestedInternalLinks.push({
      targetId: hubPage.id,
      targetTitle: hubPage.title,
      canonicalPath: hubPage.canonicalPath,
      suggestedAnchor: hubPage.title,
      rationale: `Connects this subtopic piece back to the pillar hub page to pass link equity.`,
    })
  }

  // Link to complementary spoke
  const otherSpoke = clusterContent.find((c) => c.id !== hubPage?.id)
  if (otherSpoke) {
    suggestedInternalLinks.push({
      targetId: otherSpoke.id,
      targetTitle: otherSpoke.title,
      canonicalPath: otherSpoke.canonicalPath,
      suggestedAnchor: otherSpoke.title,
      rationale: `Provides cross-referential depth for readers exploring adjacent subtopics.`,
    })
  }

  // Generated Suggestions: Structured Outline
  const outline = [
    {
      heading: `Introduction & Executive Context`,
      keyPoints: [
        `Define problem statement and why ${proposedTitle} matters now.`,
        `Clarify target audience expectations and scope boundaries.`,
      ],
    },
    {
      heading: `Core Concepts & Architecture`,
      keyPoints: [
        `Deconstruct core mechanisms and entities (${entitiesToCover.slice(0, 2).join(', ')}).`,
        `Illustrate relationship to wider ${topicName} system.`,
      ],
    },
    {
      heading: `Implementation Walkthrough & Practical Steps`,
      keyPoints: [
        `Step-by-step verified instructions.`,
        `Edge case handling and operational safeguards.`,
      ],
    },
    {
      heading: `Verification, Diagnostics & Key Takeaways`,
      keyPoints: [
        `How to verify correctness and monitor performance.`,
        `Next steps and related reading.`,
      ],
    },
  ]

  return {
    id: `brief_${topicId}_${Date.now()}`,
    topicId,
    topicName,
    proposedTitle,
    targetAudience,
    searchIntent,
    specificGapFilled,
    evidence: {
      competingPages,
      sourceCitations,
      knownEntityReferences,
      dataSufficiency,
      evidenceSummary,
    },
    generatedSuggestions: {
      questionsToAnswer,
      entitiesToCover,
      suggestedInternalLinks,
      outline,
    },
    createdAt: new Date().toISOString(),
  }
}
