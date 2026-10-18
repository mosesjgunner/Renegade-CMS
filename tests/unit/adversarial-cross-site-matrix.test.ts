import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveOperatorGrantContext,
  checkOperatorSiteAccess,
  checkOperatorRecordAccess,
  preserveRecordRelationshipsAccess,
  operatorSiteReadAccess,
  operatorSiteCreateAccess,
  operatorSiteUpdateAccess,
} from '@/modules/operations/operator-grants'
import { Content, PublicRedirects } from '@/collections/Publishing'
import type { Payload } from 'payload'

const SITE_A = 'site-alpha-id'
const SITE_B = 'site-beta-id'

// Actors fixture
const ACTORS = {
  globalOwner: {
    id: 'user-global-owner',
    email: 'global-owner@renegadeparty.test',
    role: 'owner',
    isGlobalOwner: true,
    member: 'member-global-owner',
  },
  scopedOwnerA: {
    id: 'user-owner-a',
    email: 'owner-a@renegadeparty.test',
    role: 'owner',
    isGlobalOwner: false,
    member: 'member-owner-a',
  },
  adminA: {
    id: 'user-admin-a',
    email: 'admin-a@renegadeparty.test',
    role: 'administrator',
    member: 'member-admin-a',
  },
  staffA: {
    id: 'user-staff-a',
    email: 'staff-a@renegadeparty.test',
    role: 'staff',
    member: 'member-staff-a',
  },
  memberA: {
    id: 'user-member-a',
    email: 'member-a@renegadeparty.test',
    role: 'subscriber',
    member: 'member-member-a',
  },
  anonymous: null,
}

// Grants mapping
const MEMBER_GRANTS: Record<string, Array<{ site: string; role: string }>> = {
  'member-owner-a': [{ site: SITE_A, role: 'owner' }],
  'member-admin-a': [{ site: SITE_A, role: 'administrator' }],
  'member-staff-a': [{ site: SITE_A, role: 'contributor' }],
  'member-member-a': [{ site: SITE_A, role: 'member' }],
}

// Database state store for DB-unchanged assertions
interface MockDatabase {
  sites: Array<{ id: string; name: string }>
  content: Array<{ id: string; site: string; title: string; slug: string }>
  redirects: Array<{ id: string; site: string; from: string; to: string }>
}

let mockDb: MockDatabase

function resetMockDb() {
  mockDb = {
    sites: [
      { id: SITE_A, name: 'Site Alpha' },
      { id: SITE_B, name: 'Site Beta' },
    ],
    content: [
      { id: 'content-a-1', site: SITE_A, title: 'Article Alpha 1', slug: 'article-alpha-1' },
      { id: 'content-a-2', site: SITE_A, title: 'Article Alpha 2', slug: 'article-alpha-2' },
      { id: 'content-b-1', site: SITE_B, title: 'Article Beta 1', slug: 'article-beta-1' },
    ],
    redirects: [
      { id: 'redirect-a-1', site: SITE_A, from: '/old-a', to: '/new-a' },
      { id: 'redirect-b-1', site: SITE_B, from: '/old-b', to: '/new-b' },
    ],
  }
}

function createMockPayload(): Payload {
  return {
    find: vi.fn(async (args: any) => {
      const col = args.collection
      if (col === 'sites') {
        return { docs: mockDb.sites, totalDocs: mockDb.sites.length }
      }
      if (col === 'member-site-roles') {
        const memberId = args.where?.member?.equals
        const grants = MEMBER_GRANTS[memberId] || []
        return {
          docs: grants.map((g, i) => ({ id: `role-${i}`, member: memberId, ...g })),
          totalDocs: grants.length,
        }
      }
      if (col === 'content') {
        return { docs: mockDb.content, totalDocs: mockDb.content.length }
      }
      if (col === 'redirects') {
        return { docs: mockDb.redirects, totalDocs: mockDb.redirects.length }
      }
      return { docs: [], totalDocs: 0 }
    }),
    findByID: vi.fn(async (args: any) => {
      const col = args.collection
      const id = String(args.id)
      if (col === 'content') {
        const found = mockDb.content.find((c) => c.id === id)
        if (!found) throw new Error('Not found')
        return found
      }
      if (col === 'redirects') {
        const found = mockDb.redirects.find((r) => r.id === id)
        if (!found) throw new Error('Not found')
        return found
      }
      throw new Error(`Collection ${col} not found`)
    }),
    count: vi.fn(async (args: any) => {
      const col = args.collection
      const andClauses = args.where?.and || []
      const idClause = andClauses.find((c: any) => c.id?.equals) || (args.where?.id ? { id: args.where.id } : null)
      const id = idClause?.id?.equals
      const siteInClause = andClauses.find((c: any) => c.site?.in) || (args.where?.site ? { site: args.where.site } : null)
      const siteIn = siteInClause?.site?.in

      if (col === 'content') {
        const matching = mockDb.content.filter((c) => {
          if (id && c.id !== id) return false
          if (siteIn && !siteIn.includes(c.site)) return false
          return true
        })
        return { totalDocs: matching.length }
      }
      if (col === 'redirects') {
        const matching = mockDb.redirects.filter((r) => {
          if (id && r.id !== id) return false
          if (siteIn && !siteIn.includes(r.site)) return false
          return true
        })
        return { totalDocs: matching.length }
      }
      return { totalDocs: 0 }
    }),
  } as unknown as Payload
}

describe('02D: Adversarial Cross-Site & Multi-Tenant Authorization Matrix', () => {
  let payload: Payload

  beforeEach(() => {
    resetMockDb()
    payload = createMockPayload()
  })

  describe('Actor Resolution & Site Authority', () => {
    it('grants global owner unrestricted authority across Site A and Site B', async () => {
      const grant = await resolveOperatorGrantContext(payload, ACTORS.globalOwner)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(true)

      expect(await checkOperatorSiteAccess(payload, ACTORS.globalOwner, SITE_A)).toBe(true)
      expect(await checkOperatorSiteAccess(payload, ACTORS.globalOwner, SITE_B)).toBe(true)
    })

    it('bounds scoped owner strictly to Site A and denies Site B', async () => {
      const grant = await resolveOperatorGrantContext(payload, ACTORS.scopedOwnerA)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(false)
      expect(grant.authorizedSiteIds).toEqual([SITE_A])

      expect(await checkOperatorSiteAccess(payload, ACTORS.scopedOwnerA, SITE_A)).toBe(true)
      expect(await checkOperatorSiteAccess(payload, ACTORS.scopedOwnerA, SITE_B)).toBe(false)
    })

    it('bounds administrator strictly to Site A and denies Site B', async () => {
      const grant = await resolveOperatorGrantContext(payload, ACTORS.adminA)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(false)
      expect(grant.authorizedSiteIds).toEqual([SITE_A])

      expect(await checkOperatorSiteAccess(payload, ACTORS.adminA, SITE_A)).toBe(true)
      expect(await checkOperatorSiteAccess(payload, ACTORS.adminA, SITE_B)).toBe(false)
    })

    it('bounds staff strictly to Site A and denies Site B', async () => {
      const grant = await resolveOperatorGrantContext(payload, ACTORS.staffA)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(false)
      expect(grant.authorizedSiteIds).toEqual([SITE_A])

      expect(await checkOperatorSiteAccess(payload, ACTORS.staffA, SITE_A)).toBe(true)
      expect(await checkOperatorSiteAccess(payload, ACTORS.staffA, SITE_B)).toBe(false)
    })

    it('denies member and anonymous any operator site authority', async () => {
      const memberGrant = await resolveOperatorGrantContext(payload, ACTORS.memberA)
      expect(memberGrant.authorized).toBe(false)
      expect(await checkOperatorSiteAccess(payload, ACTORS.memberA, SITE_A)).toBe(false)

      const anonGrant = await resolveOperatorGrantContext(payload, ACTORS.anonymous)
      expect(anonGrant.authorized).toBe(false)
      expect(await checkOperatorSiteAccess(payload, ACTORS.anonymous, SITE_A)).toBe(false)
      expect(await checkOperatorSiteAccess(payload, ACTORS.anonymous, SITE_B)).toBe(false)
    })
  })

  describe('Adversarial Object-ID Substitution (Content & Redirects)', () => {
    it('permits scoped operator to access Site A content by ID', async () => {
      const canAccessA = await checkOperatorRecordAccess(
        payload,
        ACTORS.adminA,
        'content',
        'content-a-1',
      )
      expect(canAccessA).toBe(true)
    })

    it('denies scoped operator attempting cross-site object-ID substitution for Site B content', async () => {
      const initialDbSnapshot = JSON.stringify(mockDb)

      const canAccessB = await checkOperatorRecordAccess(
        payload,
        ACTORS.adminA,
        'content',
        'content-b-1',
      )
      expect(canAccessB).toBe(false)

      // DB unchanged assertion
      expect(JSON.stringify(mockDb)).toEqual(initialDbSnapshot)
    })

    it('denies staff attempting cross-site object-ID substitution for Site B redirects', async () => {
      const initialDbSnapshot = JSON.stringify(mockDb)

      const canAccessB = await checkOperatorRecordAccess(
        payload,
        ACTORS.staffA,
        'public-redirects',
        'redirect-b-1',
      )
      expect(canAccessB).toBe(false)

      // DB unchanged assertion
      expect(JSON.stringify(mockDb)).toEqual(initialDbSnapshot)
    })
  })

  describe('Site Moves & Cross-Site Reparenting Prevention', () => {
    it('strictly denies cross-site reparenting attempt via preserveRecordRelationshipsAccess', async () => {
      const initialDbSnapshot = JSON.stringify(mockDb)

      // Wrap an update access rule
      const updateRule = preserveRecordRelationshipsAccess('content', ['site'], async () => true)

      // Attempting to move content-a-1 from Site A to Site B
      const allowed = await updateRule({
        req: { payload, user: ACTORS.adminA } as any,
        id: 'content-a-1',
        data: {
          site: SITE_B,
          title: 'Tampered Title',
        },
      } as any)

      expect(allowed).toBe(false)

      // Assert DB state was NOT modified
      expect(JSON.stringify(mockDb)).toEqual(initialDbSnapshot)
    })

    it('permits update when site relationship is preserved unchanged', async () => {
      const updateRule = preserveRecordRelationshipsAccess('content', ['site'], async () => true)

      const allowed = await updateRule({
        req: { payload, user: ACTORS.adminA } as any,
        id: 'content-a-1',
        data: {
          site: SITE_A,
          title: 'Legitimate Update',
        },
      } as any)

      expect(allowed).toBe(true)
    })

    it('permits update when site is omitted from payload data', async () => {
      const updateRule = preserveRecordRelationshipsAccess('content', ['site'], async () => true)

      const allowed = await updateRule({
        req: { payload, user: ACTORS.adminA } as any,
        id: 'content-a-1',
        data: {
          title: 'Update Without Site Field',
        },
      } as any)

      expect(allowed).toBe(true)
    })
  })

  describe('Content & Redirects Collection Access Rules', () => {
    it('Content collection enforces tenantCreateAccess scoping', async () => {
      const createAccess = Content.access?.create as any

      // Scoped admin creating on Site A -> allowed
      const allowedA = await createAccess({
        req: { payload, user: ACTORS.adminA },
        data: { site: SITE_A },
      })
      expect(allowedA).toBe(true)

      // Scoped admin attempting to create on Site B -> denied
      const allowedB = await createAccess({
        req: { payload, user: ACTORS.adminA },
        data: { site: SITE_B },
      })
      expect(allowedB).toBe(false)

      // Member attempting to create -> denied
      const allowedMember = await createAccess({
        req: { payload, user: ACTORS.memberA },
        data: { site: SITE_A },
      })
      expect(allowedMember).toBe(false)

      // Anonymous attempting to create -> denied
      const allowedAnon = await createAccess({
        req: { payload, user: ACTORS.anonymous },
        data: { site: SITE_A },
      })
      expect(allowedAnon).toBe(false)
    })

    it('Content collection enforces tenantReadAccess scoping', async () => {
      const readAccess = Content.access?.read as any

      // Scoped admin reading -> returns where clause scoping to Site A
      const scopedQuery = await readAccess({
        req: { payload, user: ACTORS.adminA },
      })
      expect(scopedQuery).toEqual({ site: { in: [SITE_A] } })

      // Global owner reading -> returns true (all sites)
      const globalQuery = await readAccess({
        req: { payload, user: ACTORS.globalOwner },
      })
      expect(globalQuery).toBe(true)

      // Member reading -> denied operator read
      const memberQuery = await readAccess({
        req: { payload, user: ACTORS.memberA },
      })
      expect(memberQuery).toBe(false)
    })

    it('PublicRedirects collection enforces operatorSiteReadAccess and rejects cross-site leakage', async () => {
      const readAccess = PublicRedirects.access?.read as any

      const scopedQuery = await readAccess({
        req: { payload, user: ACTORS.staffA },
      })
      expect(scopedQuery).toEqual({ site: { in: [SITE_A] } })
    })
  })
})
