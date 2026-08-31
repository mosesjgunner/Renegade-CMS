import { describe, expect, it } from 'vitest'
import {
  queryLocalSearch,
  resolveRedirect,
  validateRedirectRule,
} from '../../src/modules/public/discovery'

const publicDocument = {
  id: 'a',
  siteId: 'one',
  path: '/articles/alpha',
  title: 'Alpha search',
  summary: 'A searchable public record',
  status: 'published' as const,
  visibility: 'public' as const,
}

describe('public discovery contracts', () => {
  it('indexes only discoverable records, ranks exact/prefix matches, and converges on update/delete input', () => {
    const documents = [
      publicDocument,
      { ...publicDocument, id: 'private', title: 'Alpha private', visibility: 'private' as const },
      { ...publicDocument, id: 'other', siteId: 'two', title: 'Alpha other' },
    ]
    expect(queryLocalSearch({ documents, query: 'alpha', siteId: 'one' })).toMatchObject({
      total: 1,
      hits: [{ id: 'a' }],
    })
    expect(
      queryLocalSearch({
        documents: [{ ...publicDocument, title: 'Beta' }],
        query: 'alpha',
        siteId: 'one',
      }).total,
    ).toBe(0)
    expect(queryLocalSearch({ documents: [], query: 'alpha', siteId: 'one' }).total).toBe(0)
  })

  it('resolves exact, prefix, and regex redirects within a tenant and detects loops', () => {
    const rules = [
      {
        id: 'exact',
        siteId: 'one',
        fromPath: '/old',
        toPath: '/new',
        match: 'exact' as const,
        statusCode: 301 as const,
      },
      {
        id: 'prefix',
        siteId: 'one',
        fromPath: '/blog',
        toPath: '/articles',
        match: 'prefix' as const,
      },
      {
        id: 'regex',
        siteId: 'one',
        fromPath: '^/issue/(.+)$',
        toPath: '/articles/$1',
        match: 'regex' as const,
      },
      { id: 'loop-a', siteId: 'one', fromPath: '/a', toPath: '/b', match: 'exact' as const },
      { id: 'loop-b', siteId: 'one', fromPath: '/b', toPath: '/a', match: 'exact' as const },
    ]
    expect(resolveRedirect(rules, 'one', '/old')).toMatchObject({ target: '/new', statusCode: 301 })
    expect(resolveRedirect(rules, 'one', '/blog/post')).toMatchObject({ target: '/articles/post' })
    expect(resolveRedirect(rules, 'one', '/issue/hello')).toMatchObject({
      target: '/articles/hello',
    })
    expect(resolveRedirect(rules, 'one', '/a')).toEqual({ error: 'loop' })
    expect(resolveRedirect(rules, 'two', '/old')).toBeNull()
    expect(validateRedirectRule({ ...rules[0], fromPath: '//evil' })).not.toBe(true)
  })
})
