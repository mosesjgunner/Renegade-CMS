import { describe, expect, it } from 'vitest'

import {
  isCaipStyleIdentifier,
  isUuid,
  type EncryptedMessageEnvelope,
  type Event,
  type MemberID,
  type ModuleManifest,
  type PaymentMethodCapability,
  type Timeline,
} from '../../src/modules/core/contracts'

describe('shared ID contract', () => {
  it('accepts UUID identity and rejects human slugs', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isUuid('demo-publication')).toBe(false)
  })

  it('accepts canonical CAIP-style chain and account identifiers', () => {
    expect(isCaipStyleIdentifier('eip155:1')).toBe(true)
    expect(isCaipStyleIdentifier('eip155:1:0xAbCd')).toBe(true)
    expect(isCaipStyleIdentifier('ethereum-mainnet')).toBe(false)
  })

  it('keeps commerce, encryption, and module manifests explicit', () => {
    const memberId = '550e8400-e29b-41d4-a716-446655440000' as MemberID
    const paymentCapability: PaymentMethodCapability = {
      id: '550e8400-e29b-41d4-a716-446655440001' as PaymentMethodCapability['id'],
      tenantId: '550e8400-e29b-41d4-a716-446655440002' as PaymentMethodCapability['tenantId'],
      siteId: '550e8400-e29b-41d4-a716-446655440003' as PaymentMethodCapability['siteId'],
      brandId: null,
      providerKey: 'payments.example',
      railKey: 'card',
      merchantConnectionId:
        '550e8400-e29b-41d4-a716-446655440004' as PaymentMethodCapability['merchantConnectionId'],
      buyerGeographies: ['US'],
      merchantGeographies: ['US'],
      presentmentCurrencies: ['USD'],
      settlementCurrencies: ['USD'],
      minimumAmountMinor: '50',
      maximumAmountMinor: null,
      supportsOneTime: true,
      supportsRecurring: true,
      supportsRefunds: true,
      supportsDisputes: true,
      flow: 'asynchronous',
      requiredExperience: 'hosted-ui',
      availability: 'available',
      verifiedAt: '2026-08-12T00:00:00.000Z',
      verificationProvenance: 'provider-account-capability-snapshot',
    }
    const encryptedEnvelope: EncryptedMessageEnvelope = {
      version: 1,
      algorithmSuite: 'unselected',
      senderKeyFingerprint: 'sender-key-v1',
      recipientKeyFingerprints: ['recipient-key-v1'],
      ciphertext: 'base64-ciphertext',
      nonce: 'base64-nonce',
      senderWrappedContentKey: null,
      recipientWrappedContentKeys: [
        {
          recipientMemberId: memberId,
          recipientKeyFingerprint: 'recipient-key-v1',
          wrappedKey: 'wrapped-key',
        },
      ],
      signature: null,
      authenticatedData: null,
      keyRotation: { senderKeyVersion: 1, revokedKeyFingerprints: [] },
      encryptedAttachments: [],
      recovery: {
        isSupported: false,
        exportFormatVersion: 1,
        privateRecoveryKeyBoundary: 'not-available',
      },
    }
    const manifest: ModuleManifest = {
      key: 'example.module',
      version: '1.0.0',
      compatibleCore: '^0.1.0',
      compatibleSchema: '^1.0.0',
      dependencies: [],
      conflicts: [],
      provides: ['example.capability'],
      requires: [],
      configurationSchemaVersion: 1,
      permissions: [],
      healthCheck: 'module health endpoint',
      failureMode: 'degraded',
      migrationOwner: 'example.module',
      rollbackOwner: 'example.module',
      backupExportOwner: 'example.module',
      lifecycle: {
        disable: 'preserve-data',
        archive: 'retain-read-only',
        uninstall: 'refuse-with-live-data',
        retentionChoice: 'shared-policy-required',
      },
    }

    const eventContract: Event = {
      id: '550e8400-e29b-41d4-a716-446655440005' as Event['id'],
      tenantId: '550e8400-e29b-41d4-a716-446655440006' as Event['tenantId'],
      siteId: '550e8400-e29b-41d4-a716-446655440007' as Event['siteId'],
      brandId: null,
      createdAt: '2026-08-14T00:00:00.000Z',
      createdBy: null,
      updatedAt: '2026-08-14T00:00:00.000Z',
      updatedBy: null,
      correlationId: 'event-contract-fixture',
      deletedAt: null,
      deletedBy: null,
      ownerMemberId: memberId,
      calendarEntryId: null,
      title: 'Demo Open House',
      summary: 'Native structured event fixture.',
      visibility: 'public',
      status: 'published',
      allDay: false,
      startsAt: '2026-08-22T18:00:00.000Z',
      endsAt: '2026-08-22T20:00:00.000Z',
      timeZone: 'America/Chicago',
      attendanceMode: 'hybrid',
      seo: {
        title: 'Demo Open House',
        description: 'Structured event',
        canonicalURL: 'https://example.test/events/demo-open-house',
        imageAlt: null,
        keywords: ['demo'],
        focusKeyphrase: 'demo open house',
        noIndex: false,
      },
      structuredDataSource: {
        mode: 'event-derived',
        primaryType: 'Event',
        sourceCollection: 'calendar-entries',
        sourceIdentifier: '/events/demo-open-house',
        manualPayload: null,
        version: 1,
      },
      knowledgeGraphProjection: {
        status: 'pending',
        nodeKey: 'event:demo-open-house',
        canonicalStore: 'postgresql',
        projector: 'neo4j-optional',
        exportedAt: null,
      },
      importExportHooks: {
        importSourceSystem: 'fixture',
        importSourceIdentifier: 'demo-open-house',
        importSourceChecksum: null,
        exportFormatVersion: 1,
        exportOwnership: { module: 'calendar.events' },
      },
      publicRendering: {
        strategy: 'event-page',
        variant: 'default-event',
        context: { milestone: 5 },
      },
      retentionPolicy: null,
    }
    const timelineContract: Timeline = {
      id: '550e8400-e29b-41d4-a716-446655440008' as Timeline['id'],
      tenantId: '550e8400-e29b-41d4-a716-446655440009' as Timeline['tenantId'],
      siteId: '550e8400-e29b-41d4-a716-446655440010' as Timeline['siteId'],
      brandId: null,
      createdAt: '2026-08-14T00:00:00.000Z',
      createdBy: null,
      updatedAt: '2026-08-14T00:00:00.000Z',
      updatedBy: null,
      correlationId: 'timeline-contract-fixture',
      deletedAt: null,
      deletedBy: null,
      ownerMemberId: memberId,
      title: 'Demo Civic Schedule',
      summary: 'Native timeline fixture.',
      visibility: 'public',
      status: 'published',
      orderingMode: 'chronological',
      seo: {
        title: 'Demo Civic Schedule',
        description: 'Structured timeline',
        canonicalURL: 'https://example.test/timelines/demo-civic-schedule',
        imageAlt: null,
        keywords: ['timeline'],
        focusKeyphrase: 'demo civic schedule',
        noIndex: false,
      },
      structuredDataSource: {
        mode: 'timeline-derived',
        primaryType: 'ItemList',
        sourceCollection: 'timelines',
        sourceIdentifier: '/timelines/demo-civic-schedule',
        manualPayload: null,
        version: 1,
      },
      knowledgeGraphProjection: {
        status: 'pending',
        nodeKey: 'timeline:demo-civic-schedule',
        canonicalStore: 'postgresql',
        projector: 'neo4j-optional',
        exportedAt: null,
      },
      importExportHooks: {
        importSourceSystem: 'fixture',
        importSourceIdentifier: 'demo-civic-schedule',
        importSourceChecksum: null,
        exportFormatVersion: 1,
        exportOwnership: { module: 'calendar.timelines' },
      },
      publicRendering: {
        strategy: 'timeline-page',
        variant: 'default-timeline',
        context: { milestone: 5 },
      },
      presentation: {
        eventCardVariant: 'timeline-card',
        eventListVariant: 'timeline-list',
        timelineEmbedVariant: 'embeddable-timeline',
        timelineBlockVariant: 'timeline-block',
      },
      retentionPolicy: null,
    }

    expect(paymentCapability.requiredExperience).toBe('hosted-ui')
    expect(encryptedEnvelope.recovery.privateRecoveryKeyBoundary).toBe('not-available')
    expect(manifest.lifecycle.uninstall).toBe('refuse-with-live-data')
    expect(eventContract.structuredDataSource.mode).toBe('event-derived')
    expect(timelineContract.presentation.timelineEmbedVariant).toBe('embeddable-timeline')
  })
})
