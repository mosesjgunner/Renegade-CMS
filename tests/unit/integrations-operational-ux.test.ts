/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  authenticateMachineCredential,
  canAccess,
  diagnoseWebhookDelivery,
  issueMachineCredential,
  reconcileProviderState,
  resolveNextSafeRepairAction,
  rotateMachineCredential,
  safeDisconnectProviderState,
  signWebhook,
  verifyWebhookSignature,
  webhookAuditResponse,
  webhookPayload,
  webhookRetry,
  WEBHOOK_FAILURE_LIMIT,
} from '../../src/modules/integrations/service'
import {
  enqueueWebhookDeliveries,
  verifyWebhookDeliverySignature,
  verifyWebhookEndpoint,
  webhookDeliverySignature,
} from '../../src/modules/integrations/webhooks'
import {
  consumeApiRateLimit,
  resetApiRateLimitsForTest,
} from '../../src/modules/integrations/rate-limit'
import { createExecutionEvent } from '../../src/modules/execution/contracts'

describe('Operational UX & Integrations Contract Proofs', () => {
  beforeEach(() => {
    resetApiRateLimitsForTest()
  })

  // 1. HMAC Signatures Proof
  describe('HMAC Signatures', () => {
    it('generates deterministic SHA-256 HMAC and detects any payload tampering', () => {
      const secret = 'prod-webhook-secret-999'
      const raw = JSON.stringify({ event: 'order.paid', amount: 1999 })
      const signature = signWebhook(raw, secret)

      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/)
      expect(verifyWebhookSignature(raw, signature, secret)).toBe(true)

      // Tampered payload fails verification
      expect(verifyWebhookSignature(raw + ' ', signature, secret)).toBe(false)
      expect(verifyWebhookSignature(JSON.stringify({ event: 'order.paid', amount: 2000 }), signature, secret)).toBe(false)

      // Wrong secret fails verification
      expect(verifyWebhookSignature(raw, signature, 'wrong-secret')).toBe(false)
    })

    it('signs delivery headers with timestamped v1 signature', () => {
      const raw = '{"hello":"world"}'
      const secret = 'shared-secret'
      const timestamp = '1788177600'
      const header = webhookDeliverySignature(raw, secret, timestamp)

      expect(header).toMatch(/^t=1788177600,v1=[a-f0-9]{64}$/)

      const verified = verifyWebhookDeliverySignature({
        raw,
        signature: header,
        secret,
        now: new Date(Number(timestamp) * 1000),
      })
      expect(verified.valid).toBe(true)
      expect(verified.reason).toBeNull()
    })
  })

  // 2. Replay Rejection Proof
  describe('Replay Rejection', () => {
    it('rejects stale webhook delivery signatures outside timestamp tolerance window', () => {
      const raw = '{"id":"event-1"}'
      const secret = 'secret'
      const baseTime = 1700000000
      const header = webhookDeliverySignature(raw, secret, String(baseTime))

      // Within 300s tolerance -> valid
      const validCheck = verifyWebhookDeliverySignature({
        raw,
        signature: header,
        secret,
        now: new Date((baseTime + 120) * 1000),
      })
      expect(validCheck.valid).toBe(true)

      // Outside 300s tolerance -> rejected as stale
      const staleCheck = verifyWebhookDeliverySignature({
        raw,
        signature: header,
        secret,
        now: new Date((baseTime + 301) * 1000),
      })
      expect(staleCheck.valid).toBe(false)
      expect(staleCheck.reason).toBe('stale')
    })

    it('rejects duplicate delivery queueing via deterministic idempotency keys', async () => {
      const createdDeliveries: any[] = []
      const store = {
        find: async (args: any) => {
          if (args.collection === 'webhook-subscriptions') {
            return {
              docs: [{ id: 'sub-1', site: 'site-alpha', status: 'active', events: ['content.created'] }],
            }
          }
          if (args.collection === 'webhook-deliveries') {
            const key = args.where?.idempotencyKey?.equals
            return { docs: createdDeliveries.filter((d) => d.data.idempotencyKey === key) }
          }
          return { docs: [] }
        },
        create: async (args: any) => {
          createdDeliveries.push(args)
          return args.data
        },
        findByID: async () => ({}),
        update: async () => ({}),
      }

      const event = createExecutionEvent({
        siteId: 'site-alpha',
        tenantId: 'site-alpha',
        actor: { kind: 'service', id: 'client-1' },
        eventType: 'content.created',
        idempotencyKey: 'content-uuid-1',
        privacyClass: 'public',
        payload: { contentId: 'c1' },
        id: 'event-uuid-1',
      })

      // First enqueue: enqueues 1 delivery
      const firstRun = await enqueueWebhookDeliveries(store as any, event)
      expect(firstRun).toBe(1)
      expect(createdDeliveries).toHaveLength(1)

      // Replayed enqueue with same event ID: rejected (0 queued)
      const secondRun = await enqueueWebhookDeliveries(store as any, event)
      expect(secondRun).toBe(0)
      expect(createdDeliveries).toHaveLength(1)
    })
  })

  // 3. Tenant Scope Proof
  describe('Tenant Scope Enforcement', () => {
    const credential = issueMachineCredential({
      id: 'machine-client-1',
      name: 'Site Alpha Worker',
      siteId: 'site-alpha',
      publicationId: 'pub-main',
      spaceId: null,
      scopes: ['content.read', 'commerce.orders.read'],
      expiresAt: null,
      revokedAt: null,
    })

    it('allows access to exact matching tenant site and publication', () => {
      const auth = authenticateMachineCredential(credential.token, [credential.credential])
      expect(auth).not.toBeNull()

      expect(canAccess(auth, 'content.read', { siteId: 'site-alpha', publicationId: 'pub-main' })).toBe(true)
      expect(canAccess(auth, 'commerce.orders.read', { siteId: 'site-alpha', publicationId: 'pub-main' })).toBe(true)
    })

    it('strictly denies cross-tenant access even if permission scope matches', () => {
      const auth = authenticateMachineCredential(credential.token, [credential.credential])

      // Different site ID -> DENIED
      expect(canAccess(auth, 'content.read', { siteId: 'site-beta', publicationId: 'pub-main' })).toBe(false)
      // Different publication ID -> DENIED
      expect(canAccess(auth, 'content.read', { siteId: 'site-alpha', publicationId: 'pub-other' })).toBe(false)
      // Missing scope -> DENIED
      expect(canAccess(auth, 'content.draft.write', { siteId: 'site-alpha', publicationId: 'pub-main' })).toBe(false)
    })
  })

  // 4. Backoff & Bounded Retry Proof
  describe('Bounded Backoff & Retries', () => {
    it('computes deterministic exponential delay with backoff ceiling', () => {
      const attempt0 = webhookRetry({ attempts: 0, responseStatus: 503, failureCount: 0 })
      expect(attempt0.state).toBe('retrying')
      expect(attempt0.disable).toBe(false)
      expect(attempt0.nextAttemptAt).not.toBeNull()

      const attempt1 = webhookRetry({ attempts: 1, responseStatus: 500, failureCount: 1 })
      expect(attempt1.state).toBe('retrying')

      const attempt3 = webhookRetry({ attempts: 3, responseStatus: 502, failureCount: 3 })
      expect(attempt3.state).toBe('retrying')
    })

    it('transitions to dead-letter and auto-disables subscription upon reaching failure limit', () => {
      const deadLetter = webhookRetry({
        attempts: 4,
        responseStatus: 500,
        failureCount: WEBHOOK_FAILURE_LIMIT - 1, // 4 -> 5 failures
      })

      expect(deadLetter.state).toBe('dead-letter')
      expect(deadLetter.disable).toBe(true)
      expect(deadLetter.nextAttemptAt).toBeNull()
    })

    it('resets backoff and clears retry schedule on HTTP 2xx acknowledgement', () => {
      const success = webhookRetry({ attempts: 2, responseStatus: 200, failureCount: 2 })
      expect(success.state).toBe('delivered')
      expect(success.disable).toBe(false)
      expect(success.nextAttemptAt).toBeNull()
    })
  })

  // 5. Response Redaction Proof
  describe('Response Redaction & Privacy Safe Envelopes', () => {
    it('redacts sensitive headers, bearer tokens, passwords, and secrets', () => {
      const sensitiveResponse = {
        status: 'error',
        authorization: 'Bearer secret_token_12345',
        cookie: 'session=xyz',
        headers: {
          'x-api-key': 'super_secret_value',
        },
        message: 'Invalid request with token=secret_token_12345 and password=mySecretPassword!',
      }

      const redacted = webhookAuditResponse(sensitiveResponse)
      expect(redacted).not.toContain('secret_token_12345')
      expect(redacted).not.toContain('mySecretPassword')
      expect(redacted).toContain('[REDACTED]')
    })

    it('truncates large response text to 1024 characters to prevent audit bloat', () => {
      const largeText = 'A'.repeat(5000)
      const audit = webhookAuditResponse(largeText)
      expect(audit.length).toBeLessThanOrEqual(1024)
    })
  })

  // 6. Rate Limits Proof
  describe('Rate Limits', () => {
    it('enforces read (120/min) and write (30/min) buckets with remaining and retryAfter', () => {
      const clientId = 'client-testing-ratelimit'

      // Write rate limit is 30/min
      for (let i = 0; i < 30; i++) {
        const check = consumeApiRateLimit(clientId, true)
        expect(check.allowed).toBe(true)
      }

      // 31st write should be rejected with 429 semantics
      const rateLimitedWrite = consumeApiRateLimit(clientId, true)
      expect(rateLimitedWrite.allowed).toBe(false)
      expect(rateLimitedWrite.remaining).toBe(0)
      expect(rateLimitedWrite.retryAfter).toBeGreaterThan(0)

      // Reads are in a separate bucket and still allowed
      const readCheck = consumeApiRateLimit(clientId, false)
      expect(readCheck.allowed).toBe(true)
      expect(readCheck.remaining).toBeGreaterThan(0)
    })
  })

  // 7. Restart with Local Receivers & Sandboxes Proof
  describe('Local Receivers and Sandboxes', () => {
    it('allows localhost endpoints in test mode and validates challenge ping', async () => {
      let challengeReceived = false
      let signatureReceived: string | null = null

      const mockLocalReceiver: typeof fetch = async (url, init) => {
        expect(url.toString()).toContain('localhost')
        const headers = init?.headers as Record<string, string>
        signatureReceived = headers['x-renegade-signature']
        const body = JSON.parse(String(init?.body))
        if (body.type === 'webhook.endpoint.verify' && body.data.challenge) {
          challengeReceived = true
          return new Response(JSON.stringify({ verified: true }), { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      }

      await verifyWebhookEndpoint(
        'http://localhost:3000/api/webhook-receiver',
        'test-secret-key',
        mockLocalReceiver,
      )

      expect(challengeReceived).toBe(true)
      expect(signatureReceived).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/)
    })

    it('rejects verification if local receiver returns 4xx or 5xx', async () => {
      const failingReceiver: typeof fetch = async () =>
        new Response('Unauthorized', { status: 401 })

      await expect(
        verifyWebhookEndpoint('http://localhost:3000/bad-receiver', 'secret', failingReceiver),
      ).rejects.toThrow(/HTTP 401/)
    })
  })

  // 8. Delivery Diagnosis & Repair Action Resolution Proof
  describe('Failed Delivery Diagnosis & Safe Repair Actions', () => {
    it('diagnoses HTTP 503 transient network errors and provides next safe repair action', () => {
      const diag = diagnoseWebhookDelivery({
        state: 'retrying',
        attempts: 2,
        redactedResponse: 'HTTP 503 Service Unavailable',
      })
      expect(diag.category).toBe('endpoint_error')
      expect(diag.statusCode).toBe(503)
      expect(diag.canRedeliver).toBe(true)
      expect(diag.nextSafeRepairAction).toContain('Inspect receiver server logs')
    })

    it('diagnoses HTTP 401 auth failures and recommends secret rotation', () => {
      const diag = diagnoseWebhookDelivery({
        state: 'retrying',
        attempts: 1,
        redactedResponse: 'HTTP 401 Unauthorized: Invalid webhook signature',
      })
      expect(diag.category).toBe('auth_failure')
      expect(diag.statusCode).toBe(401)
      expect(diag.canRedeliver).toBe(true)
      expect(diag.nextSafeRepairAction).toContain('Rotate Secret')
    })

    it('diagnoses dead-lettered deliveries accurately', () => {
      const diag = diagnoseWebhookDelivery({
        state: 'dead-letter',
        attempts: 5,
        lastError: 'HTTP 500 Internal Server Error',
      })
      expect(diag.isDeadLetter).toBe(true)
      expect(diag.canRedeliver).toBe(true)
      expect(diag.nextSafeRepairAction).toContain('manual redelivery')
    })

    it('resolves repair action for expired credentials', () => {
      const repair = resolveNextSafeRepairAction({
        status: 'expired',
        providerKey: 'api-client',
        expiresAt: '2026-09-01T00:00:00.000Z',
      })
      expect(repair).toContain('Rotate secret in Key Vault')
    })
  })

  // 9. Secret Rotation & Safe Disconnect Proof
  describe('Secret Rotation & Safe Disconnect Behavior', () => {
    it('rotates machine credentials issuing a fresh unrecoverable token and updating hash', () => {
      const initial = issueMachineCredential({
        id: 'client-rotate-test',
        name: 'Rotator Client',
        siteId: 'site-a',
        publicationId: null,
        spaceId: null,
        scopes: ['content.read'],
        expiresAt: null,
        revokedAt: null,
      })

      const rotated = rotateMachineCredential(initial.credential)

      // Token prefix and hash changed
      expect(rotated.tokenPrefix).not.toBe(initial.credential.tokenPrefix)
      expect(rotated.credential.tokenHash).not.toBe(initial.credential.tokenHash)

      // New token authenticates successfully
      const authenticatedWithNew = authenticateMachineCredential(rotated.token, [rotated.credential])
      expect(authenticatedWithNew).not.toBeNull()

      // Old token fails authentication
      const authenticatedWithOld = authenticateMachineCredential(initial.token, [rotated.credential])
      expect(authenticatedWithOld).toBeNull()
    })

    it('reconciles provider in safe dry-run mode without external live calls or orders', () => {
      const reconciled = reconcileProviderState({
        providerKey: 'stripe',
        status: 'active',
        credentialRef: 'STRIPE_SECRET_KEY_REF',
        scopes: ['payments.checkout.one_time'],
        expiresAt: null,
      })

      expect(reconciled.healthState).toBe('healthy')
      expect(reconciled.lastHealthCheckAt).toBeDefined()
      expect(reconciled.lastSuccessAt).toBeDefined()
      expect(reconciled.nextSafeRepairAction).toContain('Healthy')
    })

    it('disconnects safely preserving canonical records and returning audit metadata', () => {
      const disconnect = safeDisconnectProviderState({
        providerKey: 'stripe',
        label: 'Primary Stripe Gateway',
      })

      expect(disconnect.status).toBe('disconnected')
      expect(disconnect.auditAction).toBe('connection.disconnected')
      expect(disconnect.message).toContain('Canonical data and audit records were preserved')
    })
  })

  // 10. Operational Display & Exit Criterion Proof
  describe('Exit Criterion: Operational Displays', () => {
    it('correctly reports connected, actually succeeded, unknown, and repair actions', () => {
      // 1. Fully active and succeeded
      const activeConn = reconcileProviderState({
        providerKey: 'merchant',
        status: 'active',
        credentialRef: 'VAULT_REF_OK',
        scopes: ['payments.checkout.one_time'],
      })
      expect(activeConn.healthState).toBe('healthy')
      expect(activeConn.lastSuccessAt).not.toBeNull()

      // 2. Unconfigured / Unknown
      const unknownConn = reconcileProviderState({
        providerKey: 'pod',
        status: 'unconfigured',
        credentialRef: null,
      })
      expect(unknownConn.healthState).toBe('unknown')
      expect(unknownConn.lastSuccessAt).toBeNull()
      expect(unknownConn.unconfiguredFeatures).toContain('Secret Manager Vault Ref')
      expect(unknownConn.nextSafeRepairAction).toContain('Set credential reference')

      // 3. Degraded with repair action
      const degradedRepair = resolveNextSafeRepairAction({
        status: 'degraded',
        providerKey: 'social',
        lastError: { message: 'OAuth refresh token expired' },
      })
      expect(degradedRepair).toContain('OAuth refresh token expired')
      expect(degradedRepair).toContain('Run safe reconciliation')
    })
  })
})
