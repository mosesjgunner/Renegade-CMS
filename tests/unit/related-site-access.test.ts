import { describe, expect, it, vi } from 'vitest'
import {
  operatorRelatedSiteAccess,
  checkOperatorRecordAccess,
} from '@/modules/operations/operator-grants'

function request() {
  const count = vi.fn().mockResolvedValue({ totalDocs: 1 })
  const payload = {
    count,
    find: vi.fn().mockImplementation(async ({ collection }) => ({
      docs:
        collection === 'member-site-roles'
          ? [{ site: 'site-a', role: 'community-manager' }]
          : [{ id: 'site-a' }, { id: 'site-b' }],
    })),
  }
  return { payload, user: { id: 'operator-a', role: 'staff', member: 'member-a' } } as any
}

describe('persisted parent site authority', () => {
  it('filters child reads through the actual parent relationship', async () => {
    const access = operatorRelatedSiteAccess('discussion.site', 'discussions')
    expect(await access.read({ req: request() })).toEqual({ 'discussion.site': { in: ['site-a'] } })
  })
  it('checks foreign parent substitution before updating a permitted child', async () => {
    const req = request()
    req.payload.count.mockResolvedValue({ totalDocs: 0 })
    const access = operatorRelatedSiteAccess('discussion.site', 'discussions')
    expect(await access.update({ req, data: { discussion: 'foreign-parent' } })).toBe(false)
    expect(req.payload.count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'discussions',
        where: {
          and: [{ id: { equals: 'foreign-parent' } }, { site: { in: ['site-a'] } }],
        },
      }),
    )
  })
  it('keeps existing child scope on edits that do not change the parent', async () => {
    const access = operatorRelatedSiteAccess('discussion.site', 'discussions')
    expect(await access.update({ req: request(), data: { body: 'edit' } })).toEqual({
      'discussion.site': { in: ['site-a'] },
    })
  })
  it('checks nested editorial ownership for creates and custom actions', async () => {
    const req = request()
    const access = operatorRelatedSiteAccess('article.content.site', 'article-family-content')
    expect(await access.create({ req, data: { article: { id: 'article-a' } } })).toBe(true)
    expect(req.payload.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [{ id: { equals: 'article-a' } }, { 'content.site': { in: ['site-a'] } }],
        },
      }),
    )
    req.payload.count.mockResolvedValue({ totalDocs: 0 })
    expect(
      await checkOperatorRecordAccess(
        req.payload,
        req.user,
        'article-family-content',
        'foreign',
        'content.site',
      ),
    ).toBe(false)
  })
  it('rejects an anonymous actor and revoked canonical grants', async () => {
    const access = operatorRelatedSiteAccess('discussion.site', 'discussions')
    const req = request()
    req.user = null
    expect(await access.read({ req })).toBe(false)
    req.user = { id: 'operator-a', role: 'staff', member: 'member-a' }
    req.payload.find.mockResolvedValue({ docs: [] })
    expect(await access.create({ req, data: { discussion: 'parent' } })).toBe(false)
  })
})
