import { describe, expect, it } from 'vitest'

import { Brands, MemberSiteRoles, Publications, Spaces } from '../../src/collections/Identity'
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
  it('prevents staff from creating, editing or deleting team authority', async () => {
    const req = { user: { id: 'staff', role: 'staff' } }
    for (const operation of ['create', 'update', 'delete'] as const) {
      expect(await MemberSiteRoles.access![operation]!({ req } as never)).toBe(false)
    }
  })

  it('filters native team reads to the staff member site grants', async () => {
    const req = {
      user: { id: 'staff', role: 'staff', member: 'staff-member' },
      payload: {
        find: async ({ collection }: { collection: string }) => ({
          docs:
            collection === 'member-site-roles'
              ? [{ site: 'site-a', member: 'staff-member', role: 'contributor' }]
              : [{ id: 'site-a' }, { id: 'site-b' }],
        }),
      },
    }
    expect(await MemberSiteRoles.access!.read!({ req } as never)).toEqual({
      site: { in: ['site-a'] },
    })
  })
  it('denies an administrator after their last site grant is revoked', async () => {
    const { resolveOperatorGrantContext, checkOperatorSiteAccess } = await import(
      '../../src/modules/operations/operator-grants'
    )
    const payload = {
      find: async ({ collection }: { collection: string }) => ({
        docs: collection === 'sites' ? [{ id: 'site-a' }, { id: 'site-b' }] : [],
      }),
    } as never
    const user = { id: 'admin-without-grants', role: 'administrator', member: 'member-admin' }
    expect((await resolveOperatorGrantContext(payload, user)).authorized).toBe(false)
    expect(await checkOperatorSiteAccess(payload, user, 'site-b')).toBe(false)
    expect(
      (await resolveOperatorGrantContext(payload, { ...user, isGlobalOwner: true } as never))
        .authorized,
    ).toBe(false)
  })
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
    expect(await checkOperatorSiteAccess(payload, { id: 'u1', role: 'subscriber' }, 'site-a')).toBe(
      false,
    )
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

    expect(await checkOperatorSiteAccess(payload, { id: 'u-owner', role: 'owner' }, 'site-a')).toBe(
      true,
    )
    expect(await checkOperatorSiteAccess(payload, { id: 'u-owner', role: 'owner' }, 'site-b')).toBe(
      true,
    )
    expect(
      await checkOperatorSiteAccess(payload, { id: 'u-owner', role: 'owner' }, 'any-site'),
    ).toBe(true)
  })

  it('scopes staff strictly to sites granted in member-site-roles and denies cross-tenant access', async () => {
    const { resolveOperatorGrantContext, checkOperatorSiteAccess } = await import(
      '../../src/modules/operations/operator-grants'
    )
    const payload = {
      find: async ({
        collection,
        where,
      }: {
        collection: string
        where?: Record<string, unknown>
      }) => {
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

describe('Native commerce site grants', () => {
  it('denies foreign creates and tenant moves while filtering existing records', async () => {
    const { MerchantConnections } = await import('../../src/collections/Commerce')
    const req = {
      user: { id: 'staff', role: 'staff', member: 'member-a' },
      payload: {
        find: async () => ({ docs: [{ site: 'site-a', role: 'contributor' }] }),
      },
    }
    expect(await MerchantConnections.access!.create!({ req, data: {} } as never)).toBe(true)
    expect(
      await MerchantConnections.access!.create!({ req, data: { site: 'site-a' } } as never),
    ).toBe(true)
    expect(
      await MerchantConnections.access!.create!({ req, data: { site: 'site-b' } } as never),
    ).toBe(false)
    expect(
      await MerchantConnections.access!.update!({ req, data: { site: 'site-b' } } as never),
    ).toBe(false)
    expect(
      await MerchantConnections.access!.update!({ req, data: { label: 'Updated label' } } as never),
    ).toEqual({ site: { in: ['site-a'] } })
    expect(await MerchantConnections.access!.delete!({ req } as never)).toEqual({
      site: { in: ['site-a'] },
    })
  })
})

describe('Native audience and telecom site grants', () => {
  it('scopes telecom messages, deliveries, delivery-events, and subscribers to operator site grants', async () => {
    const {
      TelecomMessages,
      TelecomDeliveries,
      TelecomDeliveryEvents,
      Subscribers,
      AutomationDefinitions,
    } = await import('../../src/collections/Audience')
    const req = {
      user: { id: 'staff', role: 'staff', member: 'member-a' },
      payload: {
        find: async ({ collection }: { collection: string }) => {
          if (collection === 'member-site-roles') {
            return { docs: [{ site: 'site-a', role: 'contributor' }] }
          }
          if (collection === 'telecom-deliveries') {
            return { docs: [{ id: 'deliv-1', site: 'site-a' }] }
          }
          return { docs: [] }
        },
      },
    }

    // TelecomMessages create and read
    expect(await TelecomMessages.access!.create!({ req, data: { site: 'site-a' } } as never)).toBe(
      true,
    )
    expect(await TelecomMessages.access!.create!({ req, data: { site: 'site-b' } } as never)).toBe(
      false,
    )
    expect(await TelecomMessages.access!.read!({ req } as never)).toEqual({
      site: { in: ['site-a'] },
    })

    // TelecomDeliveries read (create is forbidden)
    expect(await TelecomDeliveries.access!.create!({ req, data: {} } as never)).toBe(false)
    expect(await TelecomDeliveries.access!.read!({ req } as never)).toEqual({
      site: { in: ['site-a'] },
    })

    // TelecomDeliveryEvents resolves parent deliveries
    expect(await TelecomDeliveryEvents.access!.create!({ req, data: {} } as never)).toBe(false)
    expect(await TelecomDeliveryEvents.access!.read!({ req } as never)).toEqual({
      delivery: { in: ['deliv-1'] },
    })

    // Subscribers scoped read
    expect(await Subscribers.access!.read!({ req } as never)).toEqual({ site: { in: ['site-a'] } })

    // AutomationDefinitions scoped read and create
    expect(await AutomationDefinitions.access!.read!({ req } as never)).toEqual({
      site: { in: ['site-a'] },
    })
    expect(
      await AutomationDefinitions.access!.create!({ req, data: { site: 'site-a' } } as never),
    ).toBe(true)
    expect(
      await AutomationDefinitions.access!.create!({ req, data: { site: 'site-b' } } as never),
    ).toBe(false)
  })
})
