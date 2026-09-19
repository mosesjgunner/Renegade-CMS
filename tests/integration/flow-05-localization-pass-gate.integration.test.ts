import { beforeAll, describe, expect, it, vi } from 'vitest'

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}))

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getPayload: vi.fn().mockResolvedValue({
      auth: mockAuth,
    }),
  }
})

import {
  GET as getTranslations,
  POST as postTranslations,
} from '../../src/app/(frontend)/api/admin/translations/route'
import {
  GET as getNotifications,
  POST as postNotifications,
} from '../../src/app/(frontend)/api/admin/notifications/route'
import {
  GET as getWebhooks,
  POST as postWebhooks,
} from '../../src/app/(frontend)/api/admin/webhooks/route'
import {
  evaluateLocalizationQualityPolicy,
  evaluateTranslationCompleteness,
  computeHreflangAlternates,
  LocalizationEngine,
  SimulatedTranslationProviderAdapter,
  validateWebhookUrl,
  verifyWebhookSignature,
} from '../../src/modules/editorial/localization'
import { evaluateReleaseGates } from '../../src/modules/releases/gates'

describe('FLOW-05 Localization & Quality Pass Gate — Integration & API Suite', () => {
  beforeAll(async () => {
    mockAuth.mockResolvedValue({ user: null })
  })

  it('1. Rejects unauthorized access and supports Translation API lifecycle', async () => {
    // Test unauthenticated request
    const unauthReq = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-group' }),
    })
    const unauthRes = await postTranslations(unauthReq)
    expect(unauthRes.status).toBe(403)

    // Authenticated creation of group via API
    const authReq = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-group',
        sourceDocument: {
          id: 'art-int-01',
          locale: 'en',
          title: 'Decentralized Architecture',
          slug: 'decentralized-architecture',
          canonicalPath: '/en/articles/decentralized-architecture',
          canonicalUrl: 'https://renegadeparty.org/en/articles/decentralized-architecture',
          summary: 'A deep dive into distributed resilience.',
          revisionSequence: 1,
          revisionHash: 'hash-int-1',
          status: 'published',
        },
      }),
    })

    // Mock auth for route testing
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })

    const createRes = await postTranslations(authReq)
    expect(createRes.status).toBe(200)
    const createData = await createRes.json()
    expect(createData.success).toBe(true)
    expect(createData.group.id).toBeDefined()
    const groupId = createData.group.id

    // Request translation to Spanish
    const reqTranslation = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'request-translation',
        groupId,
        targetLocale: 'es',
        translatorId: 'translator-test',
        reviewerId: 'reviewer-test',
        dueDate: '2026-11-01T00:00:00Z',
      }),
    })
    const reqRes = await postTranslations(reqTranslation)
    expect(reqRes.status).toBe(200)
    const reqData = await reqRes.json()
    expect(reqData.success).toBe(true)
    const requestId = reqData.request.id

    // Generate draft via provider
    const draftReq = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'draft-provider',
        requestId,
      }),
    })
    const draftRes = await postTranslations(draftReq)
    expect(draftRes.status).toBe(200)
    const draftData = await draftRes.json()
    expect(draftData.success).toBe(true)
    expect(draftData.request.attribution.isMachineDraft).toBe(true)

    // Advance source document
    const advReq = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'advance-source',
        groupId,
        updates: {
          title: 'Decentralized Architecture v2',
          newRevisionSequence: 2,
          newRevisionHash: 'hash-int-2',
        },
      }),
    })
    const advRes = await postTranslations(advReq)
    const advData = await advRes.json()
    expect(advData.staleRequestsCount).toBe(1)

    // Attempting to approve while stale must fail
    const approveStaleReq = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        requestId,
      }),
    })
    const approveStaleRes = await postTranslations(approveStaleReq)
    expect(approveStaleRes.status).toBe(500)
    const approveStaleData = await approveStaleRes.json()
    expect(approveStaleData.error).toContain('CANNOT_APPROVE_STALE')

    // Realign pin
    const realignReq = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'realign-pin',
        requestId,
      }),
    })
    const realignRes = await postTranslations(realignReq)
    expect(realignRes.status).toBe(200)

    // Approve translation
    const approveReq = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        requestId,
      }),
    })
    const approveRes = await postTranslations(approveReq)
    expect(approveRes.status).toBe(200)

    // Publish locale variant
    const pubReq = new Request('https://renegadeparty.org/api/admin/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'publish',
        groupId,
        locale: 'es',
        siteBaseUrl: 'https://renegadeparty.org',
      }),
    })
    const pubRes = await postTranslations(pubReq)
    expect(pubRes.status).toBe(200)
    const pubData = await pubRes.json()
    expect(pubData.success).toBe(true)
    expect(pubData.variant.status).toBe('published')
    expect(pubData.hreflang.alternateLocales['es']).toBeDefined()
    expect(pubData.hreflang.alternateLocales['en']).toBeDefined()

  })

  it('2. Tests notification preferences and durable outbox processing API', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })

    // Update notification preferences
    const updatePrefReq = new Request('https://renegadeparty.org/api/admin/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update-preferences',
        preferences: {
          enabledChannels: { in_app: true, email: true, webhook: false },
          mutedEvents: ['mention_comment'],
          emailAddress: 'admin@renegadeparty.org',
        },
      }),
    })
    const prefRes = await postNotifications(updatePrefReq)
    expect(prefRes.status).toBe(200)

    // Query in-app notifications
    const getNotifReq = new Request('https://renegadeparty.org/api/admin/notifications', {
      method: 'GET',
    })
    const getRes = await getNotifications(getNotifReq)
    expect(getRes.status).toBe(200)
    const notifData = await getRes.json()
    expect(notifData.userId).toBe('admin-1')
    expect(notifData.preferences.enabledChannels.email).toBe(true)

    // Process outbox
    const processReq = new Request('https://renegadeparty.org/api/admin/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'process-outbox' }),
    })
    const processRes = await postNotifications(processReq)
    expect(processRes.status).toBe(200)
  })

  it('3. Tests webhook subscription registration, secret rotation, and SSRF guard via API', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })

    // SSRF rejection on localhost
    const ssrfReq = new Request('https://renegadeparty.org/api/admin/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        subscription: {
          id: 'sub-ssrf',
          name: 'Dangerous Hook',
          targetUrl: 'http://127.0.0.1:3000/steal',
          primarySecret: 'sec',
          eventTypes: ['approval'],
          isActive: true,
        },
      }),
    })
    const ssrfRes = await postWebhooks(ssrfReq)
    expect(ssrfRes.status).toBe(400)
    const ssrfData = await ssrfRes.json()
    expect(ssrfData.error).toContain('SSRF_ERROR')

    // Valid registration
    const regReq = new Request('https://renegadeparty.org/api/admin/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        subscription: {
          id: 'sub-valid',
          name: 'Production Translation Hook',
          targetUrl: 'https://partners.renegadeparty.org/webhook',
          primarySecret: 'initial-secret-12345',
          eventTypes: ['approval', 'completion'],
          isActive: true,
        },
      }),
    })
    const regRes = await postWebhooks(regReq)
    expect(regRes.status).toBe(200)

    // Rotate secret
    const rotateReq = new Request('https://renegadeparty.org/api/admin/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'rotate-secret',
        subscriptionId: 'sub-valid',
        newSecret: 'rotated-secret-67890',
      }),
    })
    const rotateRes = await postWebhooks(rotateReq)
    expect(rotateRes.status).toBe(200)
    const rotateData = await rotateRes.json()
    expect(rotateData.subscription.primarySecret).toBe('rotated-secret-67890')
    expect(rotateData.subscription.secondarySecret).toBe('initial-secret-12345')

    // Test dispatch
    const testDispatchReq = new Request('https://renegadeparty.org/api/admin/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test-dispatch',
        eventType: 'approval',
        eventData: { test: true },
      }),
    })
    const testDispatchRes = await postWebhooks(testDispatchReq)
    expect(testDispatchRes.status).toBe(200)
    const dispatchData = await testDispatchRes.json()
    expect(dispatchData.success).toBe(true)
    expect(dispatchData.dispatchedCount).toBe(1)

    // Verify delivery logs
    const getLogsReq = new Request('https://renegadeparty.org/api/admin/webhooks?webhookId=sub-valid', {
      method: 'GET',
    })
    const getLogsRes = await getWebhooks(getLogsReq)
    expect(getLogsRes.status).toBe(200)
    const logsData = await getLogsRes.json()
    expect(logsData.logs.length).toBeGreaterThanOrEqual(1)
    expect(logsData.logs[0].status).toBe('success')
  })
})
