import { describe, expect, it } from 'vitest'

import {
  contentMatchesInstallChecksum,
  exampleContentChecksum,
  isStarterProvenance,
} from '../../src/modules/starters/provenance'
import { normalizeSiteVisibility } from '../../src/modules/public/site-visibility'

// UXI-06 unit proof for the provenance marker + the edited-content
// rule and the site-visibility policy values. The DB-level journey
// (install → edit → protected → remove) lives in
// tests/integration/uxi-stage4-journey.integration.test.ts.

const body = { root: { type: 'root', children: [] } }

describe('starter example provenance', () => {
  it('recognizes only starter provenance systems', () => {
    expect(isStarterProvenance('starter:publication-community')).toBe(true)
    expect(isStarterProvenance('starter:campaign-commerce')).toBe(true)
    expect(isStarterProvenance('onboarding-starter')).toBe(true)
    expect(isStarterProvenance('wordpress-import')).toBe(false)
    expect(isStarterProvenance(undefined)).toBe(false)
    expect(isStarterProvenance(null)).toBe(false)
  })

  it('matches the install checksum only while the record is untouched', () => {
    const checksum = exampleContentChecksum({
      title: 'Sample',
      summary: 'A sample page.',
      status: 'published',
      body,
    })
    const pristine = {
      title: 'Sample',
      summary: 'A sample page.',
      status: 'published',
      body,
      importSourceChecksum: checksum,
    }
    expect(contentMatchesInstallChecksum(pristine)).toBe(true)
    // Any operator edit — title, summary, status, or body — breaks it.
    expect(contentMatchesInstallChecksum({ ...pristine, title: 'Mine now' })).toBe(false)
    expect(contentMatchesInstallChecksum({ ...pristine, summary: 'Edited' })).toBe(false)
    expect(contentMatchesInstallChecksum({ ...pristine, status: 'draft' })).toBe(false)
    expect(
      contentMatchesInstallChecksum({
        ...pristine,
        body: { root: { type: 'root', children: [{ type: 'paragraph' }] } },
      }),
    ).toBe(false)
  })

  it('returns null (unknown) for legacy records without a checksum', () => {
    expect(contentMatchesInstallChecksum({ title: 'Old', body })).toBeNull()
  })
})

describe('site visibility policy values', () => {
  it('keeps the three policy states and defaults everything else to public', () => {
    expect(normalizeSiteVisibility('public')).toBe('public')
    expect(normalizeSiteVisibility('coming-soon')).toBe('coming-soon')
    expect(normalizeSiteVisibility('private')).toBe('private')
    expect(normalizeSiteVisibility(undefined)).toBe('public')
    expect(normalizeSiteVisibility('members')).toBe('public')
    expect(normalizeSiteVisibility('')).toBe('public')
  })
})
