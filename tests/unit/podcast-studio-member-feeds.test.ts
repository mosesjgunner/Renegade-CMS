/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-03 (POD-REQ-08) unit proof for the member-feed token module:
 * issue / rotate / revoke / resolve against an in-memory store, with
 * hash-only persistence asserted on the stored documents.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  generateFeedToken,
  hashFeedToken,
  issueToken,
  memberEnclosurePath,
  memberFeedPath,
  podcastEntitlementForShow,
  resolveToken,
  revokeToken,
  rotateToken,
} from '../../src/modules/podcast-studio/member-feeds'

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')

function createFakeStore() {
  const collections: Record<string, any[]> = { 'podcast-feed-tokens': [] }
  let sequence = 0
  const matches = (doc: any, where: any): boolean => {
    if (!where) return true
    if (where.and) return where.and.every((clause: any) => matches(doc, clause))
    if (where.or) return where.or.some((clause: any) => matches(doc, clause))
    return Object.entries(where).every(([field, condition]: [string, any]) => {
      const actual = doc[field]
      if (condition && 'equals' in condition)
        return String(actual ?? '') === String(condition.equals ?? '')
      return true
    })
  }
  const store: any = {
    collections,
    async find(args: any) {
      const docs = collections[args.collection].filter((doc) => matches(doc, args.where))
      return { docs: args.limit ? docs.slice(0, args.limit) : docs }
    },
    async findByID(args: any) {
      const doc = collections[args.collection].find((value) => value.id === args.id)
      if (!doc) throw new Error('Not found')
      return doc
    },
    async create(args: any) {
      const doc = {
        id: `${args.collection}-${++sequence}`,
        createdAt: new Date().toISOString(),
        ...args.data,
      }
      collections[args.collection].push(doc)
      return doc
    },
    async update(args: any) {
      const doc = collections[args.collection].find((value) => value.id === args.id)
      if (!doc) throw new Error('Not found')
      Object.assign(doc, args.data)
      return doc
    },
  }
  return store
}

describe('POD-03 member feed tokens (unit)', () => {
  it('generates 32-byte base64url tokens and stores only their sha256 hex', async () => {
    const token = generateFeedToken()
    // 32 bytes → 43 base64url chars, no padding, url-safe alphabet only.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateFeedToken()).not.toBe(token)
    expect(hashFeedToken(token)).toBe(sha256Hex(token))
    expect(hashFeedToken(token)).not.toBe(token)

    const store = createFakeStore()
    const issued = await issueToken(store, { memberId: 'member-1', showId: 'show-1' })
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [doc] = store.collections['podcast-feed-tokens']
    expect(doc.tokenHash).toBe(sha256Hex(issued.token))
    expect(JSON.stringify(doc)).not.toContain(issued.token)
    expect(doc.member).toBe('member-1')
    expect(doc.show).toBe('show-1')
    expect(doc.revokedAt).toBeNull()
  })

  it('resolves a live token, stamps lastUsedAt, and fails constant-shape for bad tokens', async () => {
    const store = createFakeStore()
    const issued = await issueToken(store, { memberId: 'member-1', showId: 'show-1' })
    const resolved = await resolveToken(store, issued.token)
    expect(resolved).toEqual({ tokenId: issued.id, memberId: 'member-1', showId: 'show-1' })
    const [doc] = store.collections['podcast-feed-tokens']
    expect(doc.lastUsedAt).toBeTruthy()

    expect(await resolveToken(store, 'x'.repeat(43))).toBeNull()
    expect(await resolveToken(store, '')).toBeNull()
    expect(await resolveToken(store, undefined)).toBeNull()
    expect(await resolveToken(store, issued.token, { showId: 'other-show' })).toBeNull()
    expect(await resolveToken(store, issued.token, { showId: 'show-1' })).not.toBeNull()
  })

  it('revocation and rotation kill old tokens immediately; issue replaces the active token', async () => {
    const store = createFakeStore()
    const first = await issueToken(store, { memberId: 'member-1', showId: 'show-1' })

    const rotated = await rotateToken(store, { memberId: 'member-1', showId: 'show-1' })
    expect(rotated.token).not.toBe(first.token)
    expect(await resolveToken(store, first.token)).toBeNull()
    expect(await resolveToken(store, rotated.token)).not.toBeNull()

    const reissued = await issueToken(store, { memberId: 'member-1', showId: 'show-1' })
    expect(await resolveToken(store, rotated.token)).toBeNull()
    expect(await resolveToken(store, reissued.token)).not.toBeNull()

    const { revoked } = await revokeToken(store, { memberId: 'member-1', showId: 'show-1' })
    expect(revoked).toBe(1)
    expect(await resolveToken(store, reissued.token)).toBeNull()
    // Revoking again is a no-op, and tokens for another member/show are untouched.
    expect((await revokeToken(store, { memberId: 'member-1', showId: 'show-1' })).revoked).toBe(0)
    const other = await issueToken(store, { memberId: 'member-2', showId: 'show-1' })
    await revokeToken(store, { memberId: 'member-1', showId: 'show-1' })
    expect(await resolveToken(store, other.token)).not.toBeNull()
  })

  it('derives the entitlement binding: explicit policy wins, default is podcast-show:<id>/listen', () => {
    expect(podcastEntitlementForShow({ id: 'show-9' })).toEqual({
      resource: 'podcast-show:show-9',
      capability: 'listen',
    })
    expect(
      podcastEntitlementForShow({
        id: 'show-9',
        requiredEntitlement: { resource: 'premium-audio', capability: 'stream', scope: 's1' },
      }),
    ).toEqual({ resource: 'premium-audio', capability: 'stream', scope: 's1' })
    expect(
      podcastEntitlementForShow({ id: 'show-9', requiredEntitlement: { resource: '' } }),
    ).toEqual({ resource: 'podcast-show:show-9', capability: 'listen' })
  })

  it('builds the path-token feed and enclosure URLs podcast clients subscribe to', () => {
    expect(memberFeedPath('my-show', 'tok123')).toBe('/podcasts/my-show/member-feed/tok123')
    expect(memberEnclosurePath('my-show', 'tok123', 'ep-1')).toBe(
      '/podcasts/my-show/member-feed/tok123/episode/ep-1/audio',
    )
  })
})
