import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getResponsiveImageAttrs } from '../../src/modules/media/responsive'
import { publicMedia } from '../../src/modules/media/workflow'

const mocks = vi.hoisted(() => ({
  payload: {
    auth: vi.fn(),
    findByID: vi.fn(),
    find: vi.fn(),
    update: vi.fn(),
    jobs: { queue: vi.fn() },
  },
}))
vi.mock('payload', () => ({ getPayload: async () => mocks.payload }))
vi.mock('@payload-config', () => ({ default: {} }))
import { GET, POST } from '../../src/app/(frontend)/api/media/[id]/variants/route'
import { GET as videoBytes } from '../../src/app/(frontend)/video-media/[id]/[filename]/route'
import { GET as captionBytes } from '../../src/app/(frontend)/video-captions/[id]/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.payload.auth.mockResolvedValue({
    user: {
      id: 'operator',
      role: 'owner',
      authorizedSiteIds: ['alpha'],
      isGlobalOwner: false,
    },
  })
  mocks.payload.findByID.mockResolvedValue({ id: 'secret', site: 'beta' })
  mocks.payload.find.mockResolvedValue({ docs: [] })
})

describe('05B private media boundaries', () => {
  it.each([{ publicPolicy: 'private' }, { rightsStatus: 'pending' }, { site: 'foreign' }])(
    'denies alternate video and caption URLs for %j',
    async (policy) => {
      mocks.payload.find.mockResolvedValue({
        docs: [{ id: 'video', site: 'alpha', visibility: 'public', status: 'published' }],
      })
      mocks.payload.findByID
        .mockResolvedValueOnce({ site: 'alpha', sourceAsset: 'source' })
        .mockResolvedValueOnce({ id: 'source', site: 'alpha', ...policy })
      const video = await videoBytes(new Request('http://localhost/video-media/id/baseline.mp4'), {
        params: Promise.resolve({ id: 'id', filename: 'baseline.mp4' }),
      })
      expect(video.status).toBe(404)
      expect(await video.text()).toBe('Not found')
      mocks.payload.findByID
        .mockResolvedValueOnce({ video: 'video', asset: 'caption' })
        .mockResolvedValueOnce({ site: 'alpha', ...policy })
      const caption = await captionBytes(new Request('http://localhost/video-captions/id'), {
        params: Promise.resolve({ id: 'id' }),
      })
      expect(caption.status).toBe(404)
      expect(await caption.text()).toBe('Not found')
    },
  )
  it('rejects a forged site hint before returning private variant metadata', async () => {
    const res = await GET(new Request('http://localhost/api/media/secret/variants?siteId=alpha'), {
      params: Promise.resolve({ id: 'secret' }),
    })
    expect(res.status).toBe(403)
    expect(mocks.payload.find).not.toHaveBeenCalled()
  })
  it('rejects a forged site hint before crop mutation or worker enqueue', async () => {
    const res = await POST(
      new Request('http://localhost/api/media/secret/variants', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'alpha', focalPoint: { x: 0, y: 0 } }),
      }),
      { params: Promise.resolve({ id: 'secret' }) },
    )
    expect(res.status).toBe(403)
    expect(mocks.payload.update).not.toHaveBeenCalled()
    expect(mocks.payload.jobs.queue).not.toHaveBeenCalled()
  })
  it.each([
    { publicPolicy: 'private' },
    { rightsStatus: 'pending' },
    { rightsExpiresAt: '2000-01-01T00:00:00.000Z' },
    { processingState: 'quarantined' },
  ])('denies public replacement delivery for %j', async (policy) => {
    const old = { id: 'old', site: 'alpha', replaceGloballyWith: 'new' }
    const replacement = { id: 'new', site: 'alpha', ...policy }
    const payload = {
      findByID: async ({ id }: { id: string }) => (id === 'old' ? old : replacement),
      find: async ({ collection }: { collection: string }) => ({
        docs: collection === 'content' ? [{ id: 'article' }] : [],
      }),
    }
    expect(await publicMedia(payload as never, 'old')).toBeUndefined()
  })
  it('uses actual persisted rendition dimensions and permits decorative alt text', () => {
    const attrs = getResponsiveImageAttrs(
      {
        id: 'asset',
        altText: 'Editorial caption',
        width: 2000,
        height: 1000,
        variants: [
          {
            recipeKey: 'inline',
            format: 'jpeg',
            width: 960,
            height: 480,
            processingState: 'ready',
          },
          {
            recipeKey: 'inline',
            format: 'webp',
            width: 800,
            height: 400,
            processingState: 'ready',
          },
        ],
      },
      { alt: '' },
    )
    expect([attrs.width, attrs.height, attrs.alt]).toEqual([960, 480, ''])
    expect(attrs.sources[0]?.srcSet).toContain('800w')
  })
})
