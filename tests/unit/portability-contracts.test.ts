import { describe, expect, it } from 'vitest'
import {
  createPortableManifest,
  createPortableArchive,
  restorePortableArchive,
  createTemplateConversionReport,
  discoverImport,
  executeImport,
  previewMapping,
  validatePortableManifest,
  type ImportPlan,
} from '../../src/modules/portability/contracts'

describe('M15 portability contracts', () => {
  const discovery = discoverImport('event-timeline-map', [
    {
      sourceId: 'event-1',
      kind: 'event',
      payload: {
        title: 'Founding',
        legacyUrl: '/old/founding',
        canonicalPath: '/events/founding',
        startsAt: '2020-01-01',
      },
    },
  ])
  const mapping = previewMapping({
    adapter: 'event-timeline-map',
    records: discovery.records,
    mappings: [
      { source: 'title', target: 'title', transform: 'copy', required: true },
      { source: 'startsAt', target: 'startsAt', transform: 'date' },
    ],
    identityReviewRequired: false,
    consentReviewRequired: false,
    financialReviewRequired: false,
  })
  const plan: ImportPlan = {
    runId: 'run-1',
    adapter: 'event-timeline-map',
    discovery,
    mapping,
    dryRun: false,
    allowMarketingEnrollment: false,
    allowFinancialFinalization: false,
    rollbackBoundary: 'created-by-run-only',
  }
  it('has deterministic identities, resumable checkpoints, redirects, and unsupported-field reports', () => {
    const first = executeImport(plan)
    const resumed = executeImport(plan, first.checkpoint)
    expect(first.deterministicIds['event-1']).toBe(resumed.deterministicIds['event-1'])
    expect(resumed.resumed).toBe(true)
    expect(first.redirects[0]?.toPath).toBe('/events/founding')
    expect(first.unsupportedFields).toContain('legacyUrl')
  })
  it('keeps marketing, consent, and financial imports review-only', () => {
    expect(
      executeImport({ ...plan, mapping: { ...mapping, consentReviewRequired: true } }).errors[0]
        ?.code,
    ).toBe('import.review_required')
    expect(
      executeImport({ ...plan, allowMarketingEnrollment: true as never }).errors[0]?.code,
    ).toBe('import.marketing_enrollment_forbidden')
  })
  it('creates checksummed non-secret manifests and review-required template reports', () => {
    const manifest = createPortableManifest({
      createdAt: '2026-08-25T00:00:00Z',
      records: [{ collection: 'events', id: 'event-1', data: { title: 'Founding' } }],
      media: [
        {
          id: 'm1',
          originalChecksum: 'sha256:original',
          derivativeChecksums: ['sha256:derived'],
          encryptedBlobChecksum: null,
        },
      ],
    })
    expect(() => validatePortableManifest(manifest)).not.toThrow()
    expect(() =>
      createPortableManifest({
        createdAt: 'x',
        records: [{ collection: 'members', id: 'm', data: { oauth_token: 'nope' } }],
        media: [],
      }),
    ).toThrow('refuses secret')
    expect(
      createTemplateConversionReport({
        files: ['index.html'],
        assets: ['logo.svg'],
        recognizableRegions: ['Hero'],
        unconvertibleCode: ['legacy.js'],
      }).requiresVisualReview,
    ).toBe(true)
  })

  it('encrypts a portable archive and rejects a tampered restore', () => {
    const manifest = createPortableManifest({
      createdAt: '2026-08-25T00:00:00Z',
      records: [{ collection: 'content', id: 'article-1', data: { title: 'Portable' } }],
      media: [],
    })
    const key = new Uint8Array(32).fill(7)
    const archive = createPortableArchive(manifest, key)
    expect(restorePortableArchive(archive, key).records[0]?.id).toBe('article-1')
    expect(() => restorePortableArchive({ ...archive, checksum: 'sha256:tampered' }, key)).toThrow(
      'integrity',
    )
  })
})
