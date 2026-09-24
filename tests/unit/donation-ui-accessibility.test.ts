import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../src/modules/commerce/DonationForm.tsx', import.meta.url),
  'utf8',
)

describe('public donation form accessibility assertions', () => {
  it('associates amount instructions and announces changing bounds', () => {
    expect(source).toContain('aria-describedby="donation-bounds"')
    expect(source).toContain('aria-live="polite"')
    expect(source).toContain('aria-invalid={Boolean(boundsError)}')
  })

  it('announces checkout errors and provides labeled keyboard-operable native controls', () => {
    expect(source).toContain('role="alert"')
    expect(source).toMatch(/<fieldset>\s*<legend>/)
    expect(source).toContain('htmlFor="donation-amount"')
    expect(source).toContain('type="radio"')
    expect(source).toContain('type="checkbox"')
    expect(source).toContain('checked={marketingConsent}')
  })

  it('keeps marketing consent independent and unchecked by default', () => {
    expect(source).toContain('useState(false)')
    expect(source).toContain('Send me occasional updates and news')
  })
})
