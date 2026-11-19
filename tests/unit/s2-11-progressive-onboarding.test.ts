/**
 * S2-11 regression tests: progressive starter onboarding.
 *
 * The first run takes only name, address, starter type and theme;
 * every other backend requirement arrives as a reported default. The
 * site is created prelaunch (draft lifecycle — the public site
 * resolver only serves 'active' sites), generated content is real
 * records through the normal onboarding path (the privacy page is a
 * clearly-labeled draft placeholder, never a published policy), the
 * journal shows the completed run, an operator edit survives a resume,
 * and only the explicit launch flips the site public.
 */
import { describe, expect, it } from 'vitest'

import {
  buildProgressiveOnboardingInput,
  getOnboardingStatus,
  launchOnboardedSite,
  startProgressiveOnboarding,
} from '@/modules/operations/onboarding'

type Doc = Record<string, any>

function matches(doc: Doc, where: any): boolean {
  if (!where) return true
  if (Array.isArray(where.and)) return where.and.every((w: any) => matches(doc, w))
  if (Array.isArray(where.or)) return where.or.some((w: any) => matches(doc, w))
  return Object.entries(where).every(([field, condition]) => {
    const value = doc[field]
    const c = condition as any
    if (c.equals !== undefined) return String(value ?? '') === String(c.equals)
    if (Array.isArray(c.in)) return c.in.map(String).includes(String(value ?? ''))
    if (c.not_equals !== undefined) return String(value ?? '') !== String(c.not_equals)
    return true
  })
}

function makeStore() {
  const data: Record<string, Doc[]> = {
    sites: [],
    members: [],
    'member-site-roles': [],
    profiles: [],
    spaces: [],
    brands: [],
    publications: [],
    content: [],
    'page-layouts': [],
    'execution-events': [],
  }
  let sequence = 0
  let globalSettings: Doc = {}
  const payload: any = {
    collections: { 'execution-events': {} },
    find: async ({ collection, where, limit }: any) => {
      const docs = (data[collection] ?? []).filter((doc) => matches(doc, where))
      return { docs: typeof limit === 'number' ? docs.slice(0, limit) : docs }
    },
    findByID: async ({ collection, id }: any) => {
      const doc = (data[collection] ?? []).find((entry) => String(entry.id) === String(id))
      if (!doc) throw new Error('not found')
      return doc
    },
    create: async ({ collection, data: input }: any) => {
      if (
        collection === 'execution-events' &&
        data['execution-events'].some((event) => event.idempotencyKey === input.idempotencyKey)
      )
        throw new Error('duplicate idempotency key')
      const doc = { id: `${collection}-${++sequence}`, ...structuredClone(input) }
      data[collection].push(doc)
      return structuredClone(doc)
    },
    update: async ({ collection, id, data: input }: any) => {
      const doc = (data[collection] ?? []).find((entry) => String(entry.id) === String(id))
      if (!doc) throw new Error('not found')
      Object.assign(doc, structuredClone(input))
      return structuredClone(doc)
    },
    findGlobal: async () => structuredClone(globalSettings),
    updateGlobal: async ({ data: input }: any) => {
      globalSettings = { ...globalSettings, ...structuredClone(input) }
      return structuredClone(globalSettings)
    },
  }
  return { payload, data }
}

const minimal = {
  name: 'Test Site',
  primaryUrl: 'https://example.com',
  starterType: 'blank-minimal' as const,
  themeId: 'neutral-starter',
}

describe('S2-11 progressive onboarding', () => {
  it('builds a complete valid input from four facts and reports every default', () => {
    const { input, defaultsApplied } = buildProgressiveOnboardingInput(minimal)
    expect(input.slug).toBe('test-site')
    expect(input.launchState).toBe('prelaunch')
    expect(input.starterContent).toBe(true)
    expect(input.optionalConnections).toEqual([])
    expect(defaultsApplied).toEqual(
      expect.arrayContaining(['locale', 'timezone', 'featureProfile', 'optionalConnections']),
    )
    const explicit = buildProgressiveOnboardingInput({ ...minimal, slug: 'my-place' })
    expect(explicit.input.slug).toBe('my-place')
  })

  it('provisions prelaunch with honest starter content, then launches explicitly', async () => {
    const { payload, data } = makeStore()
    const result = await startProgressiveOnboarding(payload, 'owner@example.com', minimal)
    const site = data.sites[0]
    expect(site.lifecycle).toBe('draft')
    expect(result.preview).toEqual({
      siteId: site.id,
      path: '/',
      themeId: 'neutral-starter',
      state: 'prelaunch',
    })
    expect(result.journal?.status).toBe('completed')

    // Generated inventory: real records, honest states. The privacy
    // page is a draft placeholder that says so; nothing fictional is
    // published as the operator's policy or claims.
    const pages = Object.fromEntries(
      data.content
        .filter((doc) => doc.contentType === 'page')
        .map((doc) => [doc.canonicalPath, doc]),
    )
    expect(Object.keys(pages).sort()).toEqual(['/', '/about', '/contact', '/privacy'])
    expect(pages['/privacy'].status).toBe('draft')
    expect(pages['/privacy'].summary).toContain('Replace this placeholder')
    expect(
      data.content.find((doc) => doc.canonicalPath === '/articles/welcome-draft')?.status,
    ).toBe('draft')
    // The public resolver's own predicate finds no active site yet.
    expect(data.sites.filter((doc) => doc.lifecycle === 'active')).toHaveLength(0)

    const status = await getOnboardingStatus(payload, site.id)
    expect(status.state).toBe('prelaunch')
    expect(status.journal?.conflicts).toEqual([])

    const launched = await launchOnboardedSite(payload, site.id)
    expect(launched.lifecycle).toBe('active')
    expect((await getOnboardingStatus(payload, site.id)).state).toBe('launched')
    // Launch is idempotent, never a second transition.
    expect((await launchOnboardedSite(payload, site.id)).lifecycle).toBe('active')
  })

  it('resumes without duplicates and preserves an operator edit', async () => {
    const { payload, data } = makeStore()
    const first = await startProgressiveOnboarding(payload, 'owner@example.com', minimal)
    const siteId = String(first.site.id)
    const home = data.content.find((doc) => doc.canonicalPath === '/')!
    home.title = 'My real homepage'
    const counts = Object.fromEntries(
      Object.entries(data).map(([collection, docs]) => [collection, docs.length]),
    )
    const second = await startProgressiveOnboarding(payload, 'owner@example.com', minimal)
    expect(String(second.site.id)).toBe(siteId)
    for (const [collection, count] of Object.entries(counts))
      expect(data[collection]).toHaveLength(count)
    expect(data.content.find((doc) => doc.canonicalPath === '/')?.title).toBe('My real homepage')
    // The resumed site stays prelaunch until the operator launches it.
    expect(data.sites[0].lifecycle).toBe('draft')
    expect((await getOnboardingStatus(payload, siteId)).journal?.status).toBe('completed')
  })

  it('reports not-started for an unknown site', async () => {
    const { payload } = makeStore()
    expect(await getOnboardingStatus(payload, 'nope')).toEqual({
      siteId: 'nope',
      state: 'not-started',
    })
  })
})
