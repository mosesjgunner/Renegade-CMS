/**
 * S2-01 regression tests: the presentation import boundary.
 *
 * The double below simulates the transactional contract the service relies
 * on: writes carrying a transactionID are staged, commit applies them,
 * rollback discards them. Route tests exercise the real grant resolution
 * (member → member-site-roles) against the same store.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const world = vi.hoisted(() => ({
  payload: null as never,
}))

vi.mock('payload', () => ({
  getPayload: async () => world.payload,
}))
vi.mock('@payload-config', () => ({ default: {} }))

import { POST } from '@/app/(frontend)/api/presentation/import/route'
import {
  importPresentationPackage,
  PresentationImportAccessError,
  type PresentationPackage,
} from '@/modules/presentation/composition'

// ---------------------------------------------------------------------------
// In-memory transactional store
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: string }

function matchesWhere(row: Row, where: Record<string, unknown>): boolean {
  if (!where || Object.keys(where).length === 0) return true
  if (Array.isArray(where.and)) return where.and.every((w) => matchesWhere(row, w))
  if (Array.isArray(where.or)) return where.or.some((w) => matchesWhere(row, w))
  return Object.entries(where).every(([field, condition]) => {
    const expected = (condition as { equals?: unknown }).equals
    return String(row[field] ?? '') === String(expected ?? '')
  })
}

function makeWorld(options?: { failOnCreatePath?: string }) {
  const layouts = new Map<string, Row>()
  const content = new Map<string, Row>()
  const media = new Map<string, Row>()
  const members: Row[] = [{ id: 'member-1', email: 'op@example.com' }]
  const roleGrants: Row[] = [
    { id: 'grant-1', member: 'member-1', site: 'site-alpha', role: 'administrator' },
  ]
  const sites: Row[] = [{ id: 'site-alpha' }, { id: 'site-beta' }]
  let staged: Map<string, Row> | null = null
  let sequence = 0
  const calls = { create: 0, update: 0, begin: 0, commit: 0, rollback: 0 }

  const storeFor = (collection: string, req?: { transactionID?: string }) => {
    if (collection === 'page-layouts') return req?.transactionID ? (staged ?? layouts) : layouts
    if (collection === 'content') return content
    if (collection === 'media') return media
    return new Map<string, Row>()
  }

  const payload = {
    jobs: { queue: async () => ({ id: 'job' }) },
    db: {
      beginTransaction: async () => {
        calls.begin++
        staged = new Map(layouts)
        return 'tx-1'
      },
      commitTransaction: async () => {
        calls.commit++
        if (staged) {
          layouts.clear()
          for (const [key, value] of staged) layouts.set(key, value)
          staged = null
        }
        return true
      },
      rollbackTransaction: async () => {
        calls.rollback++
        staged = null
        return true
      },
    },
    auth: async () => ({
      user: { id: 'user-1', role: 'staff', email: 'op@example.com', member: 'member-1' },
    }),
    find: async (args: {
      collection: string
      where?: Record<string, unknown>
      req?: { transactionID?: string }
    }) => {
      if (args.collection === 'members') {
        return { docs: members.filter((m) => matchesWhere(m, args.where ?? {})) }
      }
      if (args.collection === 'member-site-roles') {
        return { docs: roleGrants.filter((g) => matchesWhere(g, args.where ?? {})) }
      }
      if (args.collection === 'sites') return { docs: sites }
      const store = storeFor(args.collection, args.req)
      return { docs: [...store.values()].filter((r) => matchesWhere(r, args.where ?? {})) }
    },
    create: async (args: {
      collection: string
      data: Record<string, unknown>
      req?: { transactionID?: string }
    }) => {
      calls.create++
      if (options?.failOnCreatePath && args.data.path === options.failOnCreatePath) {
        throw new Error('Injected create failure.')
      }
      const store = storeFor(args.collection, args.req)
      const row: Row = { ...args.data, id: `target-${++sequence}` }
      store.set(row.id, row)
      return row
    },
    update: async (args: {
      collection: string
      id: string
      data: Record<string, unknown>
      req?: { transactionID?: string }
    }) => {
      calls.update++
      const store = storeFor(args.collection, args.req)
      const row: Row = { ...(store.get(args.id) ?? { id: args.id }), ...args.data, id: args.id }
      store.set(args.id, row)
      return row
    },
  }

  return { payload: payload as never, layouts, content, media, calls }
}

function layout(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    id: 'src-layout',
    siteId: 'site-alpha',
    path: '/landing',
    status: 'published',
    themeId: 'neutral-starter',
    surface: 'page',
    slot: 'main',
    blocks: [
      {
        id: 'b1',
        component: 'publisher.rich-content',
        componentVersion: 1,
        props: { title: 'Hi', body: 'Body text.' },
      },
    ],
    unknownBlocks: [],
    revision: 1,
    publishedRevision: 1,
    ...overrides,
  }
}

function pkg(layouts: {
  pages?: Record<string, unknown>[]
  templates?: Record<string, unknown>[]
  patterns?: Record<string, unknown>[]
  globals?: Record<string, unknown>[]
}): PresentationPackage {
  return {
    schema: 'renegade-presentation-package',
    version: 1,
    exportedAt: '2026-11-17T00:00:00.000Z',
    siteId: 'site-alpha',
    theme: { id: 'neutral-starter' },
    pages: (layouts.pages ?? []) as never,
    templates: (layouts.templates ?? []) as never,
    patterns: (layouts.patterns ?? []) as never,
    globals: (layouts.globals ?? []) as never,
  }
}

describe('S2-01 import service boundary', () => {
  it('rolls back the whole batch when a later write fails', async () => {
    const w = makeWorld({ failOnCreatePath: '/second' })
    await expect(
      importPresentationPackage(w.payload, {
        siteId: 'site-beta',
        targetThemeId: 'neutral-starter',
        packageData: pkg({
          pages: [layout({ id: 'p1', path: '/first' }), layout({ id: 'p2', path: '/second' })],
        }),
      }),
    ).rejects.toThrow('Injected create failure.')
    expect(w.layouts.size).toBe(0)
    expect(w.calls.rollback).toBe(1)
    expect(w.calls.commit).toBe(0)
  })

  it('stages imported records as drafts even when the source was published', async () => {
    const w = makeWorld()
    const result = await importPresentationPackage(w.payload, {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({})] }),
    })
    expect(result.importedCount).toBe(1)
    const [record] = [...w.layouts.values()]
    expect(record.status).toBe('draft')
    expect(record.publishedRevision).toBeUndefined()
  })

  it('updates only the draft of a published target; the published revision survives', async () => {
    const w = makeWorld()
    w.layouts.set('existing-1', {
      id: 'existing-1',
      site: 'site-beta',
      path: '/landing',
      status: 'published',
      revision: 3,
      publishedRevision: 3,
      publishedPresentation: { marker: 'live-snapshot' },
      blocks: [{ id: 'old', component: 'publisher.rich-content', componentVersion: 1, props: {} }],
      revisionHistory: [],
    })
    const result = await importPresentationPackage(w.payload, {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({ revision: 3 })] }),
    })
    expect(result.importedCount).toBe(1)
    const record = w.layouts.get('existing-1')!
    expect(record.status).toBe('published')
    expect(record.publishedRevision).toBe(3)
    expect(record.publishedPresentation).toEqual({ marker: 'live-snapshot' })
    expect((record.blocks as unknown[])[0]).toMatchObject({ id: 'b1' })
  })

  it('rejects a conflicting target revision without touching the record', async () => {
    const w = makeWorld()
    w.layouts.set('existing-1', {
      id: 'existing-1',
      site: 'site-beta',
      path: '/landing',
      status: 'draft',
      revision: 7,
      blocks: [
        { id: 'operator', component: 'publisher.rich-content', componentVersion: 1, props: {} },
      ],
    })
    const result = await importPresentationPackage(w.payload, {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({ revision: 1 })] }),
    })
    expect(result.conflicts).toEqual([
      { layoutPath: '/landing', targetRevision: 7, packageRevision: 1 },
    ])
    expect(result.importedCount).toBe(0)
    expect(w.calls.create + w.calls.update).toBe(0)
    expect((w.layouts.get('existing-1')!.blocks as unknown[])[0]).toMatchObject({
      id: 'operator',
    })
  })

  it('is idempotent on retry: no duplicated records, stable target id', async () => {
    const w = makeWorld()
    const args = {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({})] }),
    }
    await importPresentationPackage(w.payload, args)
    const firstId = [...w.layouts.keys()][0]
    await importPresentationPackage(w.payload, args)
    expect(w.layouts.size).toBe(1)
    expect([...w.layouts.keys()][0]).toBe(firstId)
  })

  it('remaps template and pattern identities to target records', async () => {
    const w = makeWorld()
    const result = await importPresentationPackage(w.payload, {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({
        templates: [layout({ id: 'src-tpl', path: '__template__/main', surface: 'template' })],
        patterns: [layout({ id: 'src-pat', path: '__pattern__/ethics', surface: 'pattern' })],
        pages: [
          layout({
            id: 'src-page',
            templateId: 'src-tpl',
            blocks: [
              {
                id: 'b1',
                component: 'publisher.pattern',
                componentVersion: 1,
                props: {
                  patternId: 'src-pat',
                  patternName: 'Ethics',
                  patternVersion: 1,
                  mode: 'linked',
                },
              },
            ],
          }),
        ],
      }),
    })
    expect(result.importedCount).toBe(3)
    const byPath = new Map([...w.layouts.values()].map((r) => [r.path as string, r]))
    const page = byPath.get('/landing')!
    expect(page.templateId).toBe(byPath.get('__template__/main')!.id)
    expect(page.templateId).not.toBe('src-tpl')
    const block = (page.blocks as Array<{ props: Record<string, unknown> }>)[0]
    expect(block.props.patternId).toBe(byPath.get('__pattern__/ethics')!.id)
  })

  it('rejects a template reference that exists only in another site', async () => {
    const w = makeWorld()
    w.layouts.set('foreign-tpl', {
      id: 'foreign-tpl',
      site: 'site-alpha',
      path: '__template__/main',
      surface: 'template',
      revision: 1,
      blocks: [],
    })
    const result = await importPresentationPackage(w.payload, {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({ templateId: 'foreign-tpl' })] }),
    })
    expect(result.compatible).toBe(false)
    expect(result.incompatibilities.some((i) => i.reason.includes('Template'))).toBe(true)
    expect(w.calls.create + w.calls.update).toBe(0)
  })

  it('rebinds foreign content links to target records by canonical path', async () => {
    const w = makeWorld()
    w.content.set('c-beta', {
      id: 'c-beta',
      site: 'site-beta',
      canonicalPath: '/about',
      title: 'About Beta',
    })
    const result = await importPresentationPackage(w.payload, {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({
        pages: [
          layout({
            blocks: [
              {
                id: 'b1',
                component: 'publisher.cta',
                componentVersion: 1,
                props: {
                  title: 'Go',
                  body: 'Click to read more.',
                  link: {
                    id: 'content:c-alpha',
                    siteId: 'site-alpha',
                    label: 'About',
                    href: '/about',
                  },
                },
              },
            ],
          }),
        ],
      }),
    })
    expect(result.compatible).toBe(true)
    const [record] = [...w.layouts.values()]
    const block = (record.blocks as Array<{ props: Record<string, never> }>)[0]
    expect(block.props.link).toMatchObject({ id: 'content:c-beta', siteId: 'site-beta' })
  })

  it('rejects a foreign link whose target content does not exist in the target site', async () => {
    const w = makeWorld()
    const result = await importPresentationPackage(w.payload, {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({
        pages: [
          layout({
            blocks: [
              {
                id: 'b1',
                component: 'publisher.cta',
                componentVersion: 1,
                props: {
                  title: 'Go',
                  body: 'Click to read more.',
                  link: {
                    id: 'content:c-alpha',
                    siteId: 'site-alpha',
                    label: 'About',
                    href: '/about',
                  },
                },
              },
            ],
          }),
        ],
      }),
    })
    expect(result.compatible).toBe(false)
    expect(w.layouts.size).toBe(0)
  })

  it('throws before any write when the caller has no grant for the target site', async () => {
    const w = makeWorld()
    await expect(
      importPresentationPackage(w.payload, {
        siteId: 'site-beta',
        targetThemeId: 'neutral-starter',
        packageData: pkg({ pages: [layout({})] }),
        user: { id: 'user-9', role: 'staff', authorizedSiteIds: ['site-alpha'] } as never,
      }),
    ).rejects.toBeInstanceOf(PresentationImportAccessError)
    expect(w.calls.begin).toBe(0)
    expect(w.layouts.size).toBe(0)
  })

  it('dry run reports conflicts and references without writing', async () => {
    const w = makeWorld()
    w.layouts.set('existing-1', {
      id: 'existing-1',
      site: 'site-beta',
      path: '/landing',
      status: 'draft',
      revision: 5,
      blocks: [],
    })
    const result = await importPresentationPackage(w.payload, {
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({ revision: 1 })] }),
      dryRun: true,
    })
    expect(result.conflicts).toHaveLength(1)
    expect(result.importedCount).toBe(0)
    expect(w.calls.create + w.calls.update).toBe(0)
  })
})

describe('S2-01 import route boundary', () => {
  beforeEach(() => {
    world.payload = makeWorld().payload
  })

  const post = (body: unknown) =>
    POST(
      new Request('http://localhost/api/presentation/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )

  it('returns 403 and writes nothing for a site the caller has no grant for', async () => {
    const w = makeWorld()
    world.payload = w.payload
    const response = await post({
      siteId: 'site-beta',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({})] }),
    })
    expect(response.status).toBe(403)
    expect(w.layouts.size).toBe(0)
    expect(w.calls.begin).toBe(0)
  })

  it('imports into a granted site and stages the record as a draft', async () => {
    const w = makeWorld()
    world.payload = w.payload
    const response = await post({
      siteId: 'site-alpha',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({})] }),
    })
    expect(response.status).toBe(200)
    const [record] = [...w.layouts.values()]
    expect(record.status).toBe('draft')
    expect(record.site).toBe('site-alpha')
  })

  it('returns 409 when the target record has moved past the package revision', async () => {
    const w = makeWorld()
    world.payload = w.payload
    w.layouts.set('existing-1', {
      id: 'existing-1',
      site: 'site-alpha',
      path: '/landing',
      status: 'draft',
      revision: 9,
      blocks: [],
    })
    const response = await post({
      siteId: 'site-alpha',
      targetThemeId: 'neutral-starter',
      packageData: pkg({ pages: [layout({ revision: 1 })] }),
    })
    expect(response.status).toBe(409)
    expect(w.calls.create + w.calls.update).toBe(0)
  })

  it('rejects an oversized body before parsing', async () => {
    const response = await POST(
      new Request('http://localhost/api/presentation/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(11 * 1024 * 1024) },
        body: '{}',
      }),
    )
    expect(response.status).toBe(413)
  })
})
