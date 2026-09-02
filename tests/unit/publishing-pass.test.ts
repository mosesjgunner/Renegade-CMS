import { describe, expect, it } from 'vitest'

import {
  assertEditorialPath,
  deriveEditorialPath,
  editorialSlug,
} from '../../src/modules/editorial/publishing-pass'

describe('PUB-02 canonical content paths', () => {
  const parent = { id: 'parent', contentType: 'page', site: 'site-a', canonicalPath: '/company' }
  const payload = { findByID: async () => parent }

  it('derives readable post and hierarchical page paths without a second page model', async () => {
    expect(editorialSlug('Hello, Renegade CMS!')).toBe('hello-renegade-cms')
    await expect(
      deriveEditorialPath({
        data: { title: 'Launch Notes', contentType: 'article', site: 'site-a' },
        payload,
      }),
    ).resolves.toMatchObject({ slug: 'launch-notes', canonicalPath: '/articles/launch-notes' })
    await expect(
      deriveEditorialPath({
        data: { title: 'Team', contentType: 'page', site: 'site-a', parentPage: 'parent' },
        payload,
      }),
    ).resolves.toMatchObject({ canonicalPath: '/company/team' })
  })

  it('refuses implementation and system URL spaces', () => {
    expect(() => assertEditorialPath('/admin/notes')).toThrow('reserved')
    expect(() => assertEditorialPath('/Two Words')).toThrow('lowercase')
  })
})
