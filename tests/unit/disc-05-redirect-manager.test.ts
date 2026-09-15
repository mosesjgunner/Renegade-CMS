import { describe, expect, it } from 'vitest'
import {
  generateRedirectsCsv,
  generateRedirectsJson,
  parseRedirectsCsv,
  parseRedirectsJson,
  validateRedirectRuleInput,
} from '../../src/modules/public/redirect-manager'
import type { PublicRedirect } from '../../src/payload-types'

describe('DISC-05 Redirect Manager Engine', () => {
  it('validates status codes, self-targeting, and circular loops', () => {
    // Valid rule
    expect(
      validateRedirectRuleInput({ fromPath: '/old-slug', toPath: '/new-slug', statusCode: '301' }),
    ).toEqual({ valid: true })

    // Self-targeting
    expect(
      validateRedirectRuleInput({ fromPath: '/same', toPath: '/same', statusCode: '301' }).valid,
    ).toBe(false)

    // Invalid status code
    expect(
      validateRedirectRuleInput({ fromPath: '/a', toPath: '/b', statusCode: '500' }).valid,
    ).toBe(false)

    // Circular loop detection
    const existing = [{ fromPath: '/b', toPath: '/a' }]
    expect(validateRedirectRuleInput({ fromPath: '/a', toPath: '/b' }, existing).error).toContain(
      'Circular redirect detected',
    )
  })

  it('parses CSV input with headers and validation', () => {
    const csv = `fromPath,toPath,statusCode,match
/old-post,/new-post,301,exact
/blog-archive,/articles,302,prefix
/invalid-self,/invalid-self,301,exact`

    const parsed = parseRedirectsCsv(csv)
    expect(parsed.rules).toHaveLength(2)
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.rules[0]).toMatchObject({
      fromPath: '/old-post',
      toPath: '/new-post',
      statusCode: '301',
    })
  })

  it('parses JSON input and exports CSV and JSON', () => {
    const json = JSON.stringify([
      { fromPath: '/v1/doc', toPath: '/docs/v1', statusCode: '301' },
      { fromPath: '/legacy', toPath: '/archive', statusCode: '307' },
    ])
    const parsed = parseRedirectsJson(json)
    expect(parsed.rules).toHaveLength(2)

    const mockDocs = [
      {
        id: '1',
        fromPath: '/v1/doc',
        toPath: '/docs/v1',
        statusCode: '301',
        match: 'exact',
        hitCount: 12,
      },
    ] as PublicRedirect[]

    const csvOut = generateRedirectsCsv(mockDocs)
    expect(csvOut).toContain('"/v1/doc"')
    expect(csvOut).toContain('"/docs/v1"')

    const jsonOut = generateRedirectsJson(mockDocs)
    expect(jsonOut).toContain('/v1/doc')
  })
})
