import { describe, expect, it } from 'vitest'

import { redact } from '../../src/modules/core/logging'

describe('redact', () => {
  it('redacts sensitive keys and configured values recursively', () => {
    const secret = 'configured-sensitive-value'
    expect(
      redact(
        {
          authorization: 'Bearer value',
          nested: { note: `prefix ${secret} suffix`, token: 'another value' },
        },
        [secret],
      ),
    ).toEqual({
      authorization: '[REDACTED]',
      nested: { note: 'prefix [REDACTED] suffix', token: '[REDACTED]' },
    })
  })
})
