import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('production module safety defaults', () => {
  it('does not default the production compose runtime to the unsafe full module set', () => {
    const compose = readFileSync(path.resolve('compose.production.yaml'), 'utf8')

    expect(compose).toContain('RENEGADE_MODULES: ${RENEGADE_MODULES:-}')
    expect(compose).toContain(
      'RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: ${RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT:-false}',
    )
    expect(compose).not.toContain('RENEGADE_MODULES: ${RENEGADE_MODULES:-all}')
    expect(compose).not.toContain(
      'RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: ${RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT:-true}',
    )
  })
})
