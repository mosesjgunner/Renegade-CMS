import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SocialCommandCenter from '@/modules/admin/SocialCommandCenter'
import {
  createCanonicalSocialPost,
  updateCanonicalCopy,
  overrideVariantCopy,
  resetVariantOverride,
  resolveEffectiveCopy,
} from '@/modules/social/models'
import { PLATFORM_MEDIA_RULES, validateMediaForNetwork } from '@/modules/social/media-pipeline'
import { FacebookAdapter } from '@/modules/social/adapters/facebook'
import { InstagramAdapter } from '@/modules/social/adapters/instagram'
import { ThreadsAdapter } from '@/modules/social/adapters/threads'
import { PinterestAdapter } from '@/modules/social/adapters/pinterest'

describe('Part 3 (Pass DIST-03): Social Command Center UI & Meta/Visual Architecture', () => {
  describe('1. SocialCommandCenter UI Rendering', () => {
    it('renders the Social Command Center with canonical editor, tabs, and preview card', () => {
      const html = renderToStaticMarkup(<SocialCommandCenter />)

      // Header & Subtitle
      expect(html).toContain('Social Distribution Command Center')
      expect(html).toContain('Unified multi-channel distribution engine')

      // Key UI Sections
      expect(html).toContain('Canonical Base Copy')
      expect(html).toContain('Customize for')
      expect(html).toContain('Pre-Flight Validation Gates')
      expect(html).toContain('Client Rendering Fidelity')

      // Connected Accounts & Tabs
      expect(html).toContain('@renegade@mastodon.social')
      expect(html).toContain('renegadeparty.bsky.social')
      expect(html).toContain('Renegade Sovereign Media')
      expect(html).toContain('Renegade CMS Official')
      expect(html).toContain('@renegade.cms')
      expect(html).toContain('Renegade Discovery')

      // Dynamic Character Counter & Actions
      expect(html).toContain('characters')
      expect(html).toContain('Dispatch Multi-Network Post')
    })
  })

  describe('2. Master-to-Variant Inheritance & Selective Overrides', () => {
    it('propagates canonical updates to clean variants while preserving custom overrides', () => {
      const post = createCanonicalSocialPost({
        id: 'post-101',
        siteId: 'site-a',
        publicationId: 'pub-1',
        title: 'Launch Post',
        baseCopy: 'Original base announcement text.',
        authorId: 'usr-1',
        targetAccounts: [
          { accountId: 'acc-fb', network: 'facebook' },
          { accountId: 'acc-x', network: 'x' },
          { accountId: 'acc-bsky', network: 'bluesky' },
        ],
      })

      const fbVariant = post.variants.find((v) => v.network === 'facebook')!
      const xVariant = post.variants.find((v) => v.network === 'x')!
      const bskyVariant = post.variants.find((v) => v.network === 'bluesky')!

      // Initially, all resolve to baseCopy
      expect(resolveEffectiveCopy(post, fbVariant)).toBe('Original base announcement text.')
      expect(resolveEffectiveCopy(post, xVariant)).toBe('Original base announcement text.')
      expect(resolveEffectiveCopy(post, bskyVariant)).toBe('Original base announcement text.')

      // User overrides X variant to fit character limit
      overrideVariantCopy(post, xVariant.id, 'Concise X micro-post with hashtags! #tech')
      expect(xVariant.isOverridden).toBe(true)
      expect(resolveEffectiveCopy(post, xVariant)).toBe('Concise X micro-post with hashtags! #tech')

      // Canonical copy is revised upstream
      updateCanonicalCopy(post, 'Revised upstream announcement text.')

      // Facebook and Bluesky reflect the upstream revision
      expect(resolveEffectiveCopy(post, fbVariant)).toBe('Revised upstream announcement text.')
      expect(resolveEffectiveCopy(post, bskyVariant)).toBe('Revised upstream announcement text.')

      // X variant retains its customized copy without being overwritten
      expect(resolveEffectiveCopy(post, xVariant)).toBe('Concise X micro-post with hashtags! #tech')

      // User resets override on X variant -> cascades back to base copy
      resetVariantOverride(post, xVariant.id)
      expect(xVariant.isOverridden).toBe(false)
      expect(resolveEffectiveCopy(post, xVariant)).toBe('Revised upstream announcement text.')
    })
  })

  describe('3. Meta & Visual Networks Rule Validation', () => {
    it('validates Facebook, Instagram, Threads, and Pinterest rules via adapters', () => {
      const fb = new FacebookAdapter()
      const ig = new InstagramAdapter()
      const th = new ThreadsAdapter()
      const pin = new PinterestAdapter()

      // Instagram strictly requires media
      const textOnly = {
        id: 'var-1',
        accountId: 'acc-1',
        network: 'instagram' as const,
        text: 'Text without image',
        attachments: [],
        status: 'draft' as const,
        idempotencyKey: 'k-1',
      }
      expect(ig.validatePost(textOnly).isValid).toBe(false)

      // Threads strictly limits to 500 characters
      const thLong = {
        id: 'var-2',
        accountId: 'acc-2',
        network: 'threads' as const,
        text: 'E'.repeat(501),
        attachments: [],
        status: 'draft' as const,
        idempotencyKey: 'k-2',
      }
      expect(th.validatePost(thLong).isValid).toBe(false)

      // Pinterest requires a boardId
      const pinNoBoard = {
        id: 'var-3',
        accountId: 'acc-3',
        network: 'pinterest' as const,
        text: 'Pin description',
        attachments: [{ mediaAssetId: 'asset-1', role: 'image' as const }],
        status: 'draft' as const,
        idempotencyKey: 'k-3',
      }
      expect(pin.validatePost(pinNoBoard).isValid).toBe(false)

      // Facebook accepts plain text post
      const fbText = {
        id: 'var-4',
        accountId: 'acc-4',
        network: 'facebook' as const,
        text: 'Facebook announcement status update',
        attachments: [],
        status: 'draft' as const,
        idempotencyKey: 'k-4',
      }
      expect(fb.validatePost(fbText).isValid).toBe(true)
    })

    it('enforces media aspect ratio constraints for Instagram (4:5) and Pinterest (2:3)', () => {
      // Instagram: 4:5 portrait (0.80) or 1:1 (1.00)
      const igRule = PLATFORM_MEDIA_RULES.instagram
      expect(igRule.aspectRatios.min).toBe(0.8)
      expect(igRule.aspectRatios.max).toBe(1.91)

      // Pinterest: 2:3 vertical (0.66)
      const pinRule = PLATFORM_MEDIA_RULES.pinterest
      expect(pinRule.aspectRatios.min).toBe(0.5)
      expect(pinRule.aspectRatios.max).toBe(1.0)

      // Pre-flight media validation
      const validIgMedia = validateMediaForNetwork(
        {
          id: 'asset-ig',
          fileName: 'hero.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: 2 * 1024 * 1024,
          aspectRatio: 0.8,
          width: 1080,
          height: 1350,
        },
        'instagram',
      )
      expect(validIgMedia.isValid).toBe(true)

      const invalidPinMedia = validateMediaForNetwork(
        {
          id: 'asset-pin',
          fileName: 'wide.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: 2 * 1024 * 1024,
          aspectRatio: 2.5, // Far too wide for Pinterest
        },
        'pinterest',
      )
      expect(invalidPinMedia.isValid).toBe(false)
      expect(invalidPinMedia.blockers.some((b) => b.includes('Aspect ratio'))).toBe(true)
    })
  })
})
