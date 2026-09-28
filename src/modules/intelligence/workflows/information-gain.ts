import type { DataSufficiency, InformationGainAssessment } from './contracts'

export interface AssessInformationGainInput {
  contentId: string
  contentTitle: string
  contentBodyText: string
  contentEntities?: string[]
  contentClaims?: string[]
  benchmarkSources: Array<{
    type: 'internal_content' | 'external_source'
    title: string
    identifier: string
    bodyText: string
    entities?: string[]
  }>
}

/**
 * Assesses Information Gain by comparing content against available benchmarks.
 * Explains the comparison qualitatively — never presenting an unsupported numeric score
 * as an objective measure of originality.
 */
export function assessInformationGain(
  input: AssessInformationGainInput,
): InformationGainAssessment {
  const {
    contentId,
    contentTitle,
    contentBodyText,
    contentEntities = [],
    contentClaims = [],
    benchmarkSources,
  } = input

  // If no benchmark sources provided, we cannot fabricate an originality score
  if (!benchmarkSources || benchmarkSources.length === 0) {
    return {
      contentId,
      contentTitle,
      benchmarkSources: [],
      novelInsights: [],
      redundantPoints: [],
      missingAngles: [],
      qualitativeGainTier: 'insufficient_evidence',
      explanation: `Information gain assessment requires baseline comparison content. No benchmark articles or source texts were supplied or found in the cluster to compare against. To evaluate originality, provide reference source material or cluster peers.`,
      evidence: {
        uniqueEntityCount: contentEntities.length,
        sharedEntityCount: 0,
        uniqueClaimsCount: contentClaims.length,
        hasComparisonBenchmark: false,
        dataSufficiency: 'insufficient',
        notes: 'Cannot determine information gain without comparison benchmarks.',
      },
    }
  }

  // Aggregate benchmark vocabulary and entities
  const benchmarkEntitiesSet = new Set<string>()
  const benchmarkAllText = benchmarkSources.map((s) => s.bodyText).join(' ')
  const benchmarkWords = new Set(
    benchmarkAllText
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4),
  )

  for (const src of benchmarkSources) {
    if (Array.isArray(src.entities)) {
      for (const ent of src.entities) benchmarkEntitiesSet.add(ent.toLowerCase())
    }
  }

  // Identify Novel Insights (entities/concepts in subject but missing from benchmarks)
  const novelInsights: Array<{
    concept: string
    explanation: string
    significance: 'high' | 'medium' | 'low'
  }> = []

  const lowerContentText = contentBodyText.toLowerCase()

  for (const ent of contentEntities) {
    if (!benchmarkEntitiesSet.has(ent.toLowerCase()) && !benchmarkWords.has(ent.toLowerCase())) {
      novelInsights.push({
        concept: ent,
        explanation: `Introduces entity "${ent}", which does not appear in any of the ${benchmarkSources.length} comparison benchmark source(s).`,
        significance: 'high',
      })
    }
  }

  // Check unique claims
  for (const claim of contentClaims) {
    if (!benchmarkAllText.toLowerCase().includes(claim.toLowerCase().slice(0, 30))) {
      novelInsights.push({
        concept: claim.length > 50 ? `${claim.slice(0, 47)}...` : claim,
        explanation: `Asserts a distinct verifiable proposition not present in the reference material.`,
        significance: 'medium',
      })
    }
  }

  // Identify Redundant Points (entities/concepts heavily repeated in benchmark)
  const redundantPoints: Array<{
    concept: string
    overlapWith: string
    explanation: string
  }> = []

  for (const src of benchmarkSources) {
    if (Array.isArray(src.entities)) {
      for (const ent of src.entities) {
        if (
          contentEntities.some((e) => e.toLowerCase() === ent.toLowerCase()) ||
          lowerContentText.includes(ent.toLowerCase())
        ) {
          redundantPoints.push({
            concept: ent,
            overlapWith: src.title,
            explanation: `Concept "${ent}" is already established and discussed in "${src.title}".`,
          })
        }
      }
    }
  }

  // Identify Missing Angles (topics/entities covered in benchmark that subject page omitted)
  const missingAngles: Array<{
    concept: string
    benchmarkSource: string
    rationale: string
  }> = []

  for (const src of benchmarkSources) {
    if (Array.isArray(src.entities)) {
      for (const ent of src.entities) {
        if (!lowerContentText.includes(ent.toLowerCase())) {
          missingAngles.push({
            concept: ent,
            benchmarkSource: src.title,
            rationale: `Benchmark source "${src.title}" covers "${ent}", which is omitted here. Consider addressing if relevant to topic completeness.`,
          })
        }
      }
    }
  }

  // Deduplicate redundant and missing
  const dedupeByConcept = <T extends { concept: string }>(items: T[]): T[] => {
    const seen = new Set<string>()
    return items.filter((item) => {
      const lower = item.concept.toLowerCase()
      if (seen.has(lower)) return false
      seen.add(lower)
      return true
    })
  }

  const uniqueNovel = dedupeByConcept(novelInsights)
  const uniqueRedundant = dedupeByConcept(redundantPoints)
  const uniqueMissing = dedupeByConcept(missingAngles)

  // Determine Qualitative Gain Tier
  let qualitativeGainTier:
    | 'high_originality'
    | 'moderate_gain'
    | 'derivative'
    | 'insufficient_evidence' = 'moderate_gain'

  if (uniqueNovel.length >= 3) {
    qualitativeGainTier = 'high_originality'
  } else if (uniqueNovel.length === 0 && uniqueRedundant.length >= 3) {
    qualitativeGainTier = 'derivative'
  } else if (uniqueNovel.length > 0 || uniqueMissing.length > 0) {
    qualitativeGainTier = 'moderate_gain'
  } else {
    qualitativeGainTier = 'moderate_gain'
  }

  // Construct Detailed Human-Readable Explanation
  let explanation = ''
  if (qualitativeGainTier === 'high_originality') {
    explanation = `High Information Gain: "${contentTitle}" introduces ${uniqueNovel.length} distinct concepts/claims not documented in the ${benchmarkSources.length} comparative source(s) (e.g., ${uniqueNovel
      .slice(0, 3)
      .map((n) => `"${n.concept}"`)
      .join(', ')}). It expands the overall corpus rather than reiterating commoditized points.`
  } else if (qualitativeGainTier === 'derivative') {
    explanation = `Low / Derivative Information Gain: "${contentTitle}" closely mirrors the framing of comparison source(s) (e.g., "${benchmarkSources[0]?.title}"). It shares core concepts (${uniqueRedundant
      .slice(0, 3)
      .map((r) => `"${r.concept}"`)
      .join(', ')}) without introducing novel angles or distinct evidence.`
  } else {
    explanation = `Moderate Information Gain: "${contentTitle}" synthesizes known concepts from comparative sources while introducing incremental clarification on ${uniqueNovel.length > 0 ? `"${uniqueNovel[0]?.concept}"` : 'contextual details'}. To increase originality, consider addressing missing angles such as ${
      uniqueMissing
        .slice(0, 2)
        .map((m) => `"${m.concept}"`)
        .join(', ') || 'proprietary data/case studies'
    }.`
  }

  const dataSufficiency: DataSufficiency = benchmarkSources.length >= 1 ? 'sufficient' : 'partial'

  return {
    contentId,
    contentTitle,
    benchmarkSources: benchmarkSources.map((s) => ({
      type: s.type,
      title: s.title,
      identifier: s.identifier,
    })),
    novelInsights: uniqueNovel,
    redundantPoints: uniqueRedundant,
    missingAngles: uniqueMissing,
    qualitativeGainTier,
    explanation,
    evidence: {
      uniqueEntityCount: uniqueNovel.length,
      sharedEntityCount: uniqueRedundant.length,
      uniqueClaimsCount: contentClaims.length,
      hasComparisonBenchmark: true,
      dataSufficiency,
      notes: `Comparison performed against ${benchmarkSources.length} reference source(s): ${benchmarkSources.map((s) => `"${s.title}"`).join(', ')}.`,
    },
  }
}
