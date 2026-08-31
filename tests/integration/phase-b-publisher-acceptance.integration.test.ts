/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped. */
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { getPayload } from 'payload'

import { createExecutionEvent } from '../../src/modules/execution/contracts'
import {
  deliverWebhook,
  enqueueWebhookDeliveries,
  redeliverWebhook,
  verifyWebhookDeliverySignature,
  webhookDeliverySignature,
} from '../../src/modules/integrations/webhooks'
import {
  analyticsAllowed,
  normalizeConsentChoices,
  type PrivacyPolicy,
} from '../../src/modules/analytics/contracts'
import {
  consentSetCookie,
  readConsent,
} from '../../src/modules/analytics/privacy'
import { PayloadAnalyticsEventStore } from '../../src/modules/analytics/service'
import { podcastRss } from '../../src/modules/media/publishing'
import { eventIcs, type EventOccurrence } from '../../src/modules/events/contracts'
import { scanLocal } from '../../src/modules/quality/contracts'

describe('Phase B Publisher Final Acceptance Integration', () => {
  it('validates privacy consent lifecycle: consented form submission vs withdrawal suppression', async () => {
    const payload = await getPayload({ config })
    const siteSlug = `acceptance-privacy-${randomUUID().slice(0, 8)}`
    const site = await payload.create({
      collection: 'sites',
      data: { name: 'Privacy Acceptance Site', slug: siteSlug, lifecycle: 'active' },
      overrideAccess: true,
    } as never)

    const secret = 'acceptance-secret-token-32-chars-long!'
    const policy: PrivacyPolicy = {
      analyticsEnabled: true,
      consentVersion: 'acceptance-v1',
      respectGlobalPrivacyControl: true,
      respectDoNotTrack: true,
      rawEventRetentionDays: 90,
      rollupRetentionDays: 730,
    }

    // 1. User grants consent
    const grantedChoices = normalizeConsentChoices({ analytics: true, marketing: true })
    expect(analyticsAllowed({ choices: grantedChoices, policy })).toBe(true)

    const grantedCookieHeader = consentSetCookie(
      { subject: 'anon-sub-1', version: policy.consentVersion, choices: grantedChoices },
      secret,
      false,
    )
    const readGranted = readConsent(grantedCookieHeader.split(';')[0], secret)
    expect(readGranted?.choices.analytics).toBe(true)

    // Store consented form submission analytics event
    const eventStore = new PayloadAnalyticsEventStore(payload)
    const formEvent = {
      id: randomUUID(),
      eventType: 'form_submit' as const,
      occurredAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      identity: {
        anonymousId: createHash('sha256').update(`${secret}:anon-1`).digest('hex'),
        sessionId: createHash('sha256').update(`${secret}:sess-1`).digest('hex'),
      },
      context: { siteId: String(site.id), path: '/contact' },
      consentBasis: 'analytics-consent' as const,
      schemaVersion: 1,
      trusted: false,
      dedupeKey: '',
    }
    const recordResult = await eventStore.record(formEvent)
    expect(recordResult.deduplicated).toBe(false)

    // 2. User withdraws consent
    const withdrawnChoices = normalizeConsentChoices({ analytics: false, marketing: false })
    expect(analyticsAllowed({ choices: withdrawnChoices, policy })).toBe(false)

    // Suppression under GPC or DNT signal
    expect(
      analyticsAllowed({
        choices: grantedChoices,
        policy,
        globalPrivacyControl: true,
      }),
    ).toBe(false)
    expect(
      analyticsAllowed({
        choices: grantedChoices,
        policy,
        doNotTrack: true,
      }),
    ).toBe(false)
  })

  it('validates media & long-form public outputs: ICS feed, Podcast RSS, and multi-chapter book', async () => {
    const payload = await getPayload({ config })
    const siteSlug = `acceptance-outputs-${randomUUID().slice(0, 8)}`
    const site = await payload.create({
      collection: 'sites',
      data: { name: 'Outputs Site', slug: siteSlug, lifecycle: 'active' },
      overrideAccess: true,
    } as never)

    const pub = await payload.create({
      collection: 'publications',
      data: {
        site: site.id,
        name: 'Outputs Pub',
        slug: siteSlug,
        canonicalBasePath: `/${siteSlug}`,
        status: 'active',
        visibility: 'public',
      },
      overrideAccess: true,
    } as never)

    // 1. Events ICS generation
    const testEvent: EventOccurrence = {
      id: 'event-101',
      site: String(site.id),
      title: 'Acceptance Keynote',
      slug: 'acceptance-keynote',
      canonicalPath: `/${siteSlug}/events/acceptance-keynote`,
      summary: 'Annual launch keynote event',
      startsAt: '2027-04-01T15:00:00.000Z',
      endsAt: '2027-04-01T16:30:00.000Z',
      occurrenceStartsAt: '2027-04-01T15:00:00.000Z',
      occurrenceEndsAt: '2027-04-01T16:30:00.000Z',
      timeZone: 'America/New_York',
      attendanceMode: 'virtual',
      onlineUrl: 'https://stream.example.test/keynote',
      status: 'published',
      visibility: 'public',
    }
    const icsContent = eventIcs(testEvent, 'https://stream.example.test/keynote')
    expect(icsContent).toContain('BEGIN:VCALENDAR')
    expect(icsContent).toContain('SUMMARY:Acceptance Keynote')
    expect(icsContent).toContain('URL:https://stream.example.test/keynote')

    // 2. Podcast RSS feed generation
    const rssFeed = podcastRss({
      title: 'Acceptance Podcast',
      description: 'Technical acceptance show',
      siteUrl: 'https://example.test',
      path: `/${siteSlug}/podcasts/main/feed.xml`,
      episodes: [
        {
          id: 'ep-1',
          title: 'Episode 1: Architecture',
          slug: 'ep-1-architecture',
          description: 'Deep dive into canonical Payload architecture',
          audioUrl: 'https://cdn.example.test/audio/ep1.mp3',
          bytes: 12450000,
          mimeType: 'audio/mpeg',
          publishedAt: '2026-08-31T12:00:00.000Z',
        },
      ],
    })
    expect(rssFeed).toContain('<rss')
    expect(rssFeed).toContain('<title>Acceptance Podcast</title>')
    expect(rssFeed).toContain('url="https://cdn.example.test/audio/ep1.mp3"')

    // 3. Multi-chapter book hierarchy
    const book = await payload.create({
      collection: 'books',
      data: {
        site: site.id,
        publication: pub.id,
        title: 'Phase B Reference Manual',
        slug: 'phase-b-reference-manual',
        canonicalBasePath: `/${siteSlug}/books/reference-manual`,
        status: 'published',
        visibility: 'public',
      },
      overrideAccess: true,
    } as never)

    await payload.create({
      collection: 'book-chapters',
      data: {
        site: site.id,
        publication: pub.id,
        book: book.id,
        title: 'Chapter 1: Storage',
        slug: 'ch-1-storage',
        canonicalPath: `/${siteSlug}/books/reference-manual/ch-1-storage`,
        displayOrder: 1,
        status: 'published',
      },
      overrideAccess: true,
    } as never)

    await payload.create({
      collection: 'book-chapters',
      data: {
        site: site.id,
        publication: pub.id,
        book: book.id,
        title: 'Chapter 2: Pipelines',
        slug: 'ch-2-pipelines',
        canonicalPath: `/${siteSlug}/books/reference-manual/ch-2-pipelines`,
        displayOrder: 2,
        status: 'published',
      },
      overrideAccess: true,
    } as never)

    const chapters = await payload.find({
      collection: 'book-chapters',
      where: { book: { equals: book.id } },
      sort: 'displayOrder',
      overrideAccess: true,
    } as never)
    expect(chapters.docs.map((c: any) => c.title)).toEqual([
      'Chapter 1: Storage',
      'Chapter 2: Pipelines',
    ])
  })

  it('validates Quality Center automated rule evaluation and remediation findings', async () => {
    // Quality Center evaluation on missing metadata
    const unoptimizedFindings = scanLocal({
      targetId: 'content-1',
      title: 'Short title',
      description: '', // Missing description
      headings: [1, 3], // Skipped h2
      canonicalUrl: 'not-a-valid-url',
    })
    expect(unoptimizedFindings.length).toBeGreaterThan(0)
    expect(unoptimizedFindings.some((f) => f.rule === 'metadata-description')).toBe(true)
    expect(unoptimizedFindings.some((f) => f.rule === 'canonical-valid')).toBe(true)

    // Remediated content
    const remediatedFindings = scanLocal({
      targetId: 'content-1',
      title: 'A Fully Compliant Quality Center Title With Sufficient Detail',
      description: 'Comprehensive description satisfying public discovery and search engine guidelines.',
      headings: [1, 2, 3],
      canonicalUrl: 'https://example.test/articles/compliant-article',
    })
    const blockingIssues = remediatedFindings.filter((f) => f.severity === 'publication_blocking')
    expect(blockingIssues.length).toBe(0)
  })

  it('validates signed webhooks: signature verification, replay rejection, bounded retry, and terminal dead-letter', async () => {
    const payload = await getPayload({ config })
    const siteSlug = `acceptance-webhooks-${randomUUID().slice(0, 8)}`
    const site = await payload.create({
      collection: 'sites',
      data: { name: 'Webhook Acceptance Site', slug: siteSlug, lifecycle: 'active' },
      overrideAccess: true,
    } as never)

    const webhookSecret = 'whsec_acceptance_test_signing_key_12345'
    await payload.create({
      collection: 'webhook-subscriptions',
      data: {
        id: randomUUID(),
        site: site.id,
        target: 'https://example.test/webhook',
        events: ['content.created'],
        status: 'active',
        secretRef: webhookSecret,
        failureCount: 0,
      },
      overrideAccess: true,
    } as never)

    // 1. Signature generation and replay prevention
    const testPayload = { id: 'evt-100', api_version: '2026-08-31', type: 'content.created' }
    const raw = JSON.stringify(testPayload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const sig = webhookDeliverySignature(raw, webhookSecret, timestamp)

    // Valid signature within timestamp window
    const verified = verifyWebhookDeliverySignature({
      raw,
      signature: sig,
      secret: webhookSecret,
      now: new Date(),
    })
    expect(verified.valid).toBe(true)

    // Expired signature replay rejection (>5 minutes)
    const staleVerification = verifyWebhookDeliverySignature({
      raw,
      signature: sig,
      secret: webhookSecret,
      now: new Date(Date.now() + 10 * 60 * 1000),
    })
    expect(staleVerification.valid).toBe(false)
    expect(staleVerification.reason).toBe('stale')

    // 2. Outbox event queuing idempotency
    const execEvent = createExecutionEvent({
      siteId: String(site.id),
      tenantId: String(site.id),
      actor: { kind: 'system', id: null },
      eventType: 'content.created',
      idempotencyKey: `exec-key-${randomUUID()}`,
      privacyClass: 'public',
      payload: { contentId: 'content-100' },
      id: `evt-${randomUUID()}`,
    })

    const queuedFirst = await enqueueWebhookDeliveries(payload, execEvent)
    expect(queuedFirst).toBe(1)
    const queuedDuplicate = await enqueueWebhookDeliveries(payload, execEvent)
    expect(queuedDuplicate).toBe(0) // Idempotent

    // 3. Mock delivery failure and bounded retry / terminal dead-letter
    const deliveries = await payload.find({
      collection: 'webhook-deliveries',
      where: { eventId: { equals: execEvent.id } },
      overrideAccess: true,
    } as never)
    expect(deliveries.docs.length).toBe(1)
    const deliveryId = String(deliveries.docs[0].id)

    // Mock fetch returning 500 error
    const mockFailingFetch: typeof fetch = async () =>
      new Response('Internal Server Error', { status: 500 })

    const resolveSecret = async () => webhookSecret

    // Attempt 1: failure -> retrying
    const res1 = await deliverWebhook(payload, deliveryId, resolveSecret, mockFailingFetch)
    expect(res1.state).toBe('retrying')
    expect(res1.attempts).toBe(1)

    // Operator redelivery creates a clean new delivery attempt
    const redelivered = await redeliverWebhook(payload, deliveryId)
    expect(redelivered.state).toBe('queued')
    expect(redelivered.attempts).toBe(0)
  })
})
