import { describe, expect, it } from 'vitest'

import {
  applyProgressiveDisclosure,
  capabilityPresentationState,
  operationalOverview,
} from '../../src/modules/admin/progressive-disclosure'

describe('progressive disclosure admin presentation', () => {
  it('keeps core navigation visible while hiding optional collection clutter without unregistering it', () => {
    const collections = applyProgressiveDisclosure([
      { slug: 'content', fields: [] },
      { slug: 'products', fields: [] },
    ])
    expect(collections).toHaveLength(2)
    expect(collections.find((item) => item.slug === 'content')?.admin?.hidden).not.toBe(true)
    expect(collections.find((item) => item.slug === 'products')?.admin?.hidden).toBe(true)
  })

  it('makes enabled capabilities discoverable and exposes degraded state', () => {
    expect(capabilityPresentationState({ status: 'healthy' })).toBe('healthy')
    expect(capabilityPresentationState({ status: 'degraded' })).toBe('degraded')
    expect(capabilityPresentationState({ status: 'disabled' })).toBe('disabled')
  })

  it('renders a safe operational overview without diagnostic details or secrets', () => {
    const overview = operationalOverview({
      database: { status: 'healthy' },
      worker: { status: 'unavailable' },
      jobs: { failed: 2 },
      email: { status: 'degraded' },
      backup: { status: 'healthy' },
      capabilities: [{ status: 'degraded' }],
    } as never)
    expect(overview).toEqual(
      expect.arrayContaining([
        ['Database', 'healthy'],
        ['Failed jobs', '2 failed'],
      ]),
    )
    expect(JSON.stringify(overview)).not.toContain('secret')
  })
})
