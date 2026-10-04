import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/(frontend)/api/admin/content/preview/route'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findByID: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => mocks }))
vi.mock('@/modules/editorial/persistence', () => ({ createEditorialPreviewToken: mocks.create }))
const request = (origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/admin/content/preview', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'content-1' }),
  })
describe('RC-02 saved draft preview boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ user: { id: 'owner-1', role: 'owner' } })
    mocks.findByID.mockResolvedValue({ id: 'content-1', contentType: 'article' })
    mocks.find.mockResolvedValue({ docs: [{ id: 'article-1', currentRevision: 'revision-3' }] })
    mocks.create.mockResolvedValue({ token: 'opaque-token' })
  })
  it('rejects anonymous access before reading content or minting tokens', async () => {
    mocks.auth.mockResolvedValue({ user: null })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.findByID).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects cross-origin requests', async () => {
    expect((await POST(request('https://other.test'))).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not mint previews for denied content', async () => {
    mocks.findByID.mockRejectedValue(new Error('Access denied'))
    expect((await POST(request())).status).toBe(404)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('uses normal access policy and pins the saved revision with a bounded expiry', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, user: { id: 'owner-1', role: 'owner' } }),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      mocks,
      expect.objectContaining({
        articleId: 'article-1',
        revisionId: 'revision-3',
        createdBy: 'owner-1',
      }),
    )
    const expiry = Date.parse(mocks.create.mock.calls[0][1].expiresAt)
    expect(expiry - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000)
    expect(expiry - Date.now()).toBeGreaterThan(29 * 60 * 1000)
  })
})
