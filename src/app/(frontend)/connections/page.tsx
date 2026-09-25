/* eslint-disable @typescript-eslint/no-explicit-any */
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import {
  ConnectionsCenter,
  type OperationalConnection,
  type WebhookDeliveryItem,
  type IntegrationAuditItem,
} from '@/modules/extensions/ConnectionsCenter'
import type { ConnectionGroup } from '@/modules/extensions/contracts'
import {
  diagnoseWebhookDelivery,
  resolveNextSafeRepairAction,
} from '@/modules/integrations/service'

export const dynamic = 'force-dynamic'

function determineGroup(providerKey: string): ConnectionGroup {
  if (
    providerKey.startsWith('social.') ||
    [
      'mastodon',
      'bluesky',
      'linkedin',
      'facebook',
      'instagram',
      'threads',
      'pinterest',
      'youtube',
      'tiktok',
      'x',
      'telegram',
      'discord',
    ].includes(providerKey)
  ) {
    return 'Social'
  }
  if (providerKey.startsWith('pod-') || ['printful', 'printify', 'gelato'].includes(providerKey)) {
    return 'Fulfillment'
  }
  if (
    ['stripe', 'paypal', 'square', 'razorpay', 'offline'].includes(providerKey) ||
    providerKey.startsWith('payment-')
  ) {
    return 'Payments & Support'
  }
  if (['smtp', 'postmark', 'resend', 'sendgrid'].includes(providerKey)) {
    return 'Email'
  }
  if (['twilio', 'jibe'].includes(providerKey)) {
    return 'Messaging'
  }
  if (
    providerKey.startsWith('ai.') ||
    ['openai', 'anthropic', 'google-genai', 'groq'].includes(providerKey)
  ) {
    return 'AI'
  }
  if (
    providerKey.startsWith('analytics.') ||
    ['fathom', 'plausible', 'posthog'].includes(providerKey)
  ) {
    return 'Analytics'
  }
  if (providerKey.startsWith('client-') || providerKey === 'api-client') {
    return 'Security'
  }
  if (providerKey === 'webhook') {
    return 'Webhooks'
  }
  return 'Security'
}

export default async function ConnectionsPage() {
  const connections: OperationalConnection[] = []
  let deliveries: WebhookDeliveryItem[] = []
  let auditEvents: IntegrationAuditItem[] = []
  let isStaff = false

  try {
    const payload = await getPayload({ config: configPromise })
    const incomingHeaders = await headers()
    const auth = await payload.auth({ headers: incomingHeaders }).catch(() => null)
    isStaff = ['owner', 'administrator', 'publisher', 'staff'].includes(String(auth?.user?.role))

    // 1. Merchant connections
    try {
      const merchants = await payload.find({
        collection: 'merchant-connections' as never,
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of merchants.docs as any[]) {
        const status = doc.status === 'active' ? 'active' : doc.status === 'degraded' ? 'degraded' : 'disabled'
        connections.push({
          id: String(doc.id),
          collection: 'merchant-connections',
          group: 'Payments & Support',
          siteId: String(doc.site ?? 'default'),
          providerKey: String(doc.providerKey || 'merchant'),
          externalAccountId: String(doc.merchantCountry || 'default'),
          label: String(doc.label || doc.providerKey || 'Merchant Gateway'),
          status,
          healthState: status === 'active' ? 'healthy' : 'warning',
          encryptedSecretRef: doc.credentialReference ?? null,
          scopes: ['payments.checkout.one_time', 'payments.subscription.recurring'],
          expiresAt: null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: String(doc.updatedAt || doc.createdAt),
          lastSuccessAt: status === 'active' ? String(doc.updatedAt || doc.createdAt) : null,
          lastError: null,
          auditEventIds: [],
          nextSafeRepairAction: resolveNextSafeRepairAction({
            status,
            providerKey: doc.providerKey || 'merchant',
            lastHealthCheckAt: String(doc.updatedAt || doc.createdAt),
          }),
          unconfiguredFeatures: !doc.credentialReference ? ['Vault Credential Missing'] : [],
          isUnknown: !doc.credentialReference,
          canRotateSecret: true,
          canDisconnect: status !== 'disabled',
        })
      }
    } catch {
      // module might be disabled in current profile
    }

    // 2. Social accounts
    try {
      const socials = await payload.find({
        collection: 'social-accounts' as never,
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of socials.docs as any[]) {
        const health = doc.credentialHealth
        const status = health === 'healthy' ? 'active' : health === 'expired' ? 'expired' : health === 'revoked' ? 'revoked' : 'configured'
        connections.push({
          id: String(doc.id),
          collection: 'social-accounts',
          group: 'Social',
          siteId: String(doc.site ?? 'default'),
          providerKey: String(doc.network || 'social'),
          externalAccountId: String(doc.externalAccountId || doc.id),
          label: String(doc.displayName || doc.network || 'Social Account'),
          status,
          healthState: status === 'active' ? 'healthy' : 'warning',
          encryptedSecretRef: doc.connectionReference ?? null,
          scopes: ['social.publish.text'],
          expiresAt: doc.credentialExpiresAt ? String(doc.credentialExpiresAt) : null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: doc.lastVerifiedAt ? String(doc.lastVerifiedAt) : null,
          lastSuccessAt: doc.lastVerifiedAt ? String(doc.lastVerifiedAt) : null,
          lastError: null,
          auditEventIds: [],
          nextSafeRepairAction: resolveNextSafeRepairAction({
            status,
            providerKey: doc.network || 'social',
            expiresAt: doc.credentialExpiresAt,
            lastHealthCheckAt: doc.lastVerifiedAt,
          }),
          unconfiguredFeatures: !doc.connectionReference ? ['OAuth Token Reference'] : [],
          isUnknown: !doc.lastVerifiedAt && status === 'configured',
          canRotateSecret: true,
          canDisconnect: status !== 'revoked',
        })
      }
    } catch {
      // module might be disabled in current profile
    }

    // 3. API clients
    try {
      const clients = await payload.find({
        collection: 'api-clients' as never,
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of clients.docs as any[]) {
        const isRevoked = Boolean(doc.revokedAt)
        const isExpired = doc.expiresAt ? new Date(doc.expiresAt) <= new Date() : false
        const status = isRevoked ? 'revoked' : isExpired ? 'expired' : 'active'
        connections.push({
          id: String(doc.id),
          collection: 'api-clients',
          group: 'Security',
          siteId: String(doc.site ?? 'default'),
          providerKey: 'api-client',
          externalAccountId: String(doc.tokenPrefix || doc.id),
          label: String(doc.name || 'API Client'),
          status,
          healthState: status === 'active' ? 'healthy' : 'warning',
          encryptedSecretRef: null,
          scopes: Array.isArray(doc.scopes) ? doc.scopes.map(String) : [],
          expiresAt: doc.expiresAt ? String(doc.expiresAt) : null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: doc.lastUsedAt ? String(doc.lastUsedAt) : null,
          lastSuccessAt: doc.lastUsedAt ? String(doc.lastUsedAt) : null,
          lastError: null,
          auditEventIds: [],
          nextSafeRepairAction: resolveNextSafeRepairAction({
            status,
            providerKey: 'api-client',
            expiresAt: doc.expiresAt,
            lastHealthCheckAt: doc.lastUsedAt,
          }),
          unconfiguredFeatures: isRevoked ? ['Revoked Token'] : [],
          isUnknown: !doc.lastUsedAt && !isRevoked && !isExpired,
          canRotateSecret: true,
          canDisconnect: !isRevoked,
        })
      }
    } catch {
      // module might be disabled in current profile
    }

    // 4. Webhook Subscriptions
    try {
      const webhooks = await payload.find({
        collection: 'webhook-subscriptions' as never,
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of webhooks.docs as any[]) {
        const failureCount = Number(doc.failureCount ?? 0)
        const isDeadLetter = failureCount >= 5
        const status = doc.status === 'disabled' ? 'disabled' : isDeadLetter ? 'degraded' : 'active'
        connections.push({
          id: String(doc.id),
          collection: 'webhook-subscriptions',
          group: 'Webhooks',
          siteId: String(doc.site ?? 'default'),
          providerKey: 'webhook',
          externalAccountId: String(doc.target),
          label: `Webhook: ${doc.target ? new URL(doc.target).pathname : 'Endpoint'}`,
          status,
          healthState: status === 'active' ? 'healthy' : status === 'degraded' ? 'warning' : 'critical',
          encryptedSecretRef: doc.secretRef ?? null,
          scopes: Array.isArray(doc.events) ? doc.events.map(String) : [],
          expiresAt: null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: doc.rotatedAt ? String(doc.rotatedAt) : null,
          lastSuccessAt: doc.rotatedAt ? String(doc.rotatedAt) : null,
          lastError: null,
          auditEventIds: [],
          nextSafeRepairAction: resolveNextSafeRepairAction({
            status,
            providerKey: 'webhook',
            failureCount,
            lastHealthCheckAt: doc.rotatedAt,
          }),
          unconfiguredFeatures: !doc.secretRef ? ['Secret Reference Unset'] : [],
          isUnknown: failureCount === 0 && !doc.rotatedAt,
          canRotateSecret: true,
          canDisconnect: doc.status === 'active',
          failureCount,
          target: doc.target,
          secretRef: doc.secretRef,
        })
      }
    } catch {
      // module might be disabled in current profile
    }

    // 5. POD Connections
    try {
      const podConnections = await payload.find({
        collection: 'pod-connections' as never,
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of podConnections.docs as any[]) {
        const status = doc.status === 'active' ? 'active' : doc.status === 'degraded' ? 'degraded' : 'disabled'
        connections.push({
          id: String(doc.id),
          collection: 'pod-connections',
          group: 'Fulfillment',
          siteId: String(doc.site ?? 'default'),
          providerKey: String(doc.providerKey || 'pod'),
          externalAccountId: String(doc.remoteStoreId || 'store'),
          label: String(doc.label || 'Print On Demand'),
          status,
          healthState: status === 'active' ? 'healthy' : 'warning',
          encryptedSecretRef: doc.encryptedApiKey ?? null,
          scopes: ['commerce.orders', 'fulfillment.sync'],
          expiresAt: null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: doc.lastHealthCheckedAt ? String(doc.lastHealthCheckedAt) : null,
          lastSuccessAt: doc.lastHealthStatus === 'ok' && doc.lastHealthCheckedAt ? String(doc.lastHealthCheckedAt) : null,
          lastError: doc.lastHealthReason ? { code: 'unavailable', message: doc.lastHealthReason, retryable: true } : null,
          auditEventIds: [],
          nextSafeRepairAction: resolveNextSafeRepairAction({
            status,
            providerKey: doc.providerKey || 'pod',
            lastError: doc.lastHealthReason,
            lastHealthCheckAt: doc.lastHealthCheckedAt,
          }),
          unconfiguredFeatures: !doc.encryptedApiKey ? ['API Key Envelope'] : [],
          isUnknown: !doc.lastHealthCheckedAt,
          canRotateSecret: true,
          canDisconnect: status !== 'disabled',
        })
      }
    } catch {
      // module might be disabled in current profile
    }

    // 6. Webhook Deliveries
    try {
      const deliveriesRes = await payload.find({
        collection: 'webhook-deliveries' as never,
        limit: 50,
        sort: '-createdAt',
        depth: 0,
        overrideAccess: true,
      })
      deliveries = (deliveriesRes.docs as any[]).map((doc) => ({
        id: String(doc.id),
        subscriptionId: String(typeof doc.subscription === 'object' && doc.subscription ? doc.subscription.id : doc.subscription),
        eventId: String(doc.eventId),
        eventType: String(doc.eventType),
        state: doc.state,
        attempts: Number(doc.attempts ?? 0),
        nextAttemptAt: doc.nextAttemptAt ? String(doc.nextAttemptAt) : null,
        redactedResponse: doc.redactedResponse ?? null,
        lastError: doc.lastError ?? null,
        diagnosis: diagnoseWebhookDelivery({
          state: doc.state,
          attempts: Number(doc.attempts ?? 0),
          redactedResponse: doc.redactedResponse,
          lastError: doc.lastError,
        }),
      }))
    } catch {
      // module might be disabled in current profile
    }

    // 7. Audit Events
    try {
      const auditRes = await payload.find({
        collection: 'integration-audit-events' as never,
        limit: 50,
        sort: '-occurredAt',
        depth: 0,
        overrideAccess: true,
      })
      auditEvents = (auditRes.docs as any[]).map((doc) => ({
        id: String(doc.id),
        action: String(doc.action),
        outcome: doc.outcome,
        occurredAt: String(doc.occurredAt),
        client: doc.client,
        subject: doc.subject,
      }))
    } catch {
      // module might be disabled in current profile
    }
  } catch {
    // payload initialization fallback
  }

  return (
    <ConnectionsCenter
      connections={connections}
      deliveries={deliveries}
      auditEvents={auditEvents}
      groupFor={determineGroup}
      isStaff={isStaff}
    />
  )
}
