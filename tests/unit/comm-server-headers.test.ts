import { describe, expect, it, vi } from 'vitest'
import { HeadersAdapter } from 'next/dist/server/web/spec-extension/adapters/headers.js'
import { resolveCommunityActor } from '@/modules/community/service'

describe('community identity at public server rendering boundaries', () => {
  it('accepts Next read-only headers with an internal headers property', async () => {
    const store = {
      auth: vi.fn().mockResolvedValue({ user: null }),
      find: vi.fn(),
      findByID: vi.fn(),
    }
    const headers = HeadersAdapter.from({ host: 'publication.example', cookie: '' })
    expect(await resolveCommunityActor(store as never, headers, 'site')).toEqual({
      kind: 'anonymous',
      isStaff: false,
      isModerator: false,
    })
    expect(store.find).not.toHaveBeenCalled()
  })
  it('continues to accept native Request headers', async () => {
    expect(
      await resolveCommunityActor(
        { auth: vi.fn().mockResolvedValue({ user: null }) } as never,
        new Request('https://publication.example'),
        'site',
      ),
    ).toEqual({ kind: 'anonymous', isStaff: false, isModerator: false })
  })
})
