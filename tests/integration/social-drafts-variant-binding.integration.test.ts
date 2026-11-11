/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { POST } from '../../src/app/(frontend)/api/admin/social/drafts/route'

/**
 * TA-P1-1 regression: social draft mutations must stay bound to the
 * checked draft and its site. `update-draft` previously applied variant
 * updates by caller-supplied variant id without verifying the variant's
 * parent draft — so an operator could overwrite another tenant's variant
 * (including resetting its approval state) through their own draft. The
 * create paths likewise accepted caller-supplied accountIds without
 * verifying the account belongs to the draft's site.
 */

const draftA = {
  id: 'draft-a',
  site: 'site-a',
  status: 'draft',
  title: 'Draft A',
  canonicalUrl: '',
}
const variantA1 = {
  id: 'variant-a1',
  draft: 'draft-a',
  account: 'acct-a',
  network: 'x',
  text: 'A1',
}
const variantB1 = {
  id: 'variant-b1',
  draft: 'draft-b',
  account: 'acct-b',
  network: 'x',
  text: 'B1',
}
const accountA = { id: 'acct-a', site: 'site-a', network: 'x' }
const accountB = { id: 'acct-b', site: 'site-b', network: 'x' }

const pools: Record<string, any[]> = {
  'social-drafts': [draftA],
  'social-network-variants': [variantA1, variantB1],
  'social-accounts': [accountA, accountB],
}

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(async (args: any) => {
    const pool = pools[args.collection] || []
    return pool.find((item) => String(item.id) === String(args.id)) || null
  }),
  find: vi.fn(async (args: any) => {
    if (args.collection === 'social-network-variants' && args.where?.draft?.equals) {
      return {
        docs: pools['social-network-variants'].filter(
          (v) => String(v.draft) === String(args.where.draft.equals),
        ),
      }
    }
    return { docs: [] }
  }),
  create: vi.fn(async (args: any) => {
    const doc = { id: `created-${Math.random()}`, ...args.data }
    ;(pools[args.collection] ||= []).push(doc)
    return doc
  }),
  update: vi.fn(async (args: any) => {
    const pool = pools[args.collection] || []
    const found = pool.find((item) => String(item.id) === String(args.id))
    if (found) Object.assign(found, args.data)
    return { id: args.id, ...args.data }
  }),
}

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
}))
vi.mock('@/modules/social/worker', () => ({
  getSocialAdapter: () => ({ validatePost: () => ({ isValid: true, errors: [] }) }),
}))

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/social/drafts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const updatesTo = (collection: string) =>
  mockPayload.update.mock.calls.filter((call: any[]) => call[0].collection === collection)
const createsTo = (collection: string) =>
  mockPayload.create.mock.calls.filter((call: any[]) => call[0].collection === collection)

describe('Social drafts — variant/account binding (TA-P1-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pools['social-drafts'] = [{ ...draftA }]
    pools['social-network-variants'] = [{ ...variantA1 }, { ...variantB1 }]
    pools['social-accounts'] = [{ ...accountA }, { ...accountB }]
    mockPayload.auth.mockResolvedValue({
      user: {
        id: 'op-a',
        email: 'a@example.com',
        role: 'administrator',
        authorizedSiteIds: ['site-a'],
      },
    })
  })

  it('rejects update-draft naming a variant of another tenant’s draft, writing nothing', async () => {
    const res = await POST(
      postRequest({
        action: 'update-draft',
        draftId: 'draft-a',
        variants: [{ id: 'variant-b1', accountId: 'acct-a', network: 'x', text: 'hijacked text' }],
      }),
    )

    expect(res.status).toBe(403)
    expect(updatesTo('social-network-variants')).toHaveLength(0)
    expect(updatesTo('social-drafts')).toHaveLength(0)
    expect(pools['social-network-variants'][1].text).toBe('B1')
  })

  it('still updates a variant that belongs to the draft', async () => {
    const res = await POST(
      postRequest({
        action: 'update-draft',
        draftId: 'draft-a',
        variants: [{ id: 'variant-a1', accountId: 'acct-a', network: 'x', text: 'revised text' }],
      }),
    )

    expect(res.status).toBe(200)
    expect(updatesTo('social-network-variants')).toHaveLength(1)
    expect(pools['social-network-variants'][0].text).toBe('revised text')
  })

  it('rejects update-draft adding a variant bound to another site’s account', async () => {
    const res = await POST(
      postRequest({
        action: 'update-draft',
        draftId: 'draft-a',
        variants: [{ accountId: 'acct-b', network: 'x', text: 'cross-site variant' }],
      }),
    )

    expect(res.status).toBe(400)
    expect(createsTo('social-network-variants')).toHaveLength(0)
  })

  it('rejects create-draft whose variant names another site’s account', async () => {
    const res = await POST(
      postRequest({
        action: 'create-draft',
        siteId: 'site-a',
        title: 'Cross-site draft',
        variants: [{ accountId: 'acct-b', network: 'x', text: 'hello' }],
      }),
    )

    expect(res.status).toBe(400)
    expect(createsTo('social-drafts')).toHaveLength(0)
    expect(createsTo('social-network-variants')).toHaveLength(0)
  })

  it('still creates a draft bound to the site’s own account', async () => {
    const res = await POST(
      postRequest({
        action: 'create-draft',
        siteId: 'site-a',
        title: 'Own-site draft',
        variants: [{ accountId: 'acct-a', network: 'x', text: 'hello' }],
      }),
    )

    expect(res.status).toBe(201)
    expect(createsTo('social-drafts')).toHaveLength(1)
    expect(createsTo('social-network-variants')).toHaveLength(1)
  })
})
