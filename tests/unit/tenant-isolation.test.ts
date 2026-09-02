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
      collection.fields?.find(
        (field): field is { name: string } =>
          Boolean(field && typeof field === 'object' && 'name' in field && (field as { name?: unknown }).name === 'site'),
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
