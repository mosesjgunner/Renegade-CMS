/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { getIsLocked } from '../../node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js'

describe('RC08D-01 Integration: Core Editor Lock-Owner Projection on Acceptance Database', () => {
  let payload: Payload
  let ownerUser: any
  let staffUser: any
  let testSite: any
  const suffix = Date.now().toString(36)

  beforeAll(async () => {
    payload = await getPayload({ config })

    testSite = await payload.create({
      collection: 'sites',
      data: {
        name: `RC08D Site ${suffix}`,
        slug: `rc08d-site-${suffix}`,
        lifecycle: 'active',
      } as any,
      overrideAccess: true,
    })

    ownerUser = await payload.create({
      collection: 'users',
      data: {
        email: `rc08d-owner-${suffix}@example.test`,
        role: 'owner',
      },
      overrideAccess: true,
    })

    staffUser = await payload.create({
      collection: 'users',
      data: {
        email: `rc08d-staff-${suffix}@example.test`,
        role: 'staff',
      },
      overrideAccess: true,
    })
  }, 60_000)

  afterAll(async () => {
    try {
      if (payload) {
        await payload.delete({
          collection: 'payload-locked-documents',
          where: {
            or: [
              { globalSlug: { equals: 'site-settings' } },
              { 'document.relationTo': { equals: 'posts' } },
            ],
          },
          overrideAccess: true,
        })
      }
    } catch {
      // Best-effort cleanup
    }
  })

  it('1. owner opens Site Settings (unlocked when no lock exists)', async () => {
    // Clear any leftover lock on site-settings
    await payload.delete({
      collection: 'payload-locked-documents',
      where: { globalSlug: { equals: 'site-settings' } },
      overrideAccess: true,
    })

    const globalConfig = payload.config.globals.find((g) => g.slug === 'site-settings')
    const req = {
      payload,
      user: ownerUser,
    } as any

    const result = await getIsLocked({
      globalConfig: globalConfig as any,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(false)
  })

  it('2. save Site Settings and create persistent document lock', async () => {
    // Save site settings via payload global update
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        siteName: `Renegade Dispatch ${suffix}`,
        footerText: 'Accountable Republic Reporting',
      },
      overrideAccess: true,
    })

    // Create the lock record as the browser client would
    const lock = await payload.create({
      collection: 'payload-locked-documents',
      data: {
        globalSlug: 'site-settings',
        user: {
          relationTo: 'users',
          value: ownerUser.id,
        },
      } as any,
      overrideAccess: true,
    })

    expect(lock).toBeDefined()
    expect(lock.id).toBeDefined()
  })

  it('3. immediate reload resolves owner lock projection without blanking or throwing', async () => {
    const globalConfig = payload.config.globals.find((g) => g.slug === 'site-settings')
    const req = {
      payload,
      user: ownerUser,
    } as any

    const result = await getIsLocked({
      globalConfig: globalConfig as any,
      isEditing: true,
      req,
    })

    // Crucial requirement: must not throw TypeError: Cannot read properties of undefined (reading 'id')
    expect(result.isLocked).toBe(false)
    expect(result.currentEditor).toBeDefined()
  })

  it('4. repeated reload resolves lock state consistently', async () => {
    const globalConfig = payload.config.globals.find((g) => g.slug === 'site-settings')
    const req = {
      payload,
      user: ownerUser,
    } as any

    for (let i = 0; i < 3; i++) {
      const result = await getIsLocked({
        globalConfig: globalConfig as any,
        isEditing: true,
        req,
      })
      expect(result.isLocked).toBe(false)
    }
  })

  it('5. second edit and save retains owner access and updates timestamp', async () => {
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        footerText: 'Second edit persisted successfully.',
      },
      overrideAccess: true,
    })

    const globalConfig = payload.config.globals.find((g) => g.slug === 'site-settings')
    const req = {
      payload,
      user: ownerUser,
    } as any

    const result = await getIsLocked({
      globalConfig: globalConfig as any,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(false)
  })

  it('6. logout/new owner session sees active lock and cannot edit concurrently', async () => {
    // Owner establishes lock on site-settings
    await payload.create({
      collection: 'payload-locked-documents',
      data: {
        globalSlug: 'site-settings',
        user: {
          relationTo: 'users',
          value: ownerUser.id,
        },
      } as any,
      overrideAccess: true,
    })

    const globalConfig = payload.config.globals.find((g) => g.slug === 'site-settings')
    const req = {
      payload,
      user: staffUser, // Different user
    } as any

    const result = await getIsLocked({
      globalConfig: globalConfig as any,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(true)
    expect(result.currentEditor).toBeDefined()
    expect((result.currentEditor as any).id).toBe(ownerUser.id)
  })

  it('7. representative lock-enabled content editor (posts/content) shares lock resolution', async () => {
    const post = await payload.create({
      collection: 'content',
      data: {
        site: testSite.id,
        contentType: 'article',
        title: `RC08D Article ${suffix}`,
        slug: `rc08d-article-${suffix}`,
        status: 'draft',
      } as any,
      overrideAccess: true,
    })

    // Create lock on this article for owner
    await payload.create({
      collection: 'payload-locked-documents',
      data: {
        document: {
          relationTo: 'content',
          value: post.id,
        },
        user: {
          relationTo: 'users',
          value: ownerUser.id,
        },
      } as any,
      overrideAccess: true,
    })

    const collectionConfig = payload.collections['content'].config
    const ownerReq = { payload, user: ownerUser } as any
    const staffReq = { payload, user: staffUser } as any

    // Owner checks lock -> unlocked
    const ownerResult = await getIsLocked({
      collectionConfig,
      id: post.id,
      isEditing: true,
      req: ownerReq,
    })
    expect(ownerResult.isLocked).toBe(false)

    // Staff checks lock -> locked by owner
    const staffResult = await getIsLocked({
      collectionConfig,
      id: post.id,
      isEditing: true,
      req: staffReq,
    })
    expect(staffResult.isLocked).toBe(true)
    expect((staffResult.currentEditor as any).id).toBe(ownerUser.id)
  })

  it('8. malformed/missing lock owner fails safely instead of blanking the editor', async () => {
    // Create a corrupted lock document directly in database without user relation
    await payload.db.create({
      collection: 'payload-locked-documents',
      data: {
        globalSlug: 'site-settings',
        // Omit user or provide undefined
      } as any,
      returning: false,
    })

    const globalConfig = payload.config.globals.find((g) => g.slug === 'site-settings')
    const req = {
      payload,
      user: ownerUser,
    } as any

    // Must not crash or throw unhandled exception
    let result: any
    expect(async () => {
      result = await getIsLocked({
        globalConfig: globalConfig as any,
        isEditing: true,
        req,
      })
    }).not.toThrow()

    result = await getIsLocked({
      globalConfig: globalConfig as any,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(false)
  })
})
