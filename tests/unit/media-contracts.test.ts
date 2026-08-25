import { describe, expect, it } from 'vitest'

import {
  assertGraphicDocument,
  assertTranscriptSegments,
  bookNavigation,
  chunkTtsText,
  createArticleDraftFromTranscript,
  deriveTranscriptRevision,
  externalIdentityKey,
  forkApprovedUse,
  providerSyncOperation,
  resolveOfflineMutation,
  transcriptChecksum,
  ttsIdempotencyKey,
  updateAllApprovedUses,
} from '../../src/modules/media/contracts'

describe('media publication contracts', () => {
  it('uses a stable provider identity so repeated imports upsert rather than duplicate', () => {
    expect(
      externalIdentityKey({ provider: 'youtube', scopeId: 'channel-a', externalId: 'video-1' }),
    ).toBe('youtube:channel-a:video-1')
    expect(
      providerSyncOperation(
        { provider: 'rss', scopeId: 'show-a', externalId: 'episode-1' },
        '2026-08-25T00:00:00Z',
      ).operation,
    ).toBe('upsert')
  })

  it('preserves ordered transcript evidence and makes an unpublished article draft', () => {
    const segments = [{ id: 'a', startSeconds: 0, endSeconds: 2, text: 'A recorded fact.' }]
    assertTranscriptSegments(segments)
    const transcript = {
      id: 't1',
      mediaAssetId: 'm1',
      version: 2,
      source: 'provider' as const,
      segments,
      immutable: true as const,
    }
    const corrected = deriveTranscriptRevision({
      source: transcript,
      sourceKind: 'manual',
      segments: [{ ...segments[0], text: 'A corrected recorded fact.' }],
    })
    const draft = createArticleDraftFromTranscript({
      transcript: corrected,
      title: 'Draft',
      contentId: 'c1',
    })
    expect(draft.lifecycle).toBe('draft')
    expect(draft.provenance.checksum).toBe(transcriptChecksum(corrected.segments))
    expect(corrected.sourceRevisionId).toBe('t1')
  })

  it('rejects overlapping transcript segments', () => {
    expect(() =>
      assertTranscriptSegments([
        { id: 'a', startSeconds: 0, endSeconds: 3, text: '' },
        { id: 'b', startSeconds: 2, endSeconds: 4, text: '' },
      ]),
    ).toThrow('ordered')
  })

  it('covers the book, TTS, graphics and offline-capture acceptance decisions without mutating originals', () => {
    expect(
      bookNavigation(
        [
          { id: 'one', displayOrder: 1 },
          { id: 'two', displayOrder: 2 },
          { id: 'later', displayOrder: 3, releaseAt: '2099-01-01T00:00:00Z' },
        ],
        'one',
      ).next?.id,
    ).toBe('two')
    const chunks = chunkTtsText('one two three four five', 100)
    expect(chunks).toEqual(['one two three four five'])
    expect(ttsIdempotencyKey('revision-1', { voice: 'licensed-reader', pronunciation: {} })).toBe(
      ttsIdempotencyKey('revision-1', { voice: 'licensed-reader', pronunciation: {} }),
    )
    assertGraphicDocument({
      id: 'graphic-1',
      sourceMediaAssetId: 'original-asset',
      sourceRevision: 'sha256:original',
      layers: [
        {
          id: 'base',
          name: 'crop and brand',
          opacity: 1,
          recipe: {
            version: 1,
            edits: [
              { type: 'crop', x: 0, y: 0, width: 1, height: 1 },
              { type: 'text', value: 'Headline', x: 1, y: 1, font: 'Brand Sans', color: '#000' },
              { type: 'brand-overlay', brandKitId: 'brand', assetId: 'logo', opacity: 1 },
            ],
          },
        },
      ],
    })
    const uses = [
      {
        id: 'article-use',
        derivativeId: 'og-v1',
        target: 'article' as const,
        targetId: 'article-1',
        approved: true,
      },
      {
        id: 'social-use',
        derivativeId: 'og-v1',
        target: 'social-draft' as const,
        targetId: 'social-1',
        approved: true,
      },
    ]
    expect(forkApprovedUse(uses[0], 'og-v2')).toMatchObject({
      derivativeId: 'og-v2',
      approved: false,
    })
    expect(
      updateAllApprovedUses(uses, 'og-v1', 'og-v2').every((use) => use.derivativeId === 'og-v2'),
    ).toBe(true)
    expect(resolveOfflineMutation('queued', false)).toBe('conflict')
  })
})
