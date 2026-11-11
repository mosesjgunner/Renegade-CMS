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
      { slug: 'products', fields: [], admin: { group: 'Commerce' } },
      { slug: 'internal-projections', fields: [] },
    ])
    expect(collections).toHaveLength(3)
    expect(collections.find((item) => item.slug === 'content')?.admin?.hidden).not.toBe(true)
    expect(collections.find((item) => item.slug === 'products')?.admin?.hidden).not.toBe(true)
    expect(collections.find((item) => item.slug === 'internal-projections')?.admin?.hidden).toBe(
      true,
    )
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

  it('lays the editor out writing-first: canvas up front, essentials in the sidebar, technical fields in Advanced', () => {
    type FieldLike = {
      name?: string
      type?: string
      label?: string
      admin?: { position?: string; hidden?: boolean }
      fields?: FieldLike[]
    }
    const fields = (Content.fields ?? []) as FieldLike[]
    // No tabs: the writing surface is a single writing-first flow.
    expect(fields.some((field) => field.type === 'tabs')).toBe(false)
    const flatten = (list: FieldLike[]): FieldLike[] =>
      list.flatMap((field) => [field, ...flatten(field.fields ?? [])])
    const all = flatten(fields)
    const named = all.filter((field) => field.name)
    // Every persisted schema field survives the layout: 76 top-level named
    // fields plus 8 named array subfields (arrays carry named children, e.g.
    // correctionNotices.label) = 84 named entries at all depths. Verified
    // identical, path by path, against the pre-GUI-01B schema at fcf046a.
    expect(named).toHaveLength(84)
    // The headline and body lead the main column, outside any settings group.
    const topLevelNames = fields.map((field) => field.name)
    expect(topLevelNames.indexOf('title')).toBeLessThan(topLevelNames.indexOf('body'))
    expect(topLevelNames).toContain('draftAutosave')
    // Publishing essentials are pinned to the sidebar (GUI-04A, kept by 04H).
    for (const name of ['contentType', 'status', 'visibility', 'publishedAt']) {
      expect(all.find((field) => field.name === name)?.admin?.position).toBe('sidebar')
    }
    // Site is website-level context, never a per-post field (GUI-04H,
    // Matthew's directive): still present in the schema, hidden from the form.
    expect(all.find((field) => field.name === 'site')?.admin?.hidden).toBe(true)
    // Publication and Space live in the collapsed Placement group (GUI-04H):
    // where a post lives beyond the website, in one deliberate place.
    const placement = fields.find(
      (field) => field.type === 'collapsible' && field.label === 'Placement',
    )
    expect(placement?.fields?.map((field) => field.name)).toEqual(
      expect.arrayContaining(['publication', 'space']),
    )
    // Technical metadata stays available under Advanced, not deleted.
    const advanced = fields.find(
      (field) =>
        field.type === 'collapsible' && field.label === 'Advanced settings and technical metadata',
    )
    expect(advanced?.fields?.map((field) => field.name)).toContain('auditMetadata')
  })
})
