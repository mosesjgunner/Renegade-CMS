import { describe, expect, it } from 'vitest'
import { parseImageSourceSha } from '../../src/scripts/operational-compose'

const sourceSha = '1234567890abcdef1234567890abcdef12345678'

describe('operational target image identity', () => {
  it('reads matching full source identities independently of the operator environment', () => {
    expect(
      parseImageSourceSha(JSON.stringify({ root: { sourceSha }, standalone: { sourceSha } })),
    ).toBe(sourceSha)
  })

  it.each([
    null,
    {},
    { root: { sourceSha } },
    { root: { sourceSha: 'unknown' }, standalone: { sourceSha: 'unknown' } },
    {
      root: { sourceSha: sourceSha.slice(0, 8) },
      standalone: { sourceSha: sourceSha.slice(0, 8) },
    },
    { root: { sourceSha }, standalone: { sourceSha: 'f'.repeat(40) } },
  ])('rejects missing, shortened or contradictory image provenance: %j', (provenance) => {
    expect(() => parseImageSourceSha(JSON.stringify(provenance))).toThrow('Target image requires')
  })

  it('rejects malformed image output', () => {
    expect(() => parseImageSourceSha('not JSON')).toThrow()
  })
})
