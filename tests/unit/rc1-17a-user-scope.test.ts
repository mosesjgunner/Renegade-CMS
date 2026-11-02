import { describe, expect, it, vi } from 'vitest'
import { createUsersCollection } from '../../src/collections/Users'
import { MemberSiteRoles, Publications } from '../../src/collections/Identity'
import { Sites } from '../../src/collections/Sites'

const collection = createUsersCollection({ payloadSecret: 'unit-only', secureCookies: false })
function request(role: string, sites: string[]) {
  const find = vi.fn(async ({ collection }: { collection: string }) => ({
    docs:
      collection === 'sites'
        ? [{ id: 'site-a' }, { id: 'site-b' }]
        : collection === 'member-site-roles'
          ? sites.map((site) => ({ member: 'member-a', site, role: 'contributor' }))
          : [],
  }))
  return { user: { id: 'user-a', member: 'member-a', role }, payload: { find }, find }
}

describe('17A native user directory tenant policy', () => {
  it('exposes only active public publications to anonymous native reads', async () => {
    expect(
      await Publications.access!.read!({ req: { ...request('', []), user: null } } as never),
    ).toEqual({ and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] })
  })
  it('scopes operator publication reads to their own tenant', async () => {
    expect(
      await Publications.access!.read!({ req: request('staff', ['site-a']) } as never),
    ).toEqual({ site: { in: ['site-a'] } })
  })
  it('bounds staff identity reads to members with canonical site grants', async () => {
    const req = request('staff', ['site-a'])
    expect(await collection.access!.read!({ req } as never)).toEqual({
      member: { in: ['member-a'] },
    })
    expect(req.find).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collection: 'member-site-roles',
        where: { site: { in: ['site-a'] } },
        overrideAccess: true,
      }),
    )
  })
  it('rechecks revocation instead of using the session role as directory authority', async () => {
    expect(await collection.access!.read!({ req: request('staff', []) } as never)).toBe(false)
  })
  it('does not promote a canonical scoped owner when their last grant is revoked', async () => {
    const req = request('owner', [])
    expect(await collection.access!.read!({ req } as never)).toBe(false)
    expect(await collection.access!.update!({ req } as never)).toBe(false)
    expect(await Sites.access!.read!({ req } as never)).toBe(false)
  })
  it.each(['staff', 'administrator'])('denies %s global identity mutation', async (role) => {
    const req = request(role, ['site-a'])
    for (const operation of ['create', 'update', 'delete'] as const)
      expect(await collection.access![operation]!({ req } as never)).toBe(false)
  })
  it('denies scoped owner global account changes', async () => {
    const req = request('owner', ['site-a'])
    for (const operation of ['create', 'update', 'delete'] as const)
      expect(await collection.access![operation]!({ req } as never)).toBe(false)
  })
  it('retains global owner directory and account control', async () => {
    const req = request('owner', ['site-a', 'site-b'])
    for (const operation of ['read', 'create', 'update', 'delete'] as const)
      expect(await collection.access![operation]!({ req } as never)).toBe(true)
  })
  it.each([null, { id: 'member-a', role: 'subscriber' }])('rejects nonoperators', async (user) => {
    const req = { ...request('', []), user }
    expect(await collection.access!.read!({ req } as never)).toBe(false)
  })
  it('prevents a scoped owner from granting themselves another tenant', async () => {
    const req = request('owner', ['site-a'])
    expect(
      await MemberSiteRoles.access!.create!({
        req,
        data: { site: 'site-b', member: 'member-a', role: 'owner' },
      } as never),
    ).toBe(false)
    expect(await MemberSiteRoles.access!.update!({ req, data: { site: 'site-b' } } as never)).toBe(
      false,
    )
    expect(await MemberSiteRoles.access!.delete!({ req } as never)).toEqual({
      site: { in: ['site-a'] },
    })
  })
  it('bounds native site enumeration and deletion to persisted authority', async () => {
    const req = request('owner', ['site-a'])
    expect(await Sites.access!.read!({ req } as never)).toEqual({ id: { in: ['site-a'] } })
    expect(await Sites.access!.delete!({ req } as never)).toEqual({ id: { in: ['site-a'] } })
    expect(await Sites.access!.create!({ req } as never)).toBe(false)
    expect(await Sites.access!.read!({ req: { ...req, user: null } } as never)).toBe(false)
  })
})
