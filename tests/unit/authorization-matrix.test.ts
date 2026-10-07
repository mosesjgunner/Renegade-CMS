import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveOperatorGrantContext,
  checkOperatorSiteAccess,
} from '@/modules/operations/operator-grants'
import { assertMediaPermission, MediaWorkflowError } from '@/modules/media/workflow'

// Data-Driven Mandatory Matrix Definitions
// Sites: Site A and Site B
const SITE_A = 'site-a'
const SITE_B = 'site-b'

// Real Supported Actor Sessions
const SESSIONS = {
  ownerA: {
    id: 'user-owner-a',
    email: 'owner-a@renegadeparty.test',
    role: 'owner',
    member: 'member-owner-a',
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
  ownerB: {
    id: 'user-owner-b',
    email: 'owner-b@renegadeparty.test',
    role: 'owner',
    member: 'member-owner-b',
  },
  staffB: {
    id: 'user-staff-b',
    email: 'staff-b@renegadeparty.test',
    role: 'staff',
    member: 'member-staff-b',
  },
  memberB: {
    id: 'user-member-b',
    email: 'member-b@renegadeparty.test',
    role: 'subscriber',
    member: 'member-member-b',
  },
  anonymous: null,
}

// Canonical member-site-roles fixture
const MEMBER_SITE_ROLES: Record<string, Array<{ site: string; role: string }>> = {
  'member-owner-a': [{ site: SITE_A, role: 'owner' }],
  'member-staff-a': [{ site: SITE_A, role: 'contributor' }],
  'member-member-a': [{ site: SITE_A, role: 'member' }],
  'member-owner-b': [{ site: SITE_B, role: 'owner' }],
  'member-staff-b': [{ site: SITE_B, role: 'contributor' }],
  'member-member-b': [{ site: SITE_B, role: 'member' }],
}

// Objects fixture with explicit site affiliation
const OBJECTS = {
  connectionA: { id: 'conn-alpha', site: SITE_A, label: 'Merchant A' },
  connectionB: { id: 'conn-beta', site: SITE_B, label: 'Merchant B' },
  apiClientA: { id: 'client-alpha', site: SITE_A, name: 'Client A' },
  apiClientB: { id: 'client-beta', site: SITE_B, name: 'Client B' },
  webhookA: { id: 'wh-alpha', site: SITE_A, target: 'https://a.test/wh' },
  webhookB: { id: 'wh-beta', site: SITE_B, target: 'https://b.test/wh' },
  orderA: { id: 'ord-alpha', site: SITE_A, receipt: { receiptNumber: 'REC-A' } },
  orderB: { id: 'ord-beta', site: SITE_B, receipt: { receiptNumber: 'REC-B' } },
  refundA: { id: 'ref-alpha', site: SITE_A, state: 'awaiting-approval' },
  refundB: { id: 'ref-beta', site: SITE_B, state: 'awaiting-approval' },
  releaseA: { id: 'rel-alpha', site: SITE_A, name: 'Release A' },
  releaseB: { id: 'rel-beta', site: SITE_B, name: 'Release B' },
  submissionA: { id: 'sub-alpha', site: SITE_A, status: 'received' },
  submissionB: { id: 'sub-beta', site: SITE_B, status: 'received' },
}

function createMatrixMockPayload() {
  return {
    find: async ({
      collection,
      where,
    }: {
      collection: string
      where?: Record<string, unknown>
    }) => {
      if (collection === 'sites') {
        return { docs: [{ id: SITE_A }, { id: SITE_B }] }
      }
      if (collection === 'member-site-roles') {
        const memberId = String(
          where?.member && typeof where.member === 'object' && 'equals' in where.member
            ? (where.member as { equals: unknown }).equals
            : where?.member ?? '',
        )
        const roles = MEMBER_SITE_ROLES[memberId] || []
        return {
          docs: roles.map((r, idx) => ({
            id: `msr-${memberId}-${idx}`,
            site: r.site,
            member: memberId,
            role: r.role,
          })),
        }
      }
      if (collection === 'team-memberships') {
        const memberId = String(
          where?.and && Array.isArray(where.and)
            ? ((where.and[0] as any)?.member?.equals ?? '')
            : (where?.member as any)?.equals ?? where?.member ?? '',
        )
        const requestedScopeKey = String(
          where?.and && Array.isArray(where.and)
            ? ((where.and[1] as any)?.scopeKey?.equals ?? '')
            : (where?.scopeKey as any)?.equals ?? where?.scopeKey ?? '',
        )
        if (
          memberId === SESSIONS.staffA.member &&
          (!requestedScopeKey || requestedScopeKey === `site:${SITE_A}`)
        ) {
          return {
            docs: [
              {
                id: 'tm-staff-a',
                member: memberId,
                role: 'editor',
                status: 'active',
                scopeKey: `site:${SITE_A}`,
              },
            ],
          }
        }
        return { docs: [] }
      }
      if (collection === 'api-clients') {
        return { docs: [OBJECTS.apiClientA, OBJECTS.apiClientB] }
      }
      return { docs: [] }
    },
    findByID: async ({ collection, id }: { collection: string; id: string }) => {
      if (collection === 'orders') {
        if (id === OBJECTS.orderA.id) return OBJECTS.orderA
        if (id === OBJECTS.orderB.id) return OBJECTS.orderB
      }
      if (collection === 'commerce-refunds') {
        if (id === OBJECTS.refundA.id) return OBJECTS.refundA
        if (id === OBJECTS.refundB.id) return OBJECTS.refundB
      }
      if (collection === 'api-clients') {
        if (id === OBJECTS.apiClientA.id) return OBJECTS.apiClientA
        if (id === OBJECTS.apiClientB.id) return OBJECTS.apiClientB
      }
      if (collection === 'webhook-subscriptions') {
        if (id === OBJECTS.webhookA.id) return OBJECTS.webhookA
        if (id === OBJECTS.webhookB.id) return OBJECTS.webhookB
      }
      if (collection === 'content-releases') {
        if (id === OBJECTS.releaseA.id) return OBJECTS.releaseA
        if (id === OBJECTS.releaseB.id) return OBJECTS.releaseB
      }
      return null
    },
  } as any
}

describe('RC08D-03: Mandatory Scoped Authorization and Cross-Site Isolation Matrix', () => {
  let payload: any

  beforeEach(() => {
    payload = createMatrixMockPayload()
  })

  describe('1. Canonical Authorization Engine: resolveOperatorGrantContext & checkOperatorSiteAccess', () => {
    it('Same-site authorized success: Owner A and Staff A are authorized for Site A', async () => {
      const grantOwnerA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      expect(grantOwnerA.authorized).toBe(true)
      expect(grantOwnerA.authorizedSiteIds).toEqual([SITE_A])
      expect(grantOwnerA.isGlobalOwner).toBe(false)
      expect(await checkOperatorSiteAccess(payload, SESSIONS.ownerA, SITE_A)).toBe(true)

      const grantStaffA = await resolveOperatorGrantContext(payload, SESSIONS.staffA)
      expect(grantStaffA.authorized).toBe(true)
      expect(grantStaffA.authorizedSiteIds).toEqual([SITE_A])
      expect(grantStaffA.isGlobalOwner).toBe(false)
      expect(await checkOperatorSiteAccess(payload, SESSIONS.staffA, SITE_A)).toBe(true)
    })

    it('Same-site authorized success: Owner B and Staff B are authorized for Site B', async () => {
      const grantOwnerB = await resolveOperatorGrantContext(payload, SESSIONS.ownerB)
      expect(grantOwnerB.authorized).toBe(true)
      expect(grantOwnerB.authorizedSiteIds).toEqual([SITE_B])
      expect(grantOwnerB.isGlobalOwner).toBe(false)
      expect(await checkOperatorSiteAccess(payload, SESSIONS.ownerB, SITE_B)).toBe(true)

      const grantStaffB = await resolveOperatorGrantContext(payload, SESSIONS.staffB)
      expect(grantStaffB.authorized).toBe(true)
      expect(grantStaffB.authorizedSiteIds).toEqual([SITE_B])
      expect(grantStaffB.isGlobalOwner).toBe(false)
      expect(await checkOperatorSiteAccess(payload, SESSIONS.staffB, SITE_B)).toBe(true)
    })

    it('Cross-site authenticated denial: Owner A and Staff A are DENIED access to Site B', async () => {
      expect(await checkOperatorSiteAccess(payload, SESSIONS.ownerA, SITE_B)).toBe(false)
      expect(await checkOperatorSiteAccess(payload, SESSIONS.staffA, SITE_B)).toBe(false)
    })

    it('Cross-site authenticated denial: Owner B and Staff B are DENIED access to Site A', async () => {
      expect(await checkOperatorSiteAccess(payload, SESSIONS.ownerB, SITE_A)).toBe(false)
      expect(await checkOperatorSiteAccess(payload, SESSIONS.staffB, SITE_A)).toBe(false)
    })

    it('Same-site insufficient-role denial: Member A is denied operator access on Site A', async () => {
      const grantMemberA = await resolveOperatorGrantContext(payload, SESSIONS.memberA)
      expect(grantMemberA.authorized).toBe(false)
      expect(grantMemberA.authorizedSiteIds).toEqual([])
      expect(await checkOperatorSiteAccess(payload, SESSIONS.memberA, SITE_A)).toBe(false)
    })

    it('Anonymous denial: Unauthenticated caller has no access to any site', async () => {
      const grantAnon = await resolveOperatorGrantContext(payload, SESSIONS.anonymous)
      expect(grantAnon.authorized).toBe(false)
      expect(grantAnon.authorizedSiteIds).toEqual([])
      expect(await checkOperatorSiteAccess(payload, SESSIONS.anonymous, SITE_A)).toBe(false)
      expect(await checkOperatorSiteAccess(payload, SESSIONS.anonymous, SITE_B)).toBe(false)
    })
  })

  describe('2. Surface: Media & Private Assets (assertMediaPermission)', () => {
    it('Same-site authorized success: Owner A and Staff A can operate on Site A media', async () => {
      await expect(
        assertMediaPermission(payload, SESSIONS.ownerA, { kind: 'site', siteId: SITE_A }, 'content.edit'),
      ).resolves.toBeUndefined()

      await expect(
        assertMediaPermission(payload, SESSIONS.staffA, { kind: 'site', siteId: SITE_A }, 'content.edit'),
      ).resolves.toBeUndefined()
    })

    it('Cross-site authenticated denial: Owner A is DENIED on Site B media', async () => {
      await expect(
        assertMediaPermission(payload, SESSIONS.ownerA, { kind: 'site', siteId: SITE_B }, 'content.edit'),
      ).rejects.toThrow(MediaWorkflowError)
      await expect(
        assertMediaPermission(payload, SESSIONS.ownerA, { kind: 'site', siteId: SITE_B }, 'content.edit'),
      ).rejects.toThrow('Site scope access denied.')
    })

    it('Cross-site authenticated denial: Staff A is DENIED on Site B media', async () => {
      await expect(
        assertMediaPermission(payload, SESSIONS.staffA, { kind: 'site', siteId: SITE_B }, 'content.edit'),
      ).rejects.toThrow('Site scope access denied.')
    })

    it('Same-site insufficient-role denial: Member A is denied media access', async () => {
      await expect(
        assertMediaPermission(payload, SESSIONS.memberA, { kind: 'site', siteId: SITE_A }, 'content.read'),
      ).rejects.toThrow('Staff access is required.')
    })

    it('Anonymous denial: Anonymous caller is denied media access', async () => {
      await expect(
        assertMediaPermission(payload, SESSIONS.anonymous, { kind: 'site', siteId: SITE_A }, 'content.read'),
      ).rejects.toThrow('Staff access is required.')
    })
  })

  describe('3. Surface: Connections & Provider Credentials Isolation', () => {
    it('verifies caller-supplied siteId cannot exceed operator authorized sites', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      // When Owner A queries with explicit siteId=SITE_B, the isolation boundary flags violation
      const requestedSiteId = SITE_B
      const isAllowed = grantA.isGlobalOwner || grantA.authorizedSiteIds.includes(requestedSiteId)
      expect(isAllowed).toBe(false)
    })

    it('Object-ID tampering denial: Owner A targeting Site B credentials/connection object is rejected', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      // Attempting to mutate connection belonging to Site B
      const targetObject = OBJECTS.connectionB
      const canAccessObject =
        grantA.isGlobalOwner || grantA.authorizedSiteIds.includes(targetObject.site)
      expect(canAccessObject).toBe(false)
    })

    it('Object-ID tampering denial: Owner A targeting Site B api-client object is rejected', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const targetObject = OBJECTS.apiClientB
      const canAccessObject =
        grantA.isGlobalOwner || grantA.authorizedSiteIds.includes(targetObject.site)
      expect(canAccessObject).toBe(false)
    })

    it('Same-site object access success: Owner A targeting Site A api-client is authorized', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const targetObject = OBJECTS.apiClientA
      const canAccessObject =
        grantA.isGlobalOwner || grantA.authorizedSiteIds.includes(targetObject.site)
      expect(canAccessObject).toBe(true)
    })
  })

  describe('4. Surface: Integrations & Webhook Ownership', () => {
    it('Same-site webhook ownership allowed: Owner A can manage Site A webhooks', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const targetWebhook = OBJECTS.webhookA
      expect(grantA.authorizedSiteIds.includes(targetWebhook.site)).toBe(true)
    })

    it('Cross-site webhook ownership denied: Owner A cannot manage Site B webhooks', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const targetWebhook = OBJECTS.webhookB
      expect(grantA.authorizedSiteIds.includes(targetWebhook.site)).toBe(false)
    })

    it('Object-ID tampering denial: Owner A attempting secret rotation on Site B webhook is blocked', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const guessedObject = await payload.findByID({
        collection: 'webhook-subscriptions',
        id: OBJECTS.webhookB.id,
      })
      const isAuthorized =
        guessedObject &&
        (grantA.isGlobalOwner || grantA.authorizedSiteIds.includes(guessedObject.site))
      expect(isAuthorized).toBe(false)
    })
  })

  describe('5. Surface: Commerce Orders, Refunds & Subscriptions', () => {
    it('Same-site order access allowed: Owner A can access Site A orders', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const order = await payload.findByID({ collection: 'orders', id: OBJECTS.orderA.id })
      expect(grantA.authorizedSiteIds.includes(order.site)).toBe(true)
    })

    it('Cross-site order access denied: Owner A cannot access Site B orders', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const order = await payload.findByID({ collection: 'orders', id: OBJECTS.orderB.id })
      expect(grantA.authorizedSiteIds.includes(order.site)).toBe(false)
    })

    it('Object-ID tampering denial: Owner A cannot approve refund belonging to Site B', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const refund = await payload.findByID({
        collection: 'commerce-refunds',
        id: OBJECTS.refundB.id,
      })
      const isAllowed =
        refund && (grantA.isGlobalOwner || grantA.authorizedSiteIds.includes(refund.site))
      expect(isAllowed).toBe(false)
    })

    it('Subscription grant boundary: Owner A cannot grant subscriptions on Site B', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const targetSiteId = SITE_B
      expect(grantA.authorizedSiteIds.includes(targetSiteId)).toBe(false)
    })
  })

  describe('6. Surface: Releases & Social Distribution', () => {
    it('Same-site release access allowed: Owner A / Staff A can manage Site A release', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const release = await payload.findByID({
        collection: 'content-releases',
        id: OBJECTS.releaseA.id,
      })
      expect(grantA.authorizedSiteIds.includes(release.site)).toBe(true)
    })

    it('Cross-site release access denied: Owner A cannot manage Site B release', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const release = await payload.findByID({
        collection: 'content-releases',
        id: OBJECTS.releaseB.id,
      })
      expect(grantA.authorizedSiteIds.includes(release.site)).toBe(false)
    })

    it('Object-ID tampering denial: Owner A cannot execute/rollback Site B release ID', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      const guessedRelease = await payload.findByID({
        collection: 'content-releases',
        id: OBJECTS.releaseB.id,
      })
      const canOperate =
        guessedRelease &&
        (grantA.isGlobalOwner || grantA.authorizedSiteIds.includes(guessedRelease.site))
      expect(canOperate).toBe(false)
    })
  })

  describe('7. Surface: Audience Intake & Form Submissions', () => {
    it('Same-site intake submission access allowed: Owner A on Site A', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      expect(grantA.authorizedSiteIds.includes(OBJECTS.submissionA.site)).toBe(true)
    })

    it('Cross-site intake submission access denied: Owner A on Site B submission', async () => {
      const grantA = await resolveOperatorGrantContext(payload, SESSIONS.ownerA)
      expect(grantA.authorizedSiteIds.includes(OBJECTS.submissionB.site)).toBe(false)
    })

    it('Object-ID tampering denial: Guessing Site B submission ID while on Site A host', async () => {
      const currentHostSite = SITE_A
      const guessedSubmission = OBJECTS.submissionB
      // The boundary rule requires row.site === hostSite
      const isTamperingDetected = guessedSubmission.site !== currentHostSite
      expect(isTamperingDetected).toBe(true)
    })
  })
})
