import { describe, expect, it } from 'vitest'
import { ValidationError } from 'payload'

import {
  assertEditorialPath,
  deriveEditorialPath,
  editorialSlug,
} from '../../src/modules/editorial/publishing-pass'

describe('PUB-02 canonical content paths', () => {
  const parent = { id: 'parent', contentType: 'page', site: 'site-a', canonicalPath: '/company' }
  const payload = { findByID: async () => parent }

  it('uses short page paths without exposing the editorial parent hierarchy', async () => {
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
    ).resolves.toMatchObject({ canonicalPath: '/team' })
  })

  it('refuses implementation and system URL spaces', () => {
    expect(() => assertEditorialPath('/admin/notes')).toThrow('reserved')
    expect(() => assertEditorialPath('/Two Words')).toThrow('lowercase')
  })

  it('reports a missing title/slug as a field validation error on title (RC2-DEBT-23)', async () => {
    const failure = await deriveEditorialPath({
      data: { contentType: 'article', site: 'site-a' },
      payload,
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ValidationError)
    expect((failure as ValidationError).status).toBe(400)
    expect((failure as ValidationError).data.errors).toEqual([
      { message: 'A title or URL slug is required.', path: 'title' },
    ])
  })
})
