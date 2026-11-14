import { describe, expect, it, vi } from 'vitest'

import {
  resolveRedirect,
  resolveRedirectForSite,
  segmentAncestors,
  type RedirectRule,
} from '../../src/modules/public/discovery'

type Row = {
  id: string
  fromPath: string
  toPath: string
  match: 'exact' | 'prefix' | 'regex'
  statusCode: number
  preserveQuery?: boolean
  enabled?: boolean
  hitCount?: number
  createdAt: string
}

const row = (partial: Partial<Row> & Pick<Row, 'id' | 'fromPath' | 'toPath'>): Row => ({
  match: 'exact',
  statusCode: 308,
  preserveQuery: true,
  enabled: true,
  hitCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...partial,
})

/**
 * Stub payload whose find honors exactly the where-shapes the candidate
 * loader issues (regex set; exact/prefix targeted set) and records how
 * many rows each call returns — the rows-read scoreboard for the lane.
 */
function stubPayload(rows: Row[], siteId = 'site-a') {
  const returnedRows: number[] = []
  const find = vi.fn(async (args: Record<string, unknown>) => {
    const where = args.where as {
      and: Array<Record<string, unknown>>
    }
    const clauses = where.and
    const has = (field: string, op: string, value: unknown) =>
      clauses.some(
        (clause) =>
          (clause[field] as Record<string, unknown> | undefined)?.[op] === value ||
          ((clause.or as Array<Record<string, unknown>> | undefined) ?? []).some((sub) =>
            ((sub.and as Array<Record<string, unknown>> | undefined) ?? []).some(
              (leaf) => (leaf[field] as Record<string, unknown> | undefined)?.[op] === value,
            ),
          ),
      )
    let docs: Row[]
    if (has('match', 'equals', 'regex')) {
      docs = rows.filter((r) => r.match === 'regex')
    } else {
      const orClauses = (clauses.find((c) => Array.isArray(c.or))?.or ?? []) as Array<{
        and: Array<Record<string, unknown>>
      }>
      const exactPath = ((
        orClauses[0]?.and.find((l) => 'fromPath' in l)?.fromPath as { equals?: string }
      )?.equals ?? '') as string
      const prefixList = ((
        orClauses[1]?.and.find((l) => 'fromPath' in l)?.fromPath as { in?: string[] }
      )?.in ?? []) as string[]
      docs = rows.filter(
        (r) =>
          (r.match === 'exact' && r.fromPath === exactPath) ||
          (r.match === 'prefix' && prefixList.includes(r.fromPath)),
      )
    }
    returnedRows.push(docs.length)
    return { docs: docs.map((r) => ({ ...r, site: siteId })) }
  })
  return { payload: { find } as never, find, returnedRows }
}

const asRule = (r: Row, siteId = 'site-a'): RedirectRule => ({
  id: r.id,
  siteId,
  fromPath: r.fromPath,
  toPath: r.toPath,
  match: r.match,
  statusCode: r.statusCode as RedirectRule['statusCode'],
  preserveQuery: r.preserveQuery !== false,
  enabled: r.enabled !== false,
})

describe('segmentAncestors', () => {
  it('lists the path and every segment ancestor', () => {
    expect(segmentAncestors('/a/b/c')).toEqual(['/a/b/c', '/a/b', '/a', '/'])
    expect(segmentAncestors('/')).toEqual(['/'])
    expect(segmentAncestors('/a')).toEqual(['/a', '/'])
  })
})

describe('resolveRedirectForSite', () => {
  it('reads only regex rows for a no-match path in a 1,000-rule set', async () => {
    const rows: Row[] = []
    for (let i = 0; i < 997; i++)
      rows.push(row({ id: `r${i}`, fromPath: `/old-${i}`, toPath: `/new-${i}` }))
    rows.push(
      row({ id: 'rx1', fromPath: '^/legacy/(.*)$', toPath: '/modern/$1', match: 'regex' }),
      row({ id: 'rx2', fromPath: '^/blog/(.*)$', toPath: '/news/$1', match: 'regex' }),
      row({ id: 'px1', fromPath: '/docs', toPath: '/help', match: 'prefix' }),
    )
    const { payload, returnedRows } = stubPayload(rows)
    const { resolution } = await resolveRedirectForSite(payload, 'site-a', '/nothing/here')
    expect(resolution).toBeNull()
    // 2 regex rows + 0 targeted rows — not 1,000.
    expect(returnedRows.reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('resolves an exact rule and reports its hit count for telemetry', async () => {
    const rows = [row({ id: 'e1', fromPath: '/old', toPath: '/new', statusCode: 301, hitCount: 7 })]
    const { payload } = stubPayload(rows)
    const { resolution, matchedRules } = await resolveRedirectForSite(
      payload,
      'site-a',
      '/old',
      '?a=1',
    )
    expect(resolution).toMatchObject({ target: '/new?a=1', statusCode: 301, ruleIds: ['e1'] })
    expect(matchedRules).toHaveLength(1)
    expect(matchedRules[0].hitCount).toBe(7)
  })

  it('resolves prefix and regex rules', async () => {
    const rows = [
      row({ id: 'p1', fromPath: '/docs', toPath: '/help', match: 'prefix' }),
      row({ id: 'x1', fromPath: '^/legacy/(.*)$', toPath: '/modern/$1', match: 'regex' }),
    ]
    const { payload } = stubPayload(rows)
    const prefix = await resolveRedirectForSite(payload, 'site-a', '/docs/guide/intro')
    expect(prefix.resolution).toMatchObject({ target: '/help/guide/intro' })
    const regex = await resolveRedirectForSite(payload, 'site-a', '/legacy/post')
    expect(regex.resolution).toMatchObject({ target: '/modern/post' })
  })

  it('applies creation order across match types (oldest matching rule wins)', async () => {
    const rows = [
      row({
        id: 'exact-new',
        fromPath: '/a/b',
        toPath: '/exact-target',
        createdAt: '2026-02-01T00:00:00.000Z',
      }),
      row({
        id: 'prefix-old',
        fromPath: '/a',
        toPath: '/prefix-target',
        match: 'prefix',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ]
    const { payload } = stubPayload(rows)
    const { resolution } = await resolveRedirectForSite(payload, 'site-a', '/a/b')
    expect(resolution).toMatchObject({ target: '/prefix-target/b' })
  })

  it('skips disabled rules', async () => {
    const rows = [row({ id: 'd1', fromPath: '/gone', toPath: '/new', enabled: false })]
    const { payload } = stubPayload(rows)
    const { resolution } = await resolveRedirectForSite(payload, 'site-a', '/gone')
    expect(resolution).toBeNull()
  })

  it('follows a chain with per-hop candidate loads', async () => {
    const rows = [
      row({ id: 'c1', fromPath: '/a', toPath: '/b' }),
      row({ id: 'c2', fromPath: '/b', toPath: '/c', statusCode: 302 }),
    ]
    const { payload } = stubPayload(rows)
    const { resolution } = await resolveRedirectForSite(payload, 'site-a', '/a')
    expect(resolution).toMatchObject({ target: '/c', statusCode: 302, ruleIds: ['c1', 'c2'] })
  })

  it('reports a loop', async () => {
    const rows = [
      row({ id: 'l1', fromPath: '/a', toPath: '/b' }),
      row({ id: 'l2', fromPath: '/b', toPath: '/a' }),
    ]
    const { payload } = stubPayload(rows)
    const { resolution } = await resolveRedirectForSite(payload, 'site-a', '/a')
    expect(resolution).toEqual({ error: 'loop' })
  })

  it('agrees with resolveRedirect over the creation-ordered full set', async () => {
    const rows = [
      row({ id: 'a1', fromPath: '/old', toPath: '/new', statusCode: 301 }),
      row({ id: 'a2', fromPath: '/docs', toPath: '/help', match: 'prefix' }),
      row({ id: 'a3', fromPath: '^/legacy/(.*)$', toPath: '/modern/$1', match: 'regex' }),
      row({ id: 'a4', fromPath: '/chain', toPath: '/old' }),
      row({ id: 'a5', fromPath: '/off', toPath: '/on', enabled: false }),
    ]
    const sorted = [...rows].sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    const fullRules = sorted.map((r) => asRule(r))
    const { payload } = stubPayload(rows)
    for (const path of ['/old', '/docs/x', '/legacy/y', '/chain', '/off', '/none']) {
      const viaLoader = await resolveRedirectForSite(payload, 'site-a', path, '?q=2')
      const viaArray = resolveRedirect(fullRules, 'site-a', path, '?q=2')
      expect(viaLoader.resolution).toEqual(viaArray)
    }
  })
})
