import { describe, expect, it } from 'vitest'

import {
  assertMediaPublishable,
  assertMediaPermission,
  duplicateMediaCandidates,
  mediaRightsIssue,
  previewReplacementImpact,
  reconcileMediaUsages,
} from '../../src/modules/media/workflow'

describe('MED-02 practical DAM governance', () => {
  it('refuses anonymous governance reads before any hidden asset fields can be queried', async () => {
    await expect(
      assertMediaPermission({} as never, null, { kind: 'site', siteId: 'site-a' }, 'content.read'),
    ).rejects.toMatchObject({ status: 403 })
  })

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

  it('reconciles rich text, presentation, SEO, and scheduled distribution references without merging anything', async () => {
    const created: Array<Record<string, unknown>> = []
    const payload = {
      collections: { content: {}, 'page-layouts': {}, 'social-network-variants': {} },
      find: async ({ collection }: { collection: string }) => {
        if (collection === 'content')
          return {
            docs: [
              {
                id: 'page-a',
                status: 'published',
                heroMedia: 'hero',
                richText: { media: 'inline' },
                socialOverride: { seoImage: 'social' },
              },
            ],
          }
        if (collection === 'page-layouts')
          return {
            docs: [
              {
                id: 'layout-a',
                status: 'published',
                blocks: [{ props: { image: { id: 'layout-image' } } }],
              },
            ],
          }
        if (collection === 'social-network-variants')
          return {
            docs: [
              {
                id: 'social-a',
                status: 'scheduled',
                network: 'bluesky',
                attachments: ['distribution'],
              },
            ],
          }
        return { docs: [] }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return data
      },
      update: async () => undefined,
      delete: async () => undefined,
    }
    await expect(reconcileMediaUsages(payload as never, 'site-a')).resolves.toMatchObject({
      created: 5,
      removed: 0,
      failures: [],
    })
    expect(created.map((item) => item.lifecycle)).toEqual(
      expect.arrayContaining(['public', 'scheduled']),
    )
    expect(created.map((item) => item.purpose)).toEqual(
      expect.arrayContaining(['inline', 'layout', 'distribution']),
    )
  })

  it('returns checksum candidates for human review and never changes media while listing them', async () => {
    const payload = {
      find: async () => ({
        docs: [
          { id: 'a', title: 'A', checksum: 'same' },
          { id: 'b', title: 'B', checksum: 'same' },
          { id: 'c', title: 'C', checksum: 'other' },
        ],
      }),
    }
    await expect(duplicateMediaCandidates(payload as never, 'site-a')).resolves.toEqual([
      {
        checksum: 'same',
        assets: [
          { id: 'a', title: 'A', createdAt: null },
          { id: 'b', title: 'B', createdAt: null },
        ],
      },
    ])
  })
})
