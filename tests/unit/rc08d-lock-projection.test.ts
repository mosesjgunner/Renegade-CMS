import { describe, it, expect, vi } from 'vitest'
import { getIsLocked } from '../../node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js'

describe('RC08D-01 Core Editor Lock-Owner Projection', () => {
  const globalConfig = {
    slug: 'site-settings',
    lockDocuments: true,
  } as any

  const collectionConfig = {
    slug: 'posts',
    lockDocuments: true,
  } as any

  const createMockReq = ({
    userId = 'owner-uuid-1',
    userRole = 'owner',
    userEmail = 'owner@renegadeparty.org',
    docs = [] as any[],
    findThrows = false,
  } = {}) => {
    return {
      user: userId ? { id: userId, role: userRole, email: userEmail, collection: 'users' } : undefined,
      payload: {
        collections: {
          'payload-locked-documents': { config: { slug: 'payload-locked-documents' } },
          users: { config: { slug: 'users' } },
        },
        find: vi.fn(async () => {
          if (findThrows) throw new Error('DB Connection Timeout')
          return { docs }
        }),
        findByID: vi.fn(async ({ collection, id }) => {
          if (collection === 'users') {
            return { id, email: `${id}@example.test`, role: 'owner' }
          }
          if (collection === 'payload-locked-documents') {
            return docs.find((d) => d.id === id) ?? null
          }
          return null
        }),
        logger: {
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        },
      },
    } as any
  }

  it('regression 1: owner opens Site Settings without existing lock (unlocked)', async () => {
    const req = createMockReq({ docs: [] })
    const result = await getIsLocked({
      globalConfig,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(false)
  })

  it('regression 2: save Site Settings creates lock, owner reload returns isLocked=false', async () => {
    const activeLock = {
      id: 'lock-1',
      globalSlug: 'site-settings',
      user: {
        relationTo: 'users',
        value: {
          id: 'owner-uuid-1',
          email: 'owner@renegadeparty.org',
        },
      },
      updatedAt: new Date().toISOString(),
    }

    const req = createMockReq({ userId: 'owner-uuid-1', docs: [activeLock] })
    const result = await getIsLocked({
      globalConfig,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(false)
    expect(result.currentEditor).toBeDefined()
    expect((result.currentEditor as any).id).toBe('owner-uuid-1')
  })

  it('regression 3: immediate reload handles unpopulated polymorphic user projection without throwing', async () => {
    // Under Drizzle transformRelationship or access-control boundaries, user.value may be a raw ID
    const unpopulatedLock = {
      id: 'lock-2',
      globalSlug: 'site-settings',
      user: {
        relationTo: 'users',
        value: 'owner-uuid-1', // Raw ID instead of populated object
      },
      updatedAt: new Date().toISOString(),
    }

    const req = createMockReq({ userId: 'owner-uuid-1', docs: [unpopulatedLock] })
    const result = await getIsLocked({
      globalConfig,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(false)
    expect(result.currentEditor).toBeDefined()
  })

  it('regression 4: repeated rapid reloads succeed consistently without exception', async () => {
    const activeLock = {
      id: 'lock-1',
      globalSlug: 'site-settings',
      user: {
        relationTo: 'users',
        value: { id: 'owner-uuid-1', email: 'owner@renegadeparty.org' },
      },
      updatedAt: new Date().toISOString(),
    }

    const req = createMockReq({ userId: 'owner-uuid-1', docs: [activeLock] })

    for (let i = 0; i < 5; i++) {
      const result = await getIsLocked({
        globalConfig,
        isEditing: true,
        req,
      })
      expect(result.isLocked).toBe(false)
    }
  })

  it('regression 5: second edit/save updates lock, reload remains unlocked for owner', async () => {
    const updatedTime = new Date(Date.now() + 1000).toISOString()
    const updatedLock = {
      id: 'lock-1',
      globalSlug: 'site-settings',
      user: {
        relationTo: 'users',
        value: { id: 'owner-uuid-1', email: 'owner@renegadeparty.org' },
      },
      updatedAt: updatedTime,
    }

    const req = createMockReq({ userId: 'owner-uuid-1', docs: [updatedLock] })
    const result = await getIsLocked({
      globalConfig,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(false)
    expect(result.lastUpdateTime).toBe(new Date(updatedTime).getTime())
  })

  it('regression 6: new owner / different staff session sees active lock (isLocked=true)', async () => {
    const activeLock = {
      id: 'lock-1',
      globalSlug: 'site-settings',
      user: {
        relationTo: 'users',
        value: { id: 'owner-uuid-1', email: 'owner@renegadeparty.org' },
      },
      updatedAt: new Date().toISOString(),
    }

    // Different user views the locked document
    const req = createMockReq({
      userId: 'staff-uuid-2',
      userRole: 'staff',
      userEmail: 'staff@renegadeparty.org',
      docs: [activeLock],
    })

    const result = await getIsLocked({
      globalConfig,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(true)
    expect((result.currentEditor as any).id).toBe('owner-uuid-1')
  })

  it('regression 7: representative content editor (posts collection) shares lock resolution', async () => {
    const postLock = {
      id: 'lock-post-1',
      document: {
        relationTo: 'posts',
        value: 'post-101',
      },
      user: {
        relationTo: 'users',
        value: { id: 'owner-uuid-1', email: 'owner@renegadeparty.org' },
      },
      updatedAt: new Date().toISOString(),
    }

    // Owner checks lock on post-101 -> unlocked
    const ownerReq = createMockReq({ userId: 'owner-uuid-1', docs: [postLock] })
    const ownerResult = await getIsLocked({
      collectionConfig,
      id: 'post-101',
      isEditing: true,
      req: ownerReq,
    })
    expect(ownerResult.isLocked).toBe(false)

    // Other user checks lock on post-101 -> locked
    const otherReq = createMockReq({ userId: 'staff-uuid-2', docs: [postLock] })
    const otherResult = await getIsLocked({
      collectionConfig,
      id: 'post-101',
      isEditing: true,
      req: otherReq,
    })
    expect(otherResult.isLocked).toBe(true)
    expect((otherResult.currentEditor as any).id).toBe('owner-uuid-1')
  })

  it('regression 8: malformed or missing lock owner fails safely without blanking the editor', async () => {
    const testCases = [
      { user: null },
      { user: undefined },
      { user: {} },
      { user: { relationTo: 'users', value: null } },
      { user: { relationTo: 'users', value: undefined } },
      { user: { relationTo: 'users' } },
    ]

    for (const malformed of testCases) {
      const corruptedLock = {
        id: 'lock-corrupt',
        globalSlug: 'site-settings',
        ...malformed,
        updatedAt: new Date().toISOString(),
      }

      const req = createMockReq({ userId: 'owner-uuid-1', docs: [corruptedLock] })

      // Must not throw TypeError: Cannot read properties of undefined (reading 'id')
      let result: any
      expect(async () => {
        result = await getIsLocked({
          globalConfig,
          isEditing: true,
          req,
        })
      }).not.toThrow()

      const res = await getIsLocked({
        globalConfig,
        isEditing: true,
        req,
      })

      expect(res.isLocked).toBe(false)
      expect(res.currentEditor).toBeNull()
    }
  })

  it('fails safely when database query encounters an unexpected error', async () => {
    const req = createMockReq({ findThrows: true })
    const result = await getIsLocked({
      globalConfig,
      isEditing: true,
      req,
    })

    expect(result.isLocked).toBe(false)
    expect(req.payload.logger.error).toHaveBeenCalled()
  })
})
