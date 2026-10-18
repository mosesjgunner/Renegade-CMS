import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/modules/core/config'
import { registeredPayloadDomains } from '../../src/modules/payload-domains'
import {
  POSTGRES_FUNCTION_ARG_LIMIT,
  gatePayloadRegistrations,
  parseEnabledModules,
  floorCollectionSlugs,
  OPTIONAL_MODULES,
} from '../../src/modules/module-registry'
import { isRegisteredCollection } from '../../src/modules/public/registered-collections'

const testEnv = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/renegade',
  PAYLOAD_SECRET: '0123456789012345678901234567890123456789012345678',
  APP_URL: 'http://localhost:3000',
}

const getFullRegistrations = () => registeredPayloadDomains(loadConfig(testEnv))

describe('02D: Module-Profile Acceptance Matrix', () => {
  describe('Profile 1: Lean / Default', () => {
    it('registers the core baseline collections (~66 collections) and disables outer-ring collections', () => {
      const full = getFullRegistrations()
      const leanDefault = gatePayloadRegistrations(full, { enabled: new Set() })

      // Baseline floor
      expect(leanDefault.collections.length).toBeLessThan(100)
      expect(leanDefault.collections.length).toBeGreaterThan(50)

      const slugs = leanDefault.collections.map((c) => c.slug)
      expect(slugs).toContain('users')
      expect(slugs).toContain('sites')
      expect(slugs).toContain('publications')
      expect(slugs).toContain('content')
      expect(slugs).toContain('media-assets')
      expect(slugs).toContain('public-redirects')

      // Outer modules are disabled
      expect(slugs).not.toContain('carts')
      expect(slugs).not.toContain('forums')
      expect(slugs).not.toContain('discussions')
      expect(slugs).not.toContain('products')
      expect(slugs).not.toContain('books')
    })

    it('asserts safe unavailable state for optional commerce & community endpoints', () => {
      const full = getFullRegistrations()
      const leanDefault = gatePayloadRegistrations(full, { enabled: new Set() })

      const mockPayload = {
        collections: Object.fromEntries(leanDefault.collections.map((c) => [c.slug, c])),
      } as any

      // Assert isRegisteredCollection returns false for unmounted collections
      expect(isRegisteredCollection(mockPayload, 'carts')).toBe(false)
      expect(isRegisteredCollection(mockPayload, 'forums')).toBe(false)
      expect(isRegisteredCollection(mockPayload, 'discussions')).toBe(false)
      expect(isRegisteredCollection(mockPayload, 'discussion-posts')).toBe(false)

      // Core collections remain available
      expect(isRegisteredCollection(mockPayload, 'content')).toBe(true)
      expect(isRegisteredCollection(mockPayload, 'sites')).toBe(true)
    })
  })

  describe('Profile 2: Standard / Default', () => {
    it('operates identically to the safe floor while supporting gradual module activation', () => {
      const full = getFullRegistrations()
      const standardDefault = gatePayloadRegistrations(full, {
        enabled: parseEnabledModules(''),
      })

      const floorSlugs = floorCollectionSlugs(full)
      expect(standardDefault.collections.length).toBe(floorSlugs.length)
      expect(standardDefault.collections.map((c) => c.slug)).toEqual(floorSlugs)
    })

    it('activates selective single modules (e.g. commerce only) without leaking other modules', () => {
      const full = getFullRegistrations()
      const withCommerce = gatePayloadRegistrations(full, {
        enabled: parseEnabledModules('commerce'),
      })

      const slugs = withCommerce.collections.map((c) => c.slug)
      expect(slugs).toContain('carts')
      expect(slugs).toContain('products')

      // Community and books remain inactive
      expect(slugs).not.toContain('forums')
      expect(slugs).not.toContain('discussions')
      expect(slugs).not.toContain('books')

      const mockPayload = {
        collections: Object.fromEntries(withCommerce.collections.map((c) => [c.slug, c])),
      } as any

      expect(isRegisteredCollection(mockPayload, 'carts')).toBe(true)
      expect(isRegisteredCollection(mockPayload, 'discussions')).toBe(false)
    })
  })

  describe('Profile 3: Standard / All', () => {
    it('registers all 207+ collections while capping lockDocuments below the PostgreSQL 100-limit', () => {
      const full = getFullRegistrations()
      const standardAll = gatePayloadRegistrations(full, {
        enabled: parseEnabledModules('all'),
        warn: () => {},
      })

      // Full collection suite registered
      expect(standardAll.collections.length).toBe(full.collections.length)
      expect(standardAll.collections.length).toBeGreaterThan(200)

      // Lock documents capping: Must stay strictly below 100 for PostgreSQL json_build_array limit
      const lockableCount = standardAll.collections.filter(
        (c) => c.lockDocuments !== false,
      ).length
      expect(lockableCount).toBeLessThan(POSTGRES_FUNCTION_ARG_LIMIT)

      // Content retains locking; optional collections have lockDocuments: false
      expect(
        standardAll.collections.find((c) => c.slug === 'content')?.lockDocuments,
      ).not.toBe(false)
      expect(
        standardAll.collections.find((c) => c.slug === 'products')?.lockDocuments,
      ).toBe(false)
      expect(
        standardAll.collections.find((c) => c.slug === 'carts')?.lockDocuments,
      ).toBe(false)
    })

    it('makes commerce and community collections available when all modules are active', () => {
      const full = getFullRegistrations()
      const standardAll = gatePayloadRegistrations(full, {
        enabled: parseEnabledModules('all'),
        warn: () => {},
      })

      const mockPayload = {
        collections: Object.fromEntries(standardAll.collections.map((c) => [c.slug, c])),
      } as any

      expect(isRegisteredCollection(mockPayload, 'carts')).toBe(true)
      expect(isRegisteredCollection(mockPayload, 'forums')).toBe(true)
      expect(isRegisteredCollection(mockPayload, 'discussions')).toBe(true)
      expect(isRegisteredCollection(mockPayload, 'discussion-posts')).toBe(true)
    })
  })

  describe('Profile 4: Supported Lean / All', () => {
    it('supports lean deployments activating all optional modules with safe lock capping', () => {
      const full = getFullRegistrations()
      // In a lean environment where operator enables all modules
      const leanAll = gatePayloadRegistrations(full, {
        enabled: new Set(OPTIONAL_MODULES.map((m) => m.id)),
        warn: () => {},
      })

      expect(leanAll.collections.length).toBe(full.collections.length)
      const lockable = leanAll.collections.filter((c) => c.lockDocuments !== false)
      expect(lockable.length).toBeLessThan(POSTGRES_FUNCTION_ARG_LIMIT)
    })
  })
})
