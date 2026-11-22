import { describe, expect, it, vi } from 'vitest'
import { authorizeCreator, creatorQuota } from '@/modules/creator-studio/policy'

vi.mock('@/modules/community/moderation-actions', () => ({ assertMemberCanPost: vi.fn() }))

describe('creator quota policy', () => {
  it('uses valid per-member overrides and preserves site defaults', () => {
    expect(creatorQuota({ bytes: 100, liveMinutes: 20 }, { bytes: 0 })).toEqual({
      bytes: 0,
      liveMinutes: 20,
    })
  })
  it('does not turn invalid or missing limits into unlimited grants', () => {
    expect(creatorQuota({ bytes: 100, uploadCount: -1 }, { bytes: 'unlimited' })).toEqual({})
  })
})

describe('creator authorization', () => {
  it('rechecks grants and rejects suspended members and other Spaces', async () => {
    const docs: Record<string, Record<string, unknown>> = {
      sites: { lifecycle: 'active', creatorPolicy: { enabled: true } },
      members: { status: 'active' },
      spaces: { site: 'site-a', profile: 'profile', moderationState: 'clear' },
      profiles: { member: 'member-a' },
    }
    const role = { creatorCapabilities: ['media.upload'] }
    const payload = {
      findByID: vi.fn(async ({ collection }: { collection: string }) => docs[collection]),
      find: vi.fn(async () => ({ docs: [role] })),
    }
    const input = {
      siteId: 'site-a',
      memberId: 'member-a',
      capability: 'media.upload' as const,
      spaceId: 'space',
    }
    await expect(authorizeCreator(payload as never, input)).resolves.toEqual({ quota: {} })
    docs.profiles.member = 'member-b'
    await expect(authorizeCreator(payload as never, input)).rejects.toThrow('denied')
    docs.profiles.member = 'member-a'
    docs.spaces.site = 'site-b'
    await expect(authorizeCreator(payload as never, input)).rejects.toThrow('denied')
    docs.spaces.site = 'site-a'
    docs.members.status = 'suspended'
    await expect(authorizeCreator(payload as never, input)).rejects.toThrow('denied')
    docs.members.status = 'active'
    role.creatorCapabilities = []
    await expect(authorizeCreator(payload as never, input)).rejects.toThrow('denied')
  })
})
