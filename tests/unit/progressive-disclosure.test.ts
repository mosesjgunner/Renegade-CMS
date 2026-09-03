import { describe, expect, it } from 'vitest'

import {
  applyProgressiveDisclosure,
  capabilityPresentationState,
  operationalOverview,
} from '../../src/modules/admin/progressive-disclosure'
import { Content } from '../../src/collections/Publishing'

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

  it('keeps ordinary editor work in publisher field groups and technical fields in Advanced', () => {
    const tabs = Content.fields?.[0] as {
      type?: string
      tabs?: Array<{ label: string; fields: Array<{ name?: string }> }>
    }
    expect(tabs.type).toBe('tabs')
    expect(tabs.tabs?.map((tab) => tab.label)).toEqual([
      'Writing',
      'Presentation',
      'Media',
      'Publish',
      'SEO',
      'Advanced',
    ])
    expect(
      tabs.tabs?.find((tab) => tab.label === 'Writing')?.fields.map((field) => field.name),
    ).toContain('body')
    expect(
      tabs.tabs?.find((tab) => tab.label === 'Advanced')?.fields.map((field) => field.name),
    ).toContain('auditMetadata')
  })
})
