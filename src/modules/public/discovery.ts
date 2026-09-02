import { canDiscoverPublic, type PublicState } from './contracts'

export type SearchDocument = PublicState & {
  id: string
  siteId: string
  path: string
  title: string
  summary?: string | null
  excerpt?: string | null
  body?: string | null
  taxonomy?: string | null
  updatedAt?: string | null
}

export type SearchHit = Pick<SearchDocument, 'id' | 'path' | 'title'> & {
  excerpt: string
  score: number
}

const words = (value: string) => value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
const plain = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()

export function highlightExcerpt(
  document: Pick<SearchDocument, 'summary' | 'excerpt' | 'body'> | string | null | undefined,
  query: string,
  limit = 220,
): string {
  let text = ''
  const q = query.trim().toLocaleLowerCase()
  const term = words(query)[0]

  if (typeof document === 'string' || !document) {
    text = plain(typeof document === 'string' ? document : '')
  } else {
    // Pick whichever field contains the search query or term first
    const fields = [document.body, document.excerpt, document.summary].filter(Boolean) as string[]
    const matchingField = fields.find((f) => {
      const lower = f.toLocaleLowerCase()
      return (q && lower.includes(q)) || (term && lower.includes(term))
    })
    text = plain(matchingField ?? document.excerpt ?? document.summary ?? document.body ?? '')
  }

  if (!term || !text) return text.slice(0, limit)

  const matchTerm = q && text.toLocaleLowerCase().includes(q) ? query.trim() : term
  const index = text.toLocaleLowerCase().indexOf(matchTerm.toLocaleLowerCase())
  const start = index >= 0 ? Math.max(0, index - Math.floor(limit / 3)) : 0
  const excerpt = text.slice(start, start + limit)

  const escaped = excerpt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const regexTerm = matchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const highlighted = escaped.replace(new RegExp(`(${regexTerm})`, 'ig'), '<mark>$1</mark>')
  return `${start ? '…' : ''}${highlighted}${start + limit < text.length ? '…' : ''}`
}

/** Local, deterministic search. PostgreSQL/Payload remains the source of truth; no queue or service is required. */
export function queryLocalSearch(input: {
  documents: readonly SearchDocument[]
  query: string
  siteId: string
  page?: number
  pageSize?: number
  now?: Date
}): { hits: SearchHit[]; total: number; page: number; pageCount: number } {
  const query = input.query.trim()
  const terms = words(query)
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 10, 50))
  const page = Math.max(1, input.page ?? 1)
  if (!terms.length) return { hits: [], total: 0, page, pageCount: 0 }

  const phrase = query.toLocaleLowerCase()

  const scored = input.documents
    .filter(
      (document) => document.siteId === input.siteId && canDiscoverPublic(document, input.now),
    )
    .map((document) => {
      const title = document.title.toLocaleLowerCase()
      const bodyText = plain(document.body).toLocaleLowerCase()
      const summaryText = plain(document.summary).toLocaleLowerCase()
      const excerptText = plain(document.excerpt).toLocaleLowerCase()
      const taxText = plain(document.taxonomy).toLocaleLowerCase()
      const allText = `${summaryText} ${excerptText} ${bodyText} ${taxText}`

      let score = 0
      // Full phrase bonus
      if (title === phrase) score += 200
      else if (title.includes(phrase)) score += 50
      if (allText.includes(phrase)) score += 25

      // Per-term scoring
      for (const term of terms) {
        if (title === term) score += 100
        else if (title.startsWith(term)) score += 30
        else if (title.includes(term)) score += 15

        if (taxText.includes(term)) score += 10
        if (summaryText.includes(term) || excerptText.includes(term)) score += 5
        if (bodyText.includes(term)) score += 3
      }

      return { document, score }
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        String(right.document.updatedAt ?? '').localeCompare(
          String(left.document.updatedAt ?? ''),
        ) ||
        left.document.title.localeCompare(right.document.title),
    )
  const total = scored.length
  return {
    hits: scored.slice((page - 1) * pageSize, page * pageSize).map(({ document, score }) => ({
      id: document.id,
      path: document.path,
      title: document.title,
      score,
      excerpt: highlightExcerpt(document, query),
    })),
    total,
    page,
    pageCount: Math.ceil(total / pageSize),
  }
}

export type RedirectRule = {
  id: string
  siteId: string
  fromPath: string
  toPath: string
  match: 'exact' | 'prefix' | 'regex'
  statusCode?: 301 | 302 | 307 | 308
  preserveQuery?: boolean
  enabled?: boolean
}
export type RedirectResolution =
  | { target: string; statusCode: 301 | 302 | 307 | 308; ruleIds: string[] }
  | { error: 'loop' | 'hop-limit' | 'missing-target' }
const normalPath = (value: string) =>
  value.startsWith('/') && !value.startsWith('//') ? value : ''

export function validateRedirectRule(rule: RedirectRule): string | true {
  if (!normalPath(rule.fromPath) || !normalPath(rule.toPath))
    return 'Paths must be same-site absolute paths.'
  if (rule.fromPath === rule.toPath) return 'A redirect cannot target itself.'
  if (rule.match === 'regex')
    try {
      new RegExp(rule.fromPath)
    } catch {
      return 'Regex pattern is invalid.'
    }
  return true
}

export function resolveRedirect(
  rules: readonly RedirectRule[],
  siteId: string,
  pathname: string,
  query = '',
  maxHops = 8,
): RedirectResolution | null {
  let path = pathname
  const visited = new Set<string>()
  const ruleIds: string[] = []
  for (let hop = 0; hop < maxHops; hop++) {
    const rule = rules.find(
      (candidate) =>
        candidate.siteId === siteId &&
        candidate.enabled !== false &&
        ((candidate.match === 'exact' && candidate.fromPath === path) ||
          (candidate.match === 'prefix' &&
            (path === candidate.fromPath || path.startsWith(`${candidate.fromPath}/`))) ||
          (candidate.match === 'regex' && new RegExp(candidate.fromPath).test(path))),
    )
    if (!rule)
      return ruleIds.length
        ? { target: `${path}${query && query !== '?' ? query : ''}`, statusCode: 308, ruleIds }
        : null
    if (!normalPath(rule.toPath)) return { error: 'missing-target' }
    if (visited.has(rule.id) || visited.has(rule.toPath)) return { error: 'loop' }
    visited.add(rule.id)
    visited.add(path)
    ruleIds.push(rule.id)
    path =
      rule.match === 'prefix'
        ? `${rule.toPath}${path.slice(rule.fromPath.length)}`
        : rule.match === 'regex'
          ? path.replace(new RegExp(rule.fromPath), rule.toPath)
          : rule.toPath
    if (!path) return { error: 'missing-target' }
    if (
      !rules.some(
        (candidate) =>
          candidate.siteId === siteId &&
          candidate.enabled !== false &&
          (candidate.match === 'exact'
            ? candidate.fromPath === path
            : candidate.match === 'prefix'
              ? path === candidate.fromPath || path.startsWith(`${candidate.fromPath}/`)
              : new RegExp(candidate.fromPath).test(path)),
      )
    )
      return {
        target: `${path}${rule.preserveQuery === false ? '' : query}`,
        statusCode: rule.statusCode ?? 308,
        ruleIds,
      }
  }
  return { error: 'hop-limit' }
}

/** Introduce a dedicated service only after 10k public documents or p95 local search >250ms for seven days. */
export const SEARCH_SERVICE_TRIGGER = {
  publicDocuments: 10_000,
  p95Milliseconds: 250,
  sustainedDays: 7,
} as const
