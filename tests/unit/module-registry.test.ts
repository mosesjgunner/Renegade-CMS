import { describe, expect, it, vi } from 'vitest'

import { loadConfig } from '../../src/modules/core/config'
import { registeredPayloadDomains } from '../../src/modules/payload-domains'
import {
  COLLECTION_WARN_THRESHOLD,
  OPTIONAL_MODULES,
  POSTGRES_FUNCTION_ARG_LIMIT,
  assertCollectionCountWithinLimit,
  floorCollectionSlugs,
  gatePayloadRegistrations,
  parseEnabledModules,
} from '../../src/modules/module-registry'

const testEnv = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/renegade',
  PAYLOAD_SECRET: '0123456789012345678901234567890123456789012345678',
  APP_URL: 'http://localhost:3000',
}

const fullRegistrations = () => registeredPayloadDomains(loadConfig(testEnv))

describe('progressive module registry', () => {
  it('registers only the lean floor by default and stays well below the PostgreSQL limit', () => {
    const full = fullRegistrations()
    const floor = gatePayloadRegistrations(full, { enabled: new Set() })

    // The default install must register far fewer collections than the raw set.
    expect(full.collections.length).toBeGreaterThan(POSTGRES_FUNCTION_ARG_LIMIT)
    expect(floor.collections.length).toBeLessThan(COLLECTION_WARN_THRESHOLD)

    const floorSlugs = floor.collections.map((collection) => collection.slug)
    // Everything needed to set up, log in, write and publish is present.
    for (const slug of [
      'users',
      'sites',
      'publications',
      'page-layouts',
      'content',
      'media-assets',
      'categories',
      'public-redirects',
    ])
      expect(floorSlugs).toContain(slug)

    // Outer-ring collections are gated off by default.
    for (const slug of ['products', 'books', 'subscribers', 'experiments', 'network-signing-keys'])
      expect(floorSlugs).not.toContain(slug)

    // The floor global survives; an optional-module global does not.
    expect(floor.globals.map((global) => global.slug)).toContain('site-settings')
    expect(floor.globals.map((global) => global.slug)).not.toContain('network-settings')
  })

  it('accounts for every collection: floor + all module collections === full set, with no overlap', () => {
    const full = fullRegistrations()
    const floor = new Set(floorCollectionSlugs(full))
    const owned = new Set<string>()
    for (const entry of OPTIONAL_MODULES)
      for (const slug of entry.collections) {
        expect(owned.has(slug)).toBe(false) // no collection claimed by two modules
        expect(floor.has(slug)).toBe(false) // no collection both floor and optional
        owned.add(slug)
      }
    expect(floor.size + owned.size).toBe(full.collections.length)
  })

  it("enabling an optional module registers exactly that module's collections", () => {
    const full = fullRegistrations()
    const floor = gatePayloadRegistrations(full, { enabled: new Set() })
    const commerce = OPTIONAL_MODULES.find((entry) => entry.id === 'commerce')!

    const withCommerce = gatePayloadRegistrations(full, {
      enabled: parseEnabledModules('commerce'),
    })

    expect(withCommerce.collections.length).toBe(
      floor.collections.length + commerce.collections.length,
    )
    const slugs = withCommerce.collections.map((collection) => collection.slug)
    for (const slug of commerce.collections) expect(slugs).toContain(slug)
    // A different module's collections remain gated off.
    expect(slugs).not.toContain('books')
  })

  it('enabling a module also registers its owned globals and tasks', () => {
    const full = fullRegistrations()
    const withNetwork = gatePayloadRegistrations(full, { enabled: parseEnabledModules('network') })
    expect(withNetwork.globals.map((global) => global.slug)).toContain('network-settings')
    expect(withNetwork.tasks.map((task) => task.slug)).toContain('network-delivery')

    const floor = gatePayloadRegistrations(full, { enabled: new Set() })
    expect(floor.tasks.map((task) => task.slug)).not.toContain('network-delivery')
  })

  it('preserves the established collection registration order when gating', () => {
    const full = fullRegistrations()
    const fullOrder = full.collections.map((collection) => collection.slug)
    const withCommerce = gatePayloadRegistrations(full, {
      enabled: parseEnabledModules('commerce'),
    }).collections.map((collection) => collection.slug)

    // The gated list is a subsequence of the full ordered list (order intact).
    let cursor = 0
    for (const slug of withCommerce) {
      cursor = fullOrder.indexOf(slug, cursor)
      expect(cursor).toBeGreaterThanOrEqual(0)
      cursor += 1
    }
  })

  it('the count guard trips BEFORE exceeding the PostgreSQL argument limit', () => {
    // Enabling everything would register more collections than PostgreSQL can
    // handle in one function call — the guard must throw a clear error, not a 500.
    const full = fullRegistrations()
    expect(() => gatePayloadRegistrations(full, { enabled: parseEnabledModules('all') })).toThrow(
      /PostgreSQL/i,
    )

    // Exactly at the limit throws; one below only warns.
    expect(() => assertCollectionCountWithinLimit(POSTGRES_FUNCTION_ARG_LIMIT)).toThrow(
      /PostgreSQL/i,
    )
    const warn = vi.fn()
    assertCollectionCountWithinLimit(POSTGRES_FUNCTION_ARG_LIMIT - 1, { warn })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('warns as the count approaches the limit but does not throw', () => {
    const warn = vi.fn()
    assertCollectionCountWithinLimit(COLLECTION_WARN_THRESHOLD, { warn })
    expect(warn).toHaveBeenCalledOnce()

    const quiet = vi.fn()
    assertCollectionCountWithinLimit(COLLECTION_WARN_THRESHOLD - 1, { warn: quiet })
    expect(quiet).not.toHaveBeenCalled()
  })

  it('allows the full set only with the explicit unsafe-count override (artifact generation)', () => {
    const full = fullRegistrations()
    const all = gatePayloadRegistrations(full, {
      enabled: parseEnabledModules('all'),
      allowUnsafeCollectionCount: true,
      warn: () => {},
    })
    expect(all.collections.length).toBe(full.collections.length)
  })

  it('prunes relationship fields that point at gated-off collections, and restores them when the owning module is enabled', () => {
    const full = fullRegistrations()

    // Recursively locate a top-level relationship field by name on a collection.
    const findField = (
      registrations: ReturnType<typeof gatePayloadRegistrations>,
      slug: string,
      fieldName: string,
    ) => {
      const collection = registrations.collections.find((entry) => entry.slug === slug)
      if (!collection) return undefined
      return (collection.fields as { name?: string }[]).find(
        (field) => field.name === fieldName,
      ) as { relationTo?: string | string[] } | undefined
    }

    const floor = gatePayloadRegistrations(full, { enabled: new Set() })
    // media-assets stays on the floor, but its `collections` field points at the
    // gated `albums` (media-studio) collection — it must be pruned so Payload's
    // config builder does not reject a dangling relationship.
    expect(floor.collections.map((c) => c.slug)).toContain('media-assets')
    expect(floor.collections.map((c) => c.slug)).not.toContain('albums')
    expect(findField(floor, 'media-assets', 'collections')).toBeUndefined()

    // Enabling media-studio brings `albums` back, so the field is preserved.
    const withMedia = gatePayloadRegistrations(full, {
      enabled: parseEnabledModules('media-studio'),
    })
    const restored = findField(withMedia, 'media-assets', 'collections')
    expect(restored).toBeDefined()
    expect(restored?.relationTo).toBe('albums')

    // Pruning never touches a relationship whose target is itself on the floor.
    expect(findField(floor, 'media-assets', 'tags')?.relationTo).toBe('tags')

    // Payload's internal collections (payload-*) are always considered present.
    expect(findField(floor, 'scheduled-publish-jobs', 'job')?.relationTo).toBe('payload-jobs')
  })

  it('parses the RENEGADE_MODULES env var tolerantly and rejects unknown ids', () => {
    expect(parseEnabledModules(undefined).size).toBe(0)
    expect(parseEnabledModules('').size).toBe(0)
    expect(parseEnabledModules('  Commerce , MEDIA-STUDIO ')).toEqual(
      new Set(['commerce', 'media-studio']),
    )
    expect(parseEnabledModules('all').size).toBe(OPTIONAL_MODULES.length)
    expect(() => parseEnabledModules('commerce,bogus')).toThrow(/Unknown RENEGADE_MODULES/i)
  })
})
