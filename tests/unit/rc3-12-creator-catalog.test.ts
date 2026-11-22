import { describe, expect, it } from 'vitest'
import {
  catalogChecksum,
  classifyCatalogManifest,
  durableKeyFor,
  itemChecksum,
  type CatalogManifest,
} from '../../src/modules/creator-catalog/contracts'

/**
 * RC3-12 unit proof: the staging classification is a pure function —
 * ready / review / blocked verdicts with actionable reasons, durable
 * keys and checksums deterministic, roster records refused by design.
 */

const manifest = (items: Record<string, unknown>[]): CatalogManifest => ({
  formatVersion: 1,
  source: 'unit-fixture',
  series: [{ sourceId: 'career', title: 'Career Works', items: items as never }],
})

describe('RC3-12 creator catalog contracts', () => {
  it('derives stable durable keys and checksums', () => {
    expect(durableKeyFor('career', 'ep 1')).toBe('career/ep-1')
    const item = { sourceId: 'a', kind: 'article', title: 'Hello' }
    expect(itemChecksum(item)).toBe(itemChecksum({ ...item }))
    expect(itemChecksum(item)).not.toBe(itemChecksum({ ...item, title: 'Other' }))
    expect(catalogChecksum({ b: 1, a: 2 })).toBe(catalogChecksum({ a: 2, b: 1 }))
  })

  it('classifies a clean item ready and a malformed item blocked', () => {
    const result = classifyCatalogManifest(
      manifest([
        { sourceId: 'a', kind: 'article', title: 'Clean' },
        { sourceId: 'b', kind: 'article' },
      ]),
    )
    expect(result.counts).toEqual({ ready: 1, review: 0, blocked: 1 })
    expect(result.items[1]!.reasons.join(' ')).toMatch(/malformed/)
  })

  it('refuses roster records and podcast kinds with named reasons', () => {
    const result = classifyCatalogManifest(
      manifest([
        { sourceId: 'r', kind: 'roster-entry', title: 'Members', roster: true },
        { sourceId: 'p', kind: 'podcast-episode', title: 'Episode 1' },
      ]),
    )
    expect(result.counts.blocked).toBe(2)
    expect(result.items[0]!.reasons.join(' ')).toMatch(/grant workflow/)
    expect(result.items[1]!.reasons.join(' ')).toMatch(/RC3-10\/11/)
  })

  it('blocks checksum mismatch and missing consent; reviews duplicates and unknown rights', () => {
    const result = classifyCatalogManifest(
      manifest([
        { sourceId: 'a', kind: 'video', title: 'Same Title' },
        { sourceId: 'x', kind: 'video', title: 'Tampered', checksum: 'deadbeef' },
        { sourceId: 'b', kind: 'video', title: 'Consent Gap', consentStatus: 'missing' },
        { sourceId: 'c', kind: 'video', title: 'Same Title' },
        { sourceId: 'd', kind: 'video', title: 'Rights Gap', rightsStatus: 'unknown' },
      ]),
    )
    const byId = new Map(result.items.map((verdict) => [verdict.itemSourceId, verdict]))
    expect(result.counts).toEqual({ ready: 1, review: 2, blocked: 2 })
    expect(byId.get('a')!.state).toBe('ready')
    expect(byId.get('x')!.state).toBe('blocked')
    expect(byId.get('x')!.reasons.join(' ')).toMatch(/checksum mismatch/)
    expect(byId.get('b')!.state).toBe('blocked')
    expect(byId.get('b')!.reasons.join(' ')).toMatch(/consent not recorded/)
    expect(byId.get('c')!.state).toBe('review')
    expect(byId.get('c')!.reasons.join(' ')).toMatch(/duplicate title/)
    expect(byId.get('d')!.state).toBe('review')
    expect(byId.get('d')!.reasons.join(' ')).toMatch(/rights status unverified/)
  })

  it('reviews a title that already exists in the site catalog', () => {
    const result = classifyCatalogManifest(
      manifest([{ sourceId: 'a', kind: 'article', title: 'Old Post' }]),
      ['Old Post'],
    )
    expect(result.items[0]!.state).toBe('review')
    expect(result.items[0]!.reasons.join(' ')).toMatch(/duplicate title/)
  })

  it('rejects an unsupported manifest version', () => {
    expect(() => classifyCatalogManifest({ formatVersion: 99, source: 'x', series: [] })).toThrow(
      /Unsupported catalog manifest version/,
    )
  })
})
