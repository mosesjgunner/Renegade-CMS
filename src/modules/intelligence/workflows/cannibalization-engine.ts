import { computeLexicalSimilarity } from '../../public/cannibalization'
import type { CannibalizationCandidate, SearchIntent } from './contracts'

export interface PageForCannibalization {
  id: string
  title: string
  canonicalPath: string
  bodyText?: string
  headings?: string[]
  primaryIntent?: SearchIntent
}

export interface QueryRecord {
  query: string
  url: string
  impressions?: number
  clicks?: number
  position?: number
}

/**
 * Infer search intent from title and headings if not explicitly specified.
 */
export function inferSearchIntent(title: string, text: string = ''): SearchIntent {
  const combined = `${title} ${text}`.toLowerCase()

  if (
    combined.includes('buy') ||
    combined.includes('order') ||
    combined.includes('subscribe') ||
    combined.includes('pricing') ||
    combined.includes('checkout')
  ) {
    return 'transactional'
  }

  if (
    combined.includes('best') ||
    combined.includes('top') ||
    combined.includes('vs') ||
    combined.includes('compare') ||
    combined.includes('review') ||
    combined.includes('alternative')
  ) {
    return 'commercial'
  }

  if (
    combined.includes('login') ||
    combined.includes('contact') ||
    combined.includes('support') ||
    combined.includes('about us') ||
    combined.includes('home')
  ) {
    return 'navigational'
  }

  return 'informational'
}

/**
 * Evaluates candidate pairs for search cannibalization.
 * Crucially accounts for search intent and actual query performance data.
 * Does not rely on similar wording alone, and explicitly labels insufficient query evidence.
 */
export function detectCannibalizationCandidates(
  pages: PageForCannibalization[],
  queryRecords: QueryRecord[] = [],
): CannibalizationCandidate[] {
  const candidates: CannibalizationCandidate[] = []

  // Map URLs to queries
  const urlQueriesMap = new Map<string, Map<string, QueryRecord>>()
  for (const q of queryRecords) {
    const url = q.url.trim().toLowerCase()
    if (!urlQueriesMap.has(url)) {
      urlQueriesMap.set(url, new Map())
    }
    urlQueriesMap.get(url)!.set(q.query.toLowerCase().trim(), q)
  }

  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const pageA = pages[i]
      const pageB = pages[j]

      // Skip self or exact duplicate canonicals
      if (pageA.id === pageB.id || pageA.canonicalPath === pageB.canonicalPath) continue

      const titleA = pageA.title || ''
      const titleB = pageB.title || ''
      const headingsA = (pageA.headings || []).join(' ')
      const headingsB = (pageB.headings || []).join(' ')

      const textA = `${titleA} ${headingsA}`.trim()
      const textB = `${titleB} ${headingsB}`.trim()

      const { similarity: lexicalSimilarity, sharedTokens } = computeLexicalSimilarity(textA, textB)

      // Intent classification
      const intentA = pageA.primaryIntent || inferSearchIntent(titleA, textA)
      const intentB = pageB.primaryIntent || inferSearchIntent(titleB, textB)

      // Query data evaluation
      const queriesA = urlQueriesMap.get(pageA.canonicalPath.toLowerCase()) || new Map()
      const queriesB = urlQueriesMap.get(pageB.canonicalPath.toLowerCase()) || new Map()

      const sharedQueries: Array<{
        query: string
        impressionsA?: number
        impressionsB?: number
        positionA?: number
        positionB?: number
      }> = []

      for (const [queryKey, recordA] of queriesA.entries()) {
        if (queriesB.has(queryKey)) {
          const recordB = queriesB.get(queryKey)!
          sharedQueries.push({
            query: recordA.query,
            impressionsA: recordA.impressions,
            impressionsB: recordB.impressions,
            positionA: recordA.position,
            positionB: recordB.position,
          })
        }
      }

      const hasQueryData = queriesA.size > 0 || queriesB.size > 0

      // Intent conflict evaluation
      let intentConflictLevel: 'high' | 'moderate' | 'low' | 'none' = 'none'
      let severity: 'critical' | 'warning' | 'info' = 'info'
      let suggestedAction:
        | 'merge_redirect'
        | 'canonicalize'
        | 'differentiate_intent'
        | 'retain_distinct' = 'retain_distinct'

      let intentOverlapExplanation = ''
      let queryOverlapExplanation = ''

      if (intentA !== intentB) {
        // Different intents (e.g. Informational guide vs Transactional landing)
        // High wording similarity does NOT mean harmful cannibalization!
        intentConflictLevel = 'low'
        severity = 'info'
        suggestedAction = 'retain_distinct'
        intentOverlapExplanation = `Distinct intents detected: "${pageA.title}" targets ${intentA} intent while "${pageB.title}" targets ${intentB} intent. Shared terminology (${sharedTokens.slice(0, 3).join(', ')}) serves different user journey stages without harmful competition.`
      } else {
        // Identical intents
        if (sharedQueries.length > 0) {
          // Strongest evidence: both rank for the same queries with identical intent
          intentConflictLevel = 'high'
          severity = 'critical'
          suggestedAction = 'merge_redirect'
          intentOverlapExplanation = `Severe intent conflict: Both pages target ${intentA} intent and compete for ${sharedQueries.length} shared search queries.`
          queryOverlapExplanation = `Verified query competition on: ${sharedQueries.map((sq) => `"${sq.query}"`).join(', ')}. Multiple URLs competing in the SERP dilute click-through rate and split backlinks.`
        } else if (lexicalSimilarity >= 0.7) {
          // High wording similarity and identical intent, but no query data
          intentConflictLevel = 'moderate'
          severity = 'warning'
          suggestedAction = 'differentiate_intent'
          intentOverlapExplanation = `Potential intent overlap: Both pages share ${intentA} intent with high structural similarity (${Math.round(lexicalSimilarity * 100)}%).`
          queryOverlapExplanation = hasQueryData
            ? 'Pages receive impressions on distinct search queries without direct keyword collisions.'
            : 'No search console or live query data currently available for these URLs. Insufficient query evidence to confirm live SERP collision.'
        } else if (lexicalSimilarity >= 0.45) {
          intentConflictLevel = 'low'
          severity = 'info'
          suggestedAction = 'retain_distinct'
          intentOverlapExplanation = `Moderate lexical overlap (${Math.round(lexicalSimilarity * 100)}%), but distinct subtopics. Complementary pages within ${intentA} intent.`
          queryOverlapExplanation = hasQueryData
            ? 'No query collision detected.'
            : 'No search query data currently available for these URLs. Insufficient query evidence to confirm live SERP collision.'
        }
      }

      // Filter out benign / non-conflicting pairs unless they have shared queries or moderate+ conflict
      if (
        intentConflictLevel === 'none' ||
        (intentConflictLevel === 'low' && !hasQueryData && lexicalSimilarity < 0.6)
      ) {
        continue
      }

      const id = `cannibal_${pageA.id}_${pageB.id}`

      candidates.push({
        id,
        pageA: {
          id: pageA.id,
          title: pageA.title,
          canonicalPath: pageA.canonicalPath,
          primaryIntent: intentA,
        },
        pageB: {
          id: pageB.id,
          title: pageB.title,
          canonicalPath: pageB.canonicalPath,
          primaryIntent: intentB,
        },
        sharedQueries,
        hasQueryData,
        intentConflictLevel,
        severity,
        evidence: {
          lexicalSimilarity,
          intentOverlapExplanation,
          queryOverlapExplanation,
          dataSufficiency: hasQueryData ? 'sufficient' : 'insufficient_query_data',
        },
        suggestedAction,
        status: 'open',
      })
    }
  }

  return candidates.sort((a, b) => {
    const sevOrder = { critical: 3, warning: 2, info: 1 }
    return sevOrder[b.severity] - sevOrder[a.severity]
  })
}
