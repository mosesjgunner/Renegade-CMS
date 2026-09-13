import { describe, expect, it } from 'vitest'

import {
  assertMediaPublishable,
  mediaRightsIssue,
  previewReplacementImpact,
} from '../../src/modules/media/workflow'

describe('MED-02 practical DAM governance', () => {
  it('blocks unapproved, expired, and embargoed assets from new public uses', () => {
    expect(mediaRightsIssue({ rightsStatus: 'pending' })).toMatch(/approval/i)
    expect(() => assertMediaPublishable({ rightsExpiresAt: '2020-01-01T00:00:00.000Z' })).toThrow(
      /expired/i,
    )
    expect(() => assertMediaPublishable({ embargoUntil: '2099-01-01T00:00:00.000Z' })).toThrow(
      /embargo/i,
    )
    expect(() => assertMediaPublishable({ rightsStatus: 'approved' })).not.toThrow()
  })

  it('previews only same-site graph usages before a selected replacement rewires them', async () => {
    const payload = {
      find: async () => ({
        docs: [
          {
            id: 'use-a',
            targetType: 'content',
            targetId: 'page-a',
            field: 'heroMedia',
            lifecycle: 'public',
          },
          {
            id: 'use-b',
            targetType: 'social-network-variant',
            targetId: 'draft-b',
            slot: 'image',
            lifecycle: 'scheduled',
          },
        ],
      }),
    }
    await expect(
      previewReplacementImpact(payload as never, 'site-a', 'asset-a', ['use-b']),
    ).resolves.toEqual({
      affected: 1,
      usages: [
        {
          id: 'use-a',
          targetType: 'content',
          targetId: 'page-a',
          field: 'heroMedia',
          slot: '',
          lifecycle: 'public',
          selected: false,
        },
        {
          id: 'use-b',
          targetType: 'social-network-variant',
          targetId: 'draft-b',
          field: '',
          slot: 'image',
          lifecycle: 'scheduled',
          selected: true,
        },
      ],
    })
  })
})
