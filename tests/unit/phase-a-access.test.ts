import { describe, expect, it } from 'vitest'

import { Content, MediaAssets } from '../../src/collections/Publishing'

const request = (role?: string) => ({ req: { user: role ? { role } : null } }) as never

describe('Phase A access hardening', () => {
  it('does not expose raw content or media metadata to anonymous Payload requests', () => {
    expect(Content.access?.read?.(request())).toBe(false)
    expect(MediaAssets.access?.read?.(request())).toBe(false)
  })

  it('keeps the publisher-facing collection access available to staff', () => {
    expect(Content.access?.read?.(request('staff'))).toBe(true)
    expect(MediaAssets.access?.read?.(request('administrator'))).toBe(true)
  })
})
