import { describe, expect, it } from 'vitest'

import { Brands, Publications, Spaces } from '../../src/collections/Identity'
import { Categories, Sections, Topics } from '../../src/collections/Publishing'
import { enforceSiteTenantBoundary } from '../../src/collections/canonical-shared'

describe('PUB-01 tenant isolation', () => {
  it('rejects a canonical relationship that belongs to another site', async () => {
    const guard = enforceSiteTenantBoundary([{ field: 'brand', collection: 'brands' }])
    const payload = {
      findByID: async () => ({ id: 'brand-b', site: 'site-b' }),
    }

    await expect(
      guard({ data: { site: 'site-a', brand: 'brand-b' }, req: { payload } } as never),
    ).rejects.toThrow('brand must belong to the same site')
  })

  it('puts every canonical branch below Site and guards its cross-record links', () => {
    const siteField = (collection: { fields?: unknown[] }) =>
      collection.fields?.find((field): field is { name: string } =>
        Boolean(
          field &&
            typeof field === 'object' &&
            'name' in field &&
            (field as { name?: unknown }).name === 'site',
        ),
      )

    expect(siteField(Spaces)).toMatchObject({ required: true, relationTo: 'sites' })
    expect(siteField(Brands)).toMatchObject({ required: true, relationTo: 'sites' })
    expect(siteField(Sections)).toMatchObject({ required: true, relationTo: 'sites' })
    expect(siteField(Categories)).toMatchObject({ required: true, relationTo: 'sites' })
    expect(siteField(Topics)).toMatchObject({ required: true, relationTo: 'sites' })
    expect(Publications.hooks?.beforeChange).toHaveLength(1)
    expect(Categories.hooks?.beforeChange).toHaveLength(2)
  })
})

describe('RC08C-TENANT operator site grant policy', () => {
  it('denies anonymous and non-staff actors', async () => {
    const { resolveOperatorGrantContext, checkOperatorSiteAccess } = await import(
      '../../src/modules/operations/operator-grants'
    )
    const payload = {} as never
    const anon = await resolveOperatorGrantContext(payload, null)
    expect(anon.authorized).toBe(false)
    expect(anon.authorizedSiteIds).toEqual([])

    const normalUser = await resolveOperatorGrantContext(payload, { id: 'u1', role: 'subscriber' })
    expect(normalUser.authorized).toBe(false)
    expect(await checkOperatorSiteAccess(payload, { id: 'u1', role: 'subscriber' }, 'site-a')).toBe(false)
  })

  it('grants global owner access across all sites', async () => {
    const { resolveOperatorGrantContext, checkOperatorSiteAccess } = await import(
      '../../src/modules/operations/operator-grants'
    )
    const payload = {
      find: async () => ({ docs: [{ id: 'site-a' }, { id: 'site-b' }] }),
    } as never
    const owner = await resolveOperatorGrantContext(payload, { id: 'u-owner', role: 'owner' })
    expect(owner.authorized).toBe(true)
    expect(owner.isGlobalOwner).toBe(true)
    expect(owner.authorizedSiteIds).toEqual(['site-a', 'site-b'])

    expect(await checkOperatorSiteAccess(payload, { id: 'u-owner', role: 'owner' }, 'site-a')).toBe(true)
    expect(await checkOperatorSiteAccess(payload, { id: 'u-owner', role: 'owner' }, 'site-b')).toBe(true)
    expect(await checkOperatorSiteAccess(payload, { id: 'u-owner', role: 'owner' }, 'any-site')).toBe(true)
  })

  it('scopes staff strictly to sites granted in member-site-roles and denies cross-tenant access', async () => {
    const { resolveOperatorGrantContext, checkOperatorSiteAccess } = await import(
      '../../src/modules/operations/operator-grants'
    )
    const payload = {
      find: async ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
        if (collection === 'member-site-roles') {
          return { docs: [{ id: 'msr-1', site: 'site-alpha', member: 'm1', role: 'contributor' }] }
        }
        return { docs: [] }
      },
    } as never

    const staffUser = { id: 'u-staff', role: 'staff', member: 'm1' }
    const grant = await resolveOperatorGrantContext(payload, staffUser)
    expect(grant.authorized).toBe(true)
    expect(grant.isGlobalOwner).toBe(false)
    expect(grant.authorizedSiteIds).toEqual(['site-alpha'])

    expect(await checkOperatorSiteAccess(payload, staffUser, 'site-alpha')).toBe(true)
    expect(await checkOperatorSiteAccess(payload, staffUser, 'site-beta')).toBe(false)
  })
})

