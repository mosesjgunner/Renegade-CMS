/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  checkOperatorSiteAccess,
  resolveOperatorGrantContext,
} from '../../src/modules/operations/operator-grants'
import { loadConfig } from '../../src/modules/core/config'
import { OPTIONAL_MODULES, parseEnabledModules } from '../../src/modules/module-registry'

describe('Stage 03: Two-Site Five-Actor Runtime Authorization & Tenant Boundary Matrix', () => {
  let payload: Payload
  const suffix = randomUUID().slice(0, 8)

  let siteAId: string
  let siteBId: string

  let ownerAUser: any
  let adminAUser: any
  let staffAUser: any
  let memberAUser: any
  let ownerBUser: any

  let siteAArticleId: string
  let siteBArticleId: string

  let siteAConnectionId: string
  let siteBConnectionId: string

  let siteAPrivateMediaId: string
  let siteBPrivateMediaId: string

  let siteAOrgId: string
  let siteBOrgId: string

  let siteAContactId: string
  let siteBContactId: string

  let siteACartId: string
  let siteBCartId: string

  beforeAll(async () => {
    payload = await getPayload({ config })

    // 1. Create two isolated sites in acceptance database
    const siteA = await payload.create({
      collection: 'sites',
      data: {
        name: `Matrix Site A ${suffix}`,
        slug: `matrix-site-a-${suffix}`,
        lifecycle: 'active',
      } as any,
      overrideAccess: true,
    })
    siteAId = String(siteA.id)

    const siteB = await payload.create({
      collection: 'sites',
      data: {
        name: `Matrix Site B ${suffix}`,
        slug: `matrix-site-b-${suffix}`,
        lifecycle: 'active',
      } as any,
      overrideAccess: true,
    })
    siteBId = String(siteB.id)

    // 2. Create Members for Site A and Site B with required displayName
    const memberOwnerA = await payload.create({
      collection: 'members',
      data: {
        displayName: `Owner A ${suffix}`,
        email: `owner-a-${suffix}@example.test`,
        site: siteAId,
        status: 'active',
      } as any,
      overrideAccess: true,
    })

    const memberAdminA = await payload.create({
      collection: 'members',
      data: {
        displayName: `Admin A ${suffix}`,
        email: `admin-a-${suffix}@example.test`,
        site: siteAId,
        status: 'active',
      } as any,
      overrideAccess: true,
    })

    const memberStaffA = await payload.create({
      collection: 'members',
      data: {
        displayName: `Staff A ${suffix}`,
        email: `staff-a-${suffix}@example.test`,
        site: siteAId,
        status: 'active',
      } as any,
      overrideAccess: true,
    })

    const memberSubscriberA = await payload.create({
      collection: 'members',
      data: {
        displayName: `Member A ${suffix}`,
        email: `member-a-${suffix}@example.test`,
        site: siteAId,
        status: 'active',
      } as any,
      overrideAccess: true,
    })

    const memberOwnerB = await payload.create({
      collection: 'members',
      data: {
        displayName: `Owner B ${suffix}`,
        email: `owner-b-${suffix}@example.test`,
        site: siteBId,
        status: 'active',
      } as any,
      overrideAccess: true,
    })

    // 3. Create Users linked to Members with authentic roles
    ownerAUser = await payload.create({
      collection: 'users',
      data: {
        email: `owner-a-${suffix}@example.test`,
        role: 'owner',
        member: memberOwnerA.id,
      } as any,
      overrideAccess: true,
    })

    adminAUser = await payload.create({
      collection: 'users',
      data: {
        email: `admin-a-${suffix}@example.test`,
        role: 'administrator',
        member: memberAdminA.id,
      } as any,
      overrideAccess: true,
      context: { skipEnrollmentToken: true, seeding: true },
    })

    staffAUser = await payload.create({
      collection: 'users',
      data: {
        email: `staff-a-${suffix}@example.test`,
        role: 'staff',
        member: memberStaffA.id,
      } as any,
      overrideAccess: true,
      context: { skipEnrollmentToken: true, seeding: true },
    })

    memberAUser = {
      id: `member-user-${suffix}`,
      email: `member-a-${suffix}@example.test`,
      role: 'subscriber',
      member: memberSubscriberA.id,
    }

    ownerBUser = await payload.create({
      collection: 'users',
      data: {
        email: `owner-b-${suffix}@example.test`,
        role: 'owner',
        member: memberOwnerB.id,
      } as any,
      overrideAccess: true,
      context: { skipEnrollmentToken: true, seeding: true },
    })

    // 4. Create explicit member-site-roles for scoped authority
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: memberAdminA.id,
        site: siteAId,
        role: 'community-manager',
      } as any,
      overrideAccess: true,
    })

    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: memberStaffA.id,
        site: siteAId,
        role: 'contributor',
      } as any,
      overrideAccess: true,
    })

    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: memberSubscriberA.id,
        site: siteAId,
        role: 'member',
      } as any,
      overrideAccess: true,
    })

    // 5. Populate representative test objects on Site A
    const artA = await payload.create({
      collection: 'content',
      data: {
        site: siteAId,
        contentType: 'article',
        title: `Site A Draft Article ${suffix}`,
        slug: `site-a-draft-${suffix}`,
        status: 'draft',
      } as any,
      overrideAccess: true,
    })
    siteAArticleId = String(artA.id)

    const connA = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteAId,
        label: `Site A Stripe Connection ${suffix}`,
        providerKey: 'stripe',
        merchantCountry: 'US',
      } as any,
      overrideAccess: true,
    })
    siteAConnectionId = String(connA.id)

    const mediaA = await payload.create({
      collection: 'media-assets',
      data: {
        site: siteAId,
        title: `Site A Private Media ${suffix}`,
        kind: 'image',
        mimeType: 'image/png',
        byteSize: 1024,
        storageLocation: `site-a-${suffix}.png`,
        checksum: `sha256:${randomUUID().replace(/-/g, '')}`,
      } as any,
      overrideAccess: true,
    })
    siteAPrivateMediaId = String(mediaA.id)

    const orgA = await payload.create({
      collection: 'organizations',
      data: {
        site: siteAId,
        name: `Site A Civic Foundation ${suffix}`,
      } as any,
      overrideAccess: true,
    })
    siteAOrgId = String(orgA.id)

    const contactA = await payload.create({
      collection: 'contacts',
      data: {
        site: siteAId,
        displayName: `Contact A ${suffix}`,
        email: `contact-a-${suffix}@example.test`,
      } as any,
      overrideAccess: true,
    })
    siteAContactId = String(contactA.id)

    const cartA = await payload.create({
      collection: 'carts',
      data: {
        site: siteAId,
        merchantConnection: siteAConnectionId,
        currency: 'USD',
        version: 1,
        items: [],
      } as any,
      overrideAccess: true,
    })
    siteACartId = String(cartA.id)

    // 6. Populate representative test objects on Site B
    const artB = await payload.create({
      collection: 'content',
      data: {
        site: siteBId,
        contentType: 'article',
        title: `Site B Protected Article ${suffix}`,
        slug: `site-b-protected-${suffix}`,
        status: 'draft',
      } as any,
      overrideAccess: true,
    })
    siteBArticleId = String(artB.id)

    const connB = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteBId,
        label: `Site B Merchant Connection ${suffix}`,
        providerKey: 'paypal',
        merchantCountry: 'US',
      } as any,
      overrideAccess: true,
    })
    siteBConnectionId = String(connB.id)

    const mediaB = await payload.create({
      collection: 'media-assets',
      data: {
        site: siteBId,
        title: `Site B Secret Diagram ${suffix}`,
        kind: 'image',
        mimeType: 'image/png',
        byteSize: 2048,
        storageLocation: `site-b-${suffix}.png`,
        checksum: `sha256:${randomUUID().replace(/-/g, '')}`,
      } as any,
      overrideAccess: true,
    })
    siteBPrivateMediaId = String(mediaB.id)

    const orgB = await payload.create({
      collection: 'organizations',
      data: {
        site: siteBId,
        name: `Site B Secure Foundation ${suffix}`,
      } as any,
      overrideAccess: true,
    })
    siteBOrgId = String(orgB.id)

    const contactB = await payload.create({
      collection: 'contacts',
      data: {
        site: siteBId,
        displayName: `Contact B ${suffix}`,
        email: `contact-b-${suffix}@example.test`,
      } as any,
      overrideAccess: true,
    })
    siteBContactId = String(contactB.id)

    const cartB = await payload.create({
      collection: 'carts',
      data: {
        site: siteBId,
        merchantConnection: siteBConnectionId,
        currency: 'USD',
        version: 1,
        items: [],
      } as any,
      overrideAccess: true,
    })
    siteBCartId = String(cartB.id)
  }, 90_000)

  afterAll(async () => {
    try {
      if (payload) {
        await payload.delete({
          collection: 'sites',
          where: { id: { in: [siteAId, siteBId] } },
          overrideAccess: true,
        })
      }
    } catch {
      // Best-effort teardown
    }
  })

  describe('1. Operator Grant Resolution & Canonical Hierarchy', () => {
    it('resolves Owner as superuser with authority over sites', async () => {
      const grant = await resolveOperatorGrantContext(payload, ownerAUser)
      expect(grant.authorized).toBe(true)
    })

    it('resolves Administrator bounded strictly to Site A', async () => {
      const grant = await resolveOperatorGrantContext(payload, adminAUser)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(false)
      expect(grant.authorizedSiteIds).toContain(siteAId)
      expect(grant.authorizedSiteIds).not.toContain(siteBId)
    })

    it('resolves Staff bounded strictly to Site A', async () => {
      const grant = await resolveOperatorGrantContext(payload, staffAUser)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(false)
      expect(grant.authorizedSiteIds).toContain(siteAId)
      expect(grant.authorizedSiteIds).not.toContain(siteBId)
    })

    it('denies operator authority for Subscriber / Member', async () => {
      const grant = await resolveOperatorGrantContext(payload, memberAUser)
      expect(grant.authorized).toBe(false)
      expect(grant.authorizedSiteIds).toHaveLength(0)
    })

    it('denies operator authority for Anonymous session', async () => {
      const grant = await resolveOperatorGrantContext(payload, null)
      expect(grant.authorized).toBe(false)
      expect(grant.authorizedSiteIds).toHaveLength(0)
    })
  })

  describe('2. Permitted Reads and Mutations (Site A)', () => {
    it('Owner can read and update Site A resources', async () => {
      const articles = await payload.find({
        collection: 'content',
        where: { id: { equals: siteAArticleId } },
        user: ownerAUser,
        overrideAccess: false,
      })
      expect(articles.docs).toHaveLength(1)

      const updated = await payload.update({
        collection: 'content',
        id: siteAArticleId,
        data: { title: `Site A Article Updated by Owner ${suffix}` },
        user: ownerAUser,
        overrideAccess: false,
      })
      expect(updated.title).toContain('Updated by Owner')
    })

    it('Administrator can read Site A organizations and merchant connections', async () => {
      const orgs = await payload.find({
        collection: 'organizations',
        where: { id: { equals: siteAOrgId } },
        user: adminAUser,
        overrideAccess: false,
      })
      expect(orgs.docs).toHaveLength(1)

      const conns = await payload.find({
        collection: 'merchant-connections',
        where: { id: { equals: siteAConnectionId } },
        user: adminAUser,
        overrideAccess: false,
      })
      expect(conns.docs).toHaveLength(1)
    })

    it('Staff can read and update Site A content drafts', async () => {
      const articles = await payload.find({
        collection: 'content',
        where: { id: { equals: siteAArticleId } },
        user: staffAUser,
        overrideAccess: false,
      })
      expect(articles.docs).toHaveLength(1)

      const updated = await payload.update({
        collection: 'content',
        id: siteAArticleId,
        data: { excerpt: 'Excerpt revised by Staff A' },
        user: staffAUser,
        overrideAccess: false,
      })
      expect(updated.excerpt).toBe('Excerpt revised by Staff A')
    })
  })

  describe('3. Cross-Tenant ID Substitution Attacks Denied (Site A -> Site B)', () => {
    it('Admin A cannot read Site B organization by ID substitution', async () => {
      const result = await payload.find({
        collection: 'organizations',
        where: { id: { equals: siteBOrgId } },
        user: adminAUser,
        overrideAccess: false,
      })
      expect(result.docs).toHaveLength(0)
    })

    it('Admin A cannot mutate Site B merchant connection by ID substitution', async () => {
      await expect(
        payload.update({
          collection: 'merchant-connections',
          id: siteBConnectionId,
          data: { label: 'Tampered Connection' },
          user: adminAUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // Persistence check: Site B connection remains untouched
      const original = await payload.findByID({
        collection: 'merchant-connections',
        id: siteBConnectionId,
        overrideAccess: true,
      })
      expect(original.label).toBe(`Site B Merchant Connection ${suffix}`)
    })

    it('Staff A cannot read Site B draft article by ID substitution', async () => {
      const result = await payload.find({
        collection: 'content',
        where: { id: { equals: siteBArticleId } },
        user: staffAUser,
        overrideAccess: false,
      })
      expect(result.docs).toHaveLength(0)
    })

    it('Staff A cannot mutate Site B draft article by ID substitution', async () => {
      await expect(
        payload.update({
          collection: 'content',
          id: siteBArticleId,
          data: { title: 'Illegally Modified by Staff A' },
          user: staffAUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // Persistence check: Site B article remains unmodified
      const original = await payload.findByID({
        collection: 'content',
        id: siteBArticleId,
        overrideAccess: true,
      })
      expect(original.title).toBe(`Site B Protected Article ${suffix}`)
    })

    it('Staff A cannot mutate Site B private media by ID substitution', async () => {
      const hasSiteAccess = await checkOperatorSiteAccess(payload, staffAUser, siteBId)
      expect(hasSiteAccess).toBe(false)
    })

    it('Staff A cannot access Site B carts', async () => {
      const carts = await payload.find({
        collection: 'carts',
        where: { id: { equals: siteBCartId } },
        user: staffAUser,
        overrideAccess: false,
      })
      expect(carts.docs).toHaveLength(0)
    })
  })

  describe('4. Unprivileged and Anonymous Actor Boundaries', () => {
    it('Member A cannot read operator collections (connections, organizations)', async () => {
      await expect(
        payload.find({
          collection: 'merchant-connections',
          user: memberAUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      await expect(
        payload.find({
          collection: 'organizations',
          user: memberAUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('Member A cannot read draft content', async () => {
      await expect(
        payload.find({
          collection: 'content',
          where: { id: { equals: siteAArticleId } },
          user: memberAUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('Anonymous user cannot read draft content or private media', async () => {
      await expect(
        payload.find({
          collection: 'content',
          where: { id: { equals: siteAArticleId } },
          user: null as any,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      await expect(
        payload.find({
          collection: 'media-assets',
          where: { id: { equals: siteAPrivateMediaId } },
          user: null as any,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('Anonymous user cannot mutate any resource', async () => {
      await expect(
        payload.update({
          collection: 'content',
          id: siteAArticleId,
          data: { title: 'Anonymous Hack' },
          user: null as any,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  describe('5. Feature Profiles & Module Registration', () => {
    it('evaluates Lean profile defaults correctly', () => {
      const leanConfig = loadConfig({
        ...process.env,
        DEPLOYMENT_PROFILE: 'Lean',
      })
      expect(leanConfig.deploymentProfile).toBe('Lean')
      expect(leanConfig.realtime.enabled).toBe(false)
      expect(leanConfig.realtime.presenceEnabled).toBe(false)

      const leanModules = parseEnabledModules(undefined)
      expect(leanModules.size).toBe(0) // Floor only
    })

    it('evaluates Standard profile defaults correctly', () => {
      const standardConfig = loadConfig({
        ...process.env,
        DEPLOYMENT_PROFILE: 'Standard',
      })
      expect(standardConfig.deploymentProfile).toBe('Standard')
      expect(standardConfig.realtime.enabled).toBe(true)
      expect(standardConfig.realtime.presenceEnabled).toBe(true)

      const selectiveModules = parseEnabledModules('commerce, crm')
      expect(selectiveModules.has('commerce')).toBe(true)
      expect(selectiveModules.has('crm')).toBe(true)
    })

    it('evaluates runtime configuration with all modules registered', () => {
      const allModules = parseEnabledModules('all')
      expect(allModules.size).toBe(OPTIONAL_MODULES.length)
      expect(allModules.has('commerce')).toBe(true)
      expect(allModules.has('media-studio')).toBe(true)
      expect(allModules.has('community')).toBe(true)
    })
  })
})
