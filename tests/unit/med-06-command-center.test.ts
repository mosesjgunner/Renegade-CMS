import { describe, expect, it } from 'vitest'
import {
  checkStorageHealth,
  evaluateHonestState,
  sanitizeStorageTarget,
} from '../../src/modules/media/command-center'
import type { AppConfig } from '../../src/modules/core/config'
import { validatePodcastFeed } from '../../src/modules/media/publishing'
import { validateWebVtt } from '../../src/modules/media/video'

describe('MED-06 Media Command Center — Unit Suite', () => {
  describe('1. Storage adapter telemetry & secret sanitization', () => {
    it('sanitizes S3 storage target without leaking secrets or credentials', () => {
      const mockConfig = {
        storage: {
          driver: 's3',
          mediaDir: '/app/media',
          s3: {
            bucket: 'my-production-bucket',
            region: 'eu-west-1',
            endpoint: 'https://s3.eu-west-1.amazonaws.com',
            accessKeyId: 'AKIA_SUPER_SECRET_KEY_ID',
            secretAccessKey: 'VERY_SECRET_KEY_THAT_MUST_NEVER_LEAK',
          },
        },
      } as unknown as AppConfig

      const target = sanitizeStorageTarget(mockConfig)
      expect(target).toContain('my-production-bucket')
      expect(target).toContain('eu-west-1')
      expect(target).toContain('s3.eu-west-1.amazonaws.com')
      expect(target).not.toContain('AKIA_SUPER_SECRET_KEY_ID')
      expect(target).not.toContain('VERY_SECRET_KEY_THAT_MUST_NEVER_LEAK')
    })

    it('sanitizes local storage target to safe representation', () => {
      const mockConfig = {
        storage: {
          driver: 'local',
          mediaDir: '/var/lib/renegade/private-media',
        },
      } as unknown as AppConfig

      const target = sanitizeStorageTarget(mockConfig)
      expect(target).toBe('local:[media-root]')
      expect(target).not.toContain('/var/lib/renegade/private-media')
    })

    it('probes local storage health and reports capabilities', async () => {
      const mockConfig = {
        storage: {
          driver: 'local',
          mediaDir: './scratch/test-storage',
        },
      } as unknown as AppConfig

      const report = await checkStorageHealth(mockConfig)
      expect(report.driver).toBe('local')
      expect(report.capabilities.atomicWrite).toBe(true)
      expect(report.capabilities.privateObjects).toBe(true)
      expect(report.capabilities.checksumAddressed).toBe(true)
      expect(report.capabilities.rangeRequests).toBe(true)
      expect(['healthy', 'degraded']).toContain(report.status)
    })
  })

  describe('2. Honest Media States evaluation', () => {
    it('evaluates archived state when tombstoned or lifecycle archived', () => {
      const tombstoned = evaluateHonestState(
        { retentionMode: 'tombstone', kind: 'image' },
        { usagesCount: 0 },
      )
      expect(tombstoned).toBe('archived')

      const archived = evaluateHonestState(
        { lifecycle: 'archived', kind: 'image' },
        { usagesCount: 0 },
      )
      expect(archived).toBe('archived')
    })

    it('evaluates failed state on processing failure or failed job', () => {
      const assetFailed = evaluateHonestState(
        { processingState: 'failed', kind: 'image' },
        { usagesCount: 1 },
      )
      expect(assetFailed).toBe('failed')

      const jobFailed = evaluateHonestState(
        { processingState: 'ready', kind: 'image' },
        { usagesCount: 1, hasFailedJob: true },
      )
      expect(jobFailed).toBe('failed')
    })

    it('evaluates blocked state on expired rights, embargo, or restricted status', () => {
      const expired = evaluateHonestState(
        { kind: 'image', processingState: 'ready' },
        { usagesCount: 1, isExpired: true },
      )
      expect(expired).toBe('blocked')

      const embargoed = evaluateHonestState(
        { kind: 'image', processingState: 'ready' },
        { usagesCount: 1, isEmbargoed: true },
      )
      expect(embargoed).toBe('blocked')

      const restricted = evaluateHonestState(
        { kind: 'image', rightsStatus: 'restricted' },
        { usagesCount: 1 },
      )
      expect(restricted).toBe('blocked')
    })

    it('evaluates processing state when background job is running', () => {
      const processing = evaluateHonestState(
        { kind: 'image', processingState: 'processing' },
        { usagesCount: 1 },
      )
      expect(processing).toBe('processing')

      const activeJob = evaluateHonestState(
        { kind: 'image', processingState: 'uploaded' },
        { usagesCount: 1, hasActiveJob: true },
      )
      expect(activeJob).toBe('processing')
    })

    it('evaluates verifying and uploaded states correctly', () => {
      const verifying = evaluateHonestState(
        { kind: 'image', processingState: 'verifying' },
        { usagesCount: 0 },
      )
      expect(verifying).toBe('verifying')

      const uploaded = evaluateHonestState(
        { kind: 'image', processingState: 'uploaded' },
        { usagesCount: 0 },
      )
      expect(uploaded).toBe('uploaded')
    })

    it('evaluates degraded state when image lacks alt text or creator credit', () => {
      const missingAlt = evaluateHonestState(
        {
          kind: 'image',
          processingState: 'ready',
          altText: '',
          creatorCredit: 'Jane Doe',
          variants: [{ id: '1' }],
        },
        { usagesCount: 1, hasVariants: true },
      )
      expect(missingAlt).toBe('degraded')

      const missingCredit = evaluateHonestState(
        {
          kind: 'image',
          processingState: 'ready',
          altText: 'A landscape view',
          creatorCredit: '',
          variants: [{ id: '1' }],
        },
        { usagesCount: 1, hasVariants: true },
      )
      expect(missingCredit).toBe('degraded')
    })

    it('evaluates ready state when asset has full variants, credit, alt, and valid rights', () => {
      const ready = evaluateHonestState(
        {
          kind: 'image',
          processingState: 'ready',
          altText: 'Hero banner photo',
          creatorCredit: 'Photographer Name',
          variants: [{ id: 'v1' }, { id: 'v2' }],
        },
        { usagesCount: 2, hasVariants: true },
      )
      expect(ready).toBe('ready')
    })
  })

  describe('3. Podcast feed health & Episode deliverability validation', () => {
    it('validates compliant podcast feed XML with enclosure length and type', () => {
      const compliantFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Renegade Podcast</title>
    <item>
      <title>Episode 1</title>
      <enclosure url="https://renegade.local/media/123" length="1048576" type="audio/mpeg" />
    </item>
  </channel>
</rss>`

      const result = validatePodcastFeed(compliantFeed)
      expect(result.valid).toBe(true)
      expect(result.enclosureLength).toBe(1048576)
      expect(result.enclosureType).toBe('audio/mpeg')
    })

    it('fails non-compliant feeds lacking XML declaration or enclosure metadata', () => {
      const invalidFeed = `<rss><channel><title>No XML Header</title></channel></rss>`
      expect(() => validatePodcastFeed(invalidFeed)).toThrow(/Missing XML declaration/)

      const missingEnclosure = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Show</title><item><title>Ep</title></item></channel></rss>`
      expect(() => validatePodcastFeed(missingEnclosure)).toThrow(/enclosure/)
    })
  })

  describe('4. Small-video processing contracts & caption validation', () => {
    it('validates WebVTT captions with cues and rejects unsafe markup', () => {
      const validVtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Welcome to the Renegade presentation.

00:00:04.500 --> 00:00:08.000
Decentralized media built on canonical truth.`

      const encoder = new TextEncoder()
      const validBytes = encoder.encode(validVtt)
      const result = validateWebVtt(validBytes)
      expect(result.cueCount).toBe(2)
      expect(result.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)

      // Unsafe markup rejected
      const unsafeVtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<script>alert("xss")</script>`
      expect(() => validateWebVtt(encoder.encode(unsafeVtt))).toThrow(/unsafe markup/)

      // Invalid header rejected
      const notVtt = `NOT_WEBVTT\n00:00:01.000 --> 00:00:04.000\nHello`
      expect(() => validateWebVtt(encoder.encode(notVtt))).toThrow(/Captions must be valid WebVTT/)
    })
  })
})
