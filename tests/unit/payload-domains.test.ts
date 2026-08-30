import { describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/modules/core/config'
import { composePayloadDomains } from '../../src/modules/core/payload-domains'
import { registeredPayloadDomains } from '../../src/modules/payload-domains'

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/renegade_test',
  PAYLOAD_SECRET: 'a-valid-test-value-with-more-than-32-characters',
  APP_URL: 'http://localhost:3000',
  NETWORKING_ENABLED: 'true',
})

const expectedCollections =
  `users sites page-layouts api-clients webhook-subscriptions webhook-deliveries integration-audit-events brands members linked-identities member-sessions identity-tokens member-recovery-codes identity-audit-events profiles spaces authors publications relationships team-memberships team-invitations team-audit-events editorial-assignments editorial-discussions editorial-comments work-conversations work-messages media-assets sections categories topics tags series taxonomy-redirects content article-family-content markdown-conversion-reports revision-records preview-tokens scheduled-publish-jobs content-releases events timelines timeline-memberships sources albums media-usages books book-parts book-chapters book-editions podcast-shows podcast-seasons podcast-episodes video-channels video-playlists videos interviews livestreams transcript-revisions media-jobs tts-outputs graphic-documents media-derivatives edit-sessions quick-capture-drafts social-accounts social-drafts social-network-variants social-queue-items social-publish-attempts external-posts campaigns calendar-entry-audits forum-sections forums discussions discussion-posts calendar-entries network-signing-keys remote-instances remote-actors remote-objects network-relationships inbound-network-activities outbound-network-deliveries network-delivery-attempts network-access-decisions network-audit-events form-definitions form-schemas form-submissions submission-attachments contacts organizations relationship-records contact-tags contact-taggings interaction-records relationship-notes deals-opportunities owner-assignments next-actions workflow-items audience-lists audience-segments audience-memberships subscriber-confirmation-tokens subscribers consent-events preferences suppressions email-messages delivery-identities email-deliveries activity-events notifications notification-preferences notification-channels digest-definitions digest-runs delivery-receipts automation-definitions analytics-events analytics-rollups metric-snapshots analytics-goals command-center-preferences experience-rules experience-variants experiments experiment-variants traffic-allocations experiment-assignments conversion-goals experiment-events experiment-analyses experiment-decisions quality-policies quality-rules quality-scans quality-issues quality-exceptions quality-waivers quality-reports merchant-connections payment-method-capabilities products carts checkout-sessions payment-intents orders payment-webhook-events supporters entitlements`.split(
    ' ',
  )

describe('Payload domain registration', () => {
  it('registers every existing collection, global, and task exactly once', () => {
    const registrations = registeredPayloadDomains(config)

    expect(registrations.collections.map(({ slug }) => slug)).toEqual(expectedCollections)
    expect(registrations.globals.map(({ slug }) => slug)).toEqual([
      'site-settings',
      'network-settings',
    ])
    expect(registrations.tasks.map(({ slug }) => slug).sort()).toEqual(
      [
        'operations-heartbeat',
        'operations-forced-failure',
        'editorial-publish',
        'content-release-execute',
        'quality-scan',
        'media-import',
        'media-render',
        'media-transcribe',
        'media-tts',
        'network-delivery',
        'social-publish',
        'audience-email-delivery',
        'audience-newsletter-dispatch',
        'commerce-abandon-checkouts',
      ].sort(),
    )
  })

  it('fails deterministically for duplicate IDs and slugs', () => {
    expect(() =>
      composePayloadDomains([
        { id: 'core', collections: [{ slug: 'sites' } as never] },
        { id: 'core', globals: [{ slug: 'settings' } as never] },
      ]),
    ).toThrow('Duplicate payload domain ID: core')
    expect(() =>
      composePayloadDomains([
        { id: 'one', collections: [{ slug: 'sites' } as never] },
        { id: 'two', collections: [{ slug: 'sites' } as never] },
      ]),
    ).toThrow('Duplicate collection slug: sites')
    expect(() =>
      composePayloadDomains([
        { id: 'one', globals: [{ slug: 'settings' } as never] },
        { id: 'two', globals: [{ slug: 'settings' } as never] },
      ]),
    ).toThrow('Duplicate global slug: settings')
    expect(() =>
      composePayloadDomains([
        { id: 'one', tasks: [{ slug: 'sync' } as never] },
        { id: 'two', tasks: [{ slug: 'sync' } as never] },
      ]),
    ).toThrow('Duplicate task slug: sync')
  })

  it('rejects empty domain IDs and definitions', () => {
    expect(() =>
      composePayloadDomains([{ id: '', collections: [{ slug: 'sites' } as never] }]),
    ).toThrow('Payload domain ID must not be empty')
    expect(() => composePayloadDomains([{ id: 'empty' }])).toThrow(
      'Payload domain "empty" has no registrations',
    )
  })
})
