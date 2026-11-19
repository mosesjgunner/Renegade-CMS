/**
 * S2-10 regression tests: unified recipe execution with a durable
 * recovery journal.
 *
 * The journal lives in the execution-events outbox under a stable
 * site-scoped logical key. Proven here: begin/resume/complete/fail
 * semantics, prior-outcome returns for completed runs, persisted step
 * outcomes and staged media, orphan-media reconciliation after a hard
 * crash, the starter's completed-run short-circuit (no re-provision),
 * the additive collision plan for non-empty sites, and onboarding's
 * failure journaling through the real wrapper.
 */
import { describe, expect, it, vi } from 'vitest'

import { provisionOnboardingSite } from '@/modules/operations/onboarding'
import {
  beginRecipeRun,
  completeRecipeRun,
  failRecipeRun,
  getRecipeRun,
  recordRecipeSteps,
  reconcileRecipeMedia,
  refreshRecipeRun,
  stageRecipeMedia,
} from '@/modules/operations/recipe-execution'
import { starterDefinitions } from '@/modules/starters/definitions'
import { installStarter, planStarterInstall } from '@/modules/starters/service'

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
    return true
  })
}

function makeJournalStore() {
  const events: Doc[] = []
  const assets: Doc[] = []
  let sequence = 0
  const payload: any = {
    collections: { 'execution-events': {} },
    find: async ({ collection, where, limit }: any) => {
      const source = collection === 'execution-events' ? events : assets
      const docs = source.filter((doc) => matches(doc, where))
      return { docs: typeof limit === 'number' ? docs.slice(0, limit) : docs }
    },
    create: async ({ collection, data }: any) => {
      if (collection === 'execution-events') {
        if (events.some((event) => event.idempotencyKey === data.idempotencyKey))
          throw new Error('duplicate idempotency key')
        const doc = { id: `event-${++sequence}`, ...structuredClone(data) }
        events.push(doc)
        return structuredClone(doc)
      }
      const doc = { id: `doc-${++sequence}`, ...structuredClone(data) }
      assets.push(doc)
      return structuredClone(doc)
    },
    update: async ({ collection, id, data }: any) => {
      const source = collection === 'execution-events' ? events : assets
      const doc = source.find((entry) => String(entry.id) === String(id))
      if (!doc) throw new Error('not found')
      Object.assign(doc, structuredClone(data))
      return structuredClone(doc)
    },
  }
  return { payload, events, assets }
}

describe('S2-10 recipe journal', () => {
  it('runs begin → steps → complete, returns the prior outcome, and resumes failures', async () => {
    const { payload, events } = makeJournalStore()
    const run = await beginRecipeRun(payload, {
      siteId: 'site-1',
      kind: 'starter',
      recipeId: 'publication-community',
      recipeVersion: '1.0.0',
    })
    expect(run.state).toBe('new')
    expect(run.logicalKey).toBe('recipe:site-1:publication-community@1.0.0')
    await recordRecipeSteps(payload, run, {
      site: { status: 'done', targetId: 'site-1' },
      media: { status: 'done', detail: '3 assets' },
    })
    await stageRecipeMedia(payload, run, ['starters/site-1/abc/hero.png'])
    await failRecipeRun(payload, run, new Error('simulated crash'))
    expect(events).toHaveLength(1)
    expect(events[0].state).toBe('retrying')
    expect(events[0].lastError).toContain('simulated crash')

    const resumed = await beginRecipeRun(payload, {
      siteId: 'site-1',
      kind: 'starter',
      recipeId: 'publication-community',
      recipeVersion: '1.0.0',
    })
    expect(resumed.state).toBe('resumed')
    expect(resumed.data.steps.site?.targetId).toBe('site-1')
    expect(resumed.data.mediaKeys).toEqual(['starters/site-1/abc/hero.png'])
    expect(events[0].attempts).toBe(2)
    // The unique logical key means the store never holds two runs.
    expect(events).toHaveLength(1)

    await completeRecipeRun(payload, resumed, {
      summary: 'Installed Publication Community (1.0.0).',
      targets: { site: 'site-1' },
    })
    const again = await beginRecipeRun(payload, {
      siteId: 'site-1',
      kind: 'starter',
      recipeId: 'publication-community',
      recipeVersion: '1.0.0',
    })
    expect(again.state).toBe('completed')
    expect(again.data.summary).toContain('Installed Publication Community')
    const stored = await getRecipeRun(payload, 'site-1', 'publication-community', '1.0.0')
    expect(stored?.status).toBe('completed')

    // A refresh reopens the completed run without losing its steps.
    const refreshed = await refreshRecipeRun(payload, again)
    expect(refreshed.state).toBe('resumed')
    expect(refreshed.data.status).toBe('running')
    expect(refreshed.data.steps.media?.status).toBe('done')
  })

  it('reconciles staged media from incomplete runs and never touches completed runs', async () => {
    const { payload, assets } = makeJournalStore()
    const crashed = await beginRecipeRun(payload, {
      siteId: 'site-1',
      kind: 'starter',
      recipeId: 'publication-community',
      recipeVersion: '1.0.0',
    })
    await stageRecipeMedia(payload, crashed, [
      'starters/site-1/orphan.png',
      'starters/site-1/adopted.png',
    ])
    await failRecipeRun(payload, crashed, new Error('power loss'))
    const done = await beginRecipeRun(payload, {
      siteId: 'site-2',
      kind: 'starter',
      recipeId: 'publication-community',
      recipeVersion: '1.0.0',
    })
    await stageRecipeMedia(payload, done, ['starters/site-2/installed.png'])
    await completeRecipeRun(payload, done, { summary: 'done' })
    assets.push({ id: 'asset-1', storageLocation: 'starters/site-1/adopted.png' })

    const removedKeys: string[] = []
    const result = await reconcileRecipeMedia(payload, {
      remove: async (key: string) => {
        removedKeys.push(key)
      },
    })
    expect(result.removed).toEqual(['starters/site-1/orphan.png'])
    expect(result.kept).toEqual(['starters/site-1/adopted.png'])
    expect(removedKeys).toEqual(['starters/site-1/orphan.png'])
  })

  it('degrades to a non-journaled handle when the journal collection is unavailable', async () => {
    const payload: any = { collections: {} }
    const run = await beginRecipeRun(payload, {
      siteId: 'site-1',
      kind: 'starter',
      recipeId: 'x',
      recipeVersion: '1',
    })
    expect(run.journaled).toBe(false)
    await expect(completeRecipeRun(payload, run, { summary: 'noop' })).resolves.toBeUndefined()
  })
})

describe('S2-10 starter entry point under the journal', () => {
  it('returns the prior outcome for a completed run without opening a transaction', async () => {
    const { payload, events } = makeJournalStore()
    const run = await beginRecipeRun(payload, {
      siteId: 'site-1',
      kind: 'starter',
      recipeId: 'publication-community',
      recipeVersion: '1.0.0',
    })
    await completeRecipeRun(payload, run, { summary: 'Installed earlier.' })
    payload.db = {
      beginTransaction: vi.fn(async () => {
        throw new Error('must not provision')
      }),
    }
    const result = await installStarter(payload, {
      siteId: 'site-1',
      starterId: 'publication-community',
    })
    expect(result).toEqual({
      success: true,
      starterId: 'publication-community',
      siteId: 'site-1',
      summary: 'Installed earlier.',
    })
    expect(payload.db.beginTransaction).not.toHaveBeenCalled()
    expect(events).toHaveLength(1)
  })

  it('plans a non-empty site additively with named collisions', async () => {
    const starter = starterDefinitions['publication-community']
    const pagePath = starter.pages[0].canonicalPath
    const layoutPath = starter.templates[0]?.path ?? starter.layouts[0].path
    const payload: any = {
      find: async ({ collection, where }: any) => {
        const field =
          collection === 'content'
            ? 'canonicalPath'
            : collection === 'page-layouts'
              ? 'path'
              : 'originalFilename'
        const keys: string[] = (where.and[1] as any)[field].in
        const existing =
          collection === 'content' && keys.includes(pagePath)
            ? [{ id: 'content-1', canonicalPath: pagePath }]
            : collection === 'page-layouts' && keys.includes(layoutPath)
              ? [{ id: 'layout-1', path: layoutPath }]
              : []
        return { docs: existing }
      },
      count: async ({ collection }: any) => ({
        totalDocs: collection === 'content' ? 3 : 2,
      }),
    }
    const plan = await planStarterInstall(payload, {
      siteId: 'site-1',
      starterId: 'publication-community',
    })
    expect(plan.empty).toBe(false)
    expect(plan.collisions).toEqual(
      expect.arrayContaining([
        { kind: 'content', key: pagePath, existingId: 'content-1' },
        { kind: 'layout', key: layoutPath, existingId: 'layout-1' },
      ]),
    )
    expect(plan.additions.content).toBe(starter.pages.length + starter.articles.length - 1)
    expect(plan.additions.media).toBe(starter.media.length)
  })
})

describe('S2-10 onboarding under the journal', () => {
  it('journals a failed provision as a resumable run', async () => {
    const { payload, events } = makeJournalStore()
    const baseFind = payload.find
    payload.find = async (args: any) => {
      if (args.collection === 'sites')
        return { docs: [{ id: 'site-1', slug: 'test-site', name: 'Test Site' }] }
      if (args.collection === 'members') return { docs: [] }
      return baseFind(args)
    }
    const baseCreate = payload.create
    payload.create = async (args: any) => {
      if (args.collection === 'members') throw new Error('simulated crash')
      return baseCreate(args)
    }
    payload.update = async (args: any) => {
      if (args.collection === 'execution-events') {
        const doc = events.find((entry) => String(entry.id) === String(args.id))
        if (doc) Object.assign(doc, structuredClone(args.data))
        return doc
      }
      if (args.collection === 'sites') return { id: 'site-1' }
      throw new Error(`unexpected update ${args.collection}`)
    }
    await expect(
      provisionOnboardingSite(payload, 'owner@example.com', {
        name: 'Test Site',
        slug: 'test-site',
        description: 'A test site',
        primaryUrl: 'https://example.com',
        locale: 'en',
        timezone: 'UTC',
        themeId: 'neutral-starter',
        starterType: 'blank-minimal',
        featureProfile: 'Lean',
        optionalConnections: [],
        starterContent: false,
      }),
    ).rejects.toThrow('simulated crash')
    expect(events).toHaveLength(1)
    expect(events[0].payload.status).toBe('failed')
    expect(events[0].payload.kind).toBe('onboarding')
    expect(events[0].state).toBe('retrying')
    expect(events[0].lastError).toContain('simulated crash')
  })
})
