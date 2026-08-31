import { canDiscoverPublic, type PublicState } from './contracts'

export type SearchDocument = PublicState & {
  id: string
  siteId: string
  path: string
  title: string
  summary?: string | null
  excerpt?: string | null
  body?: string | null
  updatedAt?: string | null
}

export type SearchHit = Pick<SearchDocument, 'id' | 'path' | 'title'> & {
  excerpt: string
  score: number
}

const words = (value: string) => value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
const plain = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()

export function highlightExcerpt(
  value: string | null | undefined,
  query: string,
  limit = 220,
): string {
  const text = plain(value)
  const term = words(query)[0]
  if (!term || !text) return text.slice(0, limit)
  const index = text.toLocaleLowerCase().indexOf(term)
  const start = Math.max(0, index - Math.floor(limit / 3))
  const excerpt = text.slice(start, start + limit)
  return `${start ? '…' : ''}${excerpt.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>')}${start + limit < text.length ? '…' : ''}`
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
  const terms = words(input.query)
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 10, 50))
  const page = Math.max(1, input.page ?? 1)
  if (!terms.length) return { hits: [], total: 0, page, pageCount: 0 }
  const scored = input.documents
    .filter(
      (document) => document.siteId === input.siteId && canDiscoverPublic(document, input.now),
    )
    .map((document) => {
      const title = document.title.toLocaleLowerCase()
      const text =
        `${plain(document.summary)} ${plain(document.excerpt)} ${plain(document.body)}`.toLocaleLowerCase()
      const score = terms.reduce(
        (total, term) =>
          total +
          (title === term ? 100 : title.startsWith(term) ? 30 : title.includes(term) ? 15 : 0) +
          (text.includes(term) ? 3 : 0),
        0,
      )
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
      excerpt: highlightExcerpt(document.excerpt ?? document.summary ?? document.body, input.query),
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
