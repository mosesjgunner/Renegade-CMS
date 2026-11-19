/**
 * POD-08 — Clip browser + fuzzy search (PURE CORE; tool map rows
 * 17–19).
 *
 * The clip browser is a media-library-backed query model: clips are
 * scoped by show and/or site, or pulled in through FOLLOWED
 * collections (albums) — a clip is visible when it belongs to the
 * current show, the current site, or a followed collection. Library
 * changes arrive as events (`asset-added` / `asset-updated` /
 * `asset-removed`); the store applies them and emits an `invalidate`
 * event so the UI re-queries — the "live folder view" behaviour,
 * without the browser core owning any fetching.
 *
 * Fuzzy search is the CurryCaster II behaviour (row 18, clean-room —
 * II is unlicensed; the behaviour is: typo-tolerant matching with
 * near-hits MARKED). `fuzzyMatch` returns a score plus matched ranges
 * in the title, and flags `nearHit` when the match needed typo
 * tolerance (edit distance) rather than an exact substring — the UI
 * renders near-hits with the "≈" marker in a different colour.
 * Tolerated typo classes: transpositions, a missing/extra letter, and
 * one substituted letter (Damerau–Levenshtein distance), plus plain
 * substring and subsequence matches.
 */

export type ClipLibraryItem = {
  assetId: string
  title: string
  showId?: string
  siteId?: string
  collectionIds: string[]
  durationSec?: number
  updatedAt?: string
}

export type ClipScope = {
  showId?: string
  siteId?: string
  followedCollectionIds?: string[]
}

/** Scope rule: show match OR site match OR a followed collection contains the clip. */
export const clipInScope = (item: ClipLibraryItem, scope: ClipScope): boolean => {
  if (scope.showId && item.showId === scope.showId) return true
  if (scope.siteId && item.siteId === scope.siteId) return true
  if (
    scope.followedCollectionIds &&
    item.collectionIds.some((id) => scope.followedCollectionIds!.includes(id))
  ) {
    return true
  }
  return !scope.showId && !scope.siteId && !(scope.followedCollectionIds?.length ?? 0)
}

export const queryClips = (items: ClipLibraryItem[], scope: ClipScope): ClipLibraryItem[] =>
  items.filter((item) => clipInScope(item, scope))

export type ClipLibraryEvent =
  | { type: 'asset-added'; item: ClipLibraryItem }
  | { type: 'asset-updated'; item: ClipLibraryItem }
  | { type: 'asset-removed'; assetId: string }

/**
 * Live clip store: holds the library snapshot, applies library events,
 * and notifies subscribers with an invalidation for the affected asset
 * (the UI re-runs its scoped query/search on invalidation).
 */
export class ClipBrowserStore {
  private items: ClipLibraryItem[]
  private readonly listeners = new Set<(event: ClipLibraryEvent & { invalidated: true }) => void>()

  constructor(items: ClipLibraryItem[] = []) {
    this.items = [...items]
  }

  snapshot(): ClipLibraryItem[] {
    return [...this.items]
  }

  query(scope: ClipScope): ClipLibraryItem[] {
    return queryClips(this.items, scope)
  }

  search(scope: ClipScope, query: string): FuzzySearchResult[] {
    return searchClips(this.query(scope), query)
  }

  subscribe(listener: (event: ClipLibraryEvent & { invalidated: true }) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  applyLibraryEvent(event: ClipLibraryEvent): void {
    if (event.type === 'asset-removed') {
      this.items = this.items.filter((item) => item.assetId !== event.assetId)
    } else {
      const index = this.items.findIndex((item) => item.assetId === event.item.assetId)
      if (index >= 0) this.items[index] = event.item
      else this.items.push(event.item)
    }
    for (const listener of this.listeners) listener({ ...event, invalidated: true })
  }
}

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

export type FuzzyMatch = {
  /** Higher is better. Exact substring = 100 band; near hits below it. */
  score: number
  /** [start, end) ranges in the title that matched. */
  matchedRanges: Array<[number, number]>
  /** True when typo tolerance was needed (render with the ≈ marker). */
  nearHit: boolean
}

/** Damerau–Levenshtein distance (transpositions cost 1). */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[m][n]
}

const maxEditsFor = (queryLength: number): number =>
  queryLength <= 3 ? 0 : queryLength <= 6 ? 1 : 2

/**
 * Matches a query against a title. Returns null on no match.
 * Order of attempts: exact substring (not a near hit) → per-word
 * Damerau–Levenshtein within the edit budget (near hit, range = the
 * word) → subsequence over the whole title (near hit, ranges = the
 * matched letters).
 */
export function fuzzyMatch(query: string, title: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const t = title.toLowerCase()

  const substringAt = t.indexOf(q)
  if (substringAt >= 0) {
    return {
      score: 100 - substringAt * 0.1,
      matchedRanges: [[substringAt, substringAt + q.length]],
      nearHit: false,
    }
  }

  const maxEdits = maxEditsFor(q.length)
  if (maxEdits > 0) {
    let best: { distance: number; start: number; end: number } | null = null
    const wordPattern = /[^\s]+/g
    let match: RegExpExecArray | null
    while ((match = wordPattern.exec(t)) !== null) {
      const word = match[0]
      // Compare against the whole word and its query-length window so a
      // typo inside a longer word still lands.
      const candidates = [word, word.slice(0, q.length + maxEdits)]
      for (const candidate of candidates) {
        const distance = damerauLevenshtein(q, candidate)
        if (distance <= maxEdits && (!best || distance < best.distance)) {
          best = { distance, start: match.index, end: match.index + candidate.length }
        }
      }
    }
    if (best) {
      return {
        score: 80 - best.distance * 10,
        matchedRanges: [[best.start, best.end]],
        nearHit: true,
      }
    }
  }

  // Subsequence fallback: every query letter appears in order.
  const ranges: Array<[number, number]> = []
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      ranges.push([ti, ti + 1])
      qi++
    }
  }
  if (qi === q.length) return { score: 40, matchedRanges: ranges, nearHit: true }

  return null
}

export type FuzzySearchResult = {
  item: ClipLibraryItem
  match: FuzzyMatch
}

/** Searches items by title; results sorted best-first. Empty query returns all items (score 0). */
export function searchClips(items: ClipLibraryItem[], query: string): FuzzySearchResult[] {
  if (!query.trim()) {
    return items.map((item) => ({
      item,
      match: { score: 0, matchedRanges: [], nearHit: false },
    }))
  }
  const results: FuzzySearchResult[] = []
  for (const item of items) {
    const match = fuzzyMatch(query, item.title)
    if (match) results.push({ item, match })
  }
  return results.sort((a, b) => b.match.score - a.match.score)
}
