import type { RenderedAuditIssue, RenderedPage } from './discovery-audit'

export type CannibalizationReview = {
  urlA: string
  titleA: string
  urlB: string
  titleB: string
  similarityScore: number
  sharedTerms: string[]
  issue: RenderedAuditIssue
}

export type CannibalizationResult = {
  reviews: CannibalizationReview[]
  issues: RenderedAuditIssue[]
  analyzedPageCount: number
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
])

function stemWord(word: string): string {
  let w = word.toLowerCase()
  if (w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.endsWith('ation')) w = w.slice(0, -5)
  else if (w.endsWith('tion')) w = w.slice(0, -4)
  else if (w.endsWith('s') && w.length > 3) w = w.slice(0, -1)
  else if (w.endsWith('ed')) w = w.slice(0, -2)
  return w
}

function tokenize(text: string): { original: string; stem: string }[] {
  const rawWords = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))

  return rawWords.map((w) => ({ original: w, stem: stemWord(w) }))
}

function getTrigrams(str: string): Set<string> {
  const norm = str.toLowerCase().replace(/\s+/g, ' ').trim()
  const trigrams = new Set<string>()
  for (let i = 0; i < norm.length - 2; i++) {
    trigrams.add(norm.slice(i, i + 3))
  }
  return trigrams
}

export function computeLexicalSimilarity(
  textA: string,
  textB: string,
): { similarity: number; sharedTokens: string[] } {
  const tokensA = tokenize(textA)
  const tokensB = tokenize(textB)

  if (tokensA.length === 0 || tokensB.length === 0) {
    return { similarity: 0, sharedTokens: [] }
  }

  const stemMapA = new Map(tokensA.map((t) => [t.stem, t.original]))
  const stemMapB = new Map(tokensB.map((t) => [t.stem, t.original]))

  const setStemA = new Set(stemMapA.keys())
  const setStemB = new Set(stemMapB.keys())

  const sharedStems = [...setStemA].filter((s) => setStemB.has(s))
  const unionStems = new Set([...setStemA, ...setStemB])

  const jaccard = unionStems.size > 0 ? sharedStems.length / unionStems.size : 0

  const triA = getTrigrams(textA)
  const triB = getTrigrams(textB)
  let triOverlap = 0
  for (const tri of triA) {
    if (triB.has(tri)) triOverlap++
  }
  const trigramSim = triA.size + triB.size > 0 ? (2 * triOverlap) / (triA.size + triB.size) : 0

  const similarity = Math.round((0.5 * jaccard + 0.5 * trigramSim) * 100) / 100
  const sharedTokens = sharedStems.map((s) => stemMapA.get(s) || s)

  return { similarity, sharedTokens }
}

export function analyzeCannibalization(
  pages: readonly RenderedPage[],
  threshold = 0.6,
): CannibalizationResult {
  const reviews: CannibalizationReview[] = []
  const issues: RenderedAuditIssue[] = []

  const validPages = pages.filter((p) => p.status === 200 && (p.title || p.headings.length > 0))

  for (let i = 0; i < validPages.length; i++) {
    for (let j = i + 1; j < validPages.length; j++) {
      const pageA = validPages[i]
      const pageB = validPages[j]

      const titleA = pageA.title || ''
      const titleB = pageB.title || ''
      const h1A = pageA.headings.filter((h) => h.startsWith('h1:')).join(' ')
      const h1B = pageB.headings.filter((h) => h.startsWith('h1:')).join(' ')

      const textA = `${titleA} ${h1A}`.trim()
      const textB = `${titleB} ${h1B}`.trim()

      const { similarity, sharedTokens } = computeLexicalSimilarity(textA, textB)

      if (similarity >= threshold) {
        const evidence = `Editorial review suggestion: High lexical similarity (${Math.round(
          similarity * 100,
        )}%) detected between '${pageA.url}' and '${pageB.url}'. Shared key terms: [${sharedTokens.join(
          ', ',
        )}]. Review content positioning and target keywords. (Editorial suggestion only — not a ranking prediction or traffic claim).`

        const auditIssue: RenderedAuditIssue = {
          url: pageA.url,
          ruleId: 'DISC-05-CANNIBALIZATION-REVIEW',
          ruleVersion: '1.0.0',
          severity: 'informational',
          evidence,
          repairTarget: 'seoTitle',
        }

        reviews.push({
          urlA: pageA.url,
          titleA: titleA || pageA.url,
          urlB: pageB.url,
          titleB: titleB || pageB.url,
          similarityScore: similarity,
          sharedTerms: sharedTokens,
          issue: auditIssue,
        })
        issues.push(auditIssue)
      }
    }
  }

  return {
    reviews,
    issues,
    analyzedPageCount: validPages.length,
  }
}
