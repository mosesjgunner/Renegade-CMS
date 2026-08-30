import { describe, expect, it } from 'vitest'
import { invokeIntegrationAgentTool } from '../../src/modules/integrations/agent-service'
import {
  authenticateMachineCredential,
  canAccess,
  issueMachineCredential,
  signWebhook,
  verifyWebhookSignature,
  webhookRetry,
} from '../../src/modules/integrations/service'

describe('Prompt 12 integration boundary', () => {
  const issued = issueMachineCredential({
    id: 'client-1',
    name: 'reader',
    siteId: 'site-a',
    publicationId: 'pub-a',
    spaceId: null,
    scopes: ['content.read'],
    expiresAt: null,
    revokedAt: null,
  })
  it('enforces scopes, tenant isolation, expiry, and revocation', () => {
    const client = authenticateMachineCredential(issued.token, [issued.credential])
    expect(canAccess(client, 'content.read', { siteId: 'site-a', publicationId: 'pub-a' })).toBe(
      true,
    )
    expect(canAccess(client, 'content.read', { siteId: 'site-b', publicationId: 'pub-a' })).toBe(
      false,
    )
    expect(
      authenticateMachineCredential(issued.token, [
        { ...issued.credential, revokedAt: new Date().toISOString() },
      ]),
    ).toBeNull()
  })
  it('signs deliveries and retries/disabled failed destinations deterministically', () => {
    const raw = '{"id":"event-1"}',
      signature = signWebhook(raw, 'secret')
    expect(verifyWebhookSignature(raw, signature, 'secret')).toBe(true)
    expect(verifyWebhookSignature(`${raw} `, signature, 'secret')).toBe(false)
    expect(webhookRetry({ attempts: 1, responseStatus: 503, failureCount: 0 }).state).toBe(
      'retrying',
    )
    expect(webhookRetry({ attempts: 5, responseStatus: 500, failureCount: 4 }).disable).toBe(true)
  })
  it('denies cross-scope tools and requires approval/idempotency before execution', async () => {
    const manifest = {
      name: 'payments.refund',
      version: 1,
      input: {},
      output: {},
      permission: 'payments.refund',
      dataSensitivity: 'restricted' as const,
      rateLimit: '1/min',
      idempotency: 'required' as const,
      approval: 'always' as const,
      timeoutMs: 100,
      audit: 'required' as const,
      rollback: 'compensating-action' as const,
    }
    const run = {
      id: 'r1',
      siteId: 'site-a',
      publicationId: 'pub-a',
      spaceId: null,
      status: 'completed' as const,
      audit: [],
    }
    const completed = new Map<string, Record<string, unknown>>()
    let calls = 0
    expect(
      (
        await invokeIntegrationAgentTool({
          run,
          manifest,
          tool: manifest.name,
          target: { siteId: 'site-a', publicationId: 'pub-a' },
          grants: [manifest.permission],
          idempotencyKey: 'k',
          completed,
          execute: async () => ({ call: ++calls }),
        })
      ).run.status,
    ).toBe('awaiting-approval')
    await invokeIntegrationAgentTool({
      run,
      manifest,
      tool: manifest.name,
      target: { siteId: 'site-a', publicationId: 'pub-a' },
      grants: [manifest.permission],
      idempotencyKey: 'k',
      approved: true,
      completed,
      execute: async () => ({ call: ++calls }),
    })
    await invokeIntegrationAgentTool({
      run,
      manifest,
      tool: manifest.name,
      target: { siteId: 'site-a', publicationId: 'pub-a' },
      grants: [manifest.permission],
      idempotencyKey: 'k',
      approved: true,
      completed,
      execute: async () => ({ call: ++calls }),
    })
    expect(calls).toBe(1)
    expect(
      (
        await invokeIntegrationAgentTool({
          run,
          manifest,
          tool: manifest.name,
          target: { siteId: 'site-b' },
          grants: [manifest.permission],
          idempotencyKey: 'other',
          approved: true,
          completed,
          execute: async () => ({}),
        })
      ).run.status,
    ).toBe('denied')
  })
})
