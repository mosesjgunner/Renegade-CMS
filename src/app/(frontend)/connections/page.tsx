/* eslint-disable @typescript-eslint/no-explicit-any */
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  ConnectionsCenter,
  type OperationalConnection,
  type WebhookDeliveryItem,
  type IntegrationAuditItem,
} from '@/modules/extensions/ConnectionsCenter'
import {
  diagnoseWebhookDelivery,
  resolveNextSafeRepairAction,
} from '@/modules/integrations/service'
import { canManageAdminSite, getAdminSiteIDs } from '@/modules/admin/site-access'
import { loadConfig } from '@/modules/core/config'
import { runtimeProviderInventory } from '@/modules/extensions/runtime-provider-inventory'

export const dynamic = 'force-dynamic'

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  const connections: OperationalConnection[] = []
  let deliveries: WebhookDeliveryItem[] = []
  let auditEvents: IntegrationAuditItem[] = []
  const payload = await getPayload({ config: configPromise })
  const runtimeConfig = loadConfig()
  const incomingHeaders = await headers()
  const auth = await payload.auth({ headers: incomingHeaders }).catch(() => null)
  const isStaff = ['owner', 'administrator', 'staff'].includes(String(auth?.user?.role))
  if (!isStaff) {
    redirect('/admin/login')
  }

  const query = await searchParams
  const assignedSites = getAdminSiteIDs(auth?.user)
  const siteId =
    query.siteId ||
    (auth?.user?.role === 'staff' && assignedSites.length === 1 ? assignedSites[0] : undefined)
  if (auth?.user?.role === 'staff' && !siteId) redirect('/admin')
  if (siteId && !canManageAdminSite(auth?.user, siteId)) redirect('/admin')
  const siteWhere = siteId ? { site: { equals: siteId } } : undefined

  try {
    // 1. Merchant connections
    try {
      const merchants = await payload.find({
        collection: 'merchant-connections' as never,
        ...(siteWhere ? { where: siteWhere } : {}),
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of merchants.docs as any[]) {
        const status =
          doc.status === 'active' ? 'active' : doc.status === 'degraded' ? 'degraded' : 'disabled'
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
          encryptedSecretRef: doc.credentialReference ? 'configured' : null,
          credentialSourceLabel: doc.credentialReference
            ? 'Secret-manager reference configured; value hidden'
            : 'No credential reference',
          scopes: ['payments.checkout.one_time', 'payments.subscription.recurring'],
          expiresAt: null,
          refreshMetadata: null,
          capabilities: [],
          lastError: null,
          lastHealthCheckAt: null,
          lastSuccessAt: null,
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
        ...(siteWhere ? { where: siteWhere } : {}),
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of socials.docs as any[]) {
        const health = doc.credentialHealth
        const status =
          health === 'healthy'
            ? 'active'
            : health === 'expired'
              ? 'expired'
              : health === 'revoked'
                ? 'revoked'
                : 'configured'
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
          encryptedSecretRef: doc.connectionReference ? 'configured' : null,
          credentialSourceLabel: doc.connectionReference
            ? 'OAuth credential reference configured; value hidden'
            : 'No credential reference',
          scopes: ['social.publish.text'],
          expiresAt: doc.credentialExpiresAt ? String(doc.credentialExpiresAt) : null,
          refreshMetadata: null,
          capabilities: [],
          lastError: doc.diagnostics?.lastError
            ? {
                code: 'unavailable',
                message: String(doc.diagnostics.lastError).slice(0, 500),
                retryable: false,
              }
            : null,
          lastHealthCheckAt: doc.lastVerifiedAt ? String(doc.lastVerifiedAt) : null,
          lastSuccessAt: doc.lastVerifiedAt ? String(doc.lastVerifiedAt) : null,
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
        ...(siteWhere ? { where: siteWhere } : {}),
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
        ...(siteWhere ? { where: siteWhere } : {}),
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
          externalAccountId: safeEndpointLabel(doc.target),
          label: `Webhook: ${doc.target ? new URL(doc.target).pathname : 'Endpoint'}`,
          status,
          healthState:
            status === 'active' ? 'healthy' : status === 'degraded' ? 'warning' : 'critical',
          encryptedSecretRef: doc.secretRef ? 'configured' : null,
          credentialSourceLabel: doc.secretRef
            ? 'Webhook secret reference configured; value hidden'
            : 'No secret reference',
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
        })
      }
    } catch {
      // module might be disabled in current profile
    }

    // 5. POD Connections
    try {
      const podConnections = await payload.find({
        collection: 'pod-connections' as never,
        ...(siteWhere ? { where: siteWhere } : {}),
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of podConnections.docs as any[]) {
        const status =
          doc.status === 'active' ? 'active' : doc.status === 'degraded' ? 'degraded' : 'disabled'
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
          encryptedSecretRef: doc.encryptedApiKey ? 'configured' : null,
          credentialSourceLabel: doc.encryptedApiKey
            ? 'Encrypted credential envelope; value hidden'
            : 'No credential envelope',
          scopes: ['commerce.orders', 'fulfillment.sync'],
          expiresAt: null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: doc.lastHealthCheckedAt ? String(doc.lastHealthCheckedAt) : null,
          lastSuccessAt:
            doc.lastHealthStatus === 'ok' && doc.lastHealthCheckedAt
              ? String(doc.lastHealthCheckedAt)
              : null,
          lastError: doc.lastHealthReason
            ? { code: 'unavailable', message: doc.lastHealthReason, retryable: true }
            : null,
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
      const webhooks = siteId
        ? await payload.find({
            collection: 'webhook-subscriptions' as never,
            where: { site: { equals: siteId } },
            limit: 500,
            depth: 0,
            overrideAccess: true,
          })
        : null
      const scopedWebhookIDs =
        (webhooks?.docs as Array<{ id: string | number }> | undefined)?.map((doc) =>
          String(doc.id),
        ) ?? []
      const deliveriesRes = await payload.find({
        collection: 'webhook-deliveries' as never,
        ...(siteId ? { where: { subscription: { in: scopedWebhookIDs } } } : {}),
        limit: 50,
        sort: '-createdAt',
        depth: 0,
        overrideAccess: true,
      })
      deliveries = (deliveriesRes.docs as any[]).map((doc) => ({
        id: String(doc.id),
        subscriptionId: String(
          typeof doc.subscription === 'object' && doc.subscription
            ? doc.subscription.id
            : doc.subscription,
        ),
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
        ...(siteWhere ? { where: siteWhere } : {}),
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

    // 8. AI provider connections. The encrypted credential envelope is only
    // inspected for presence; neither the envelope nor its reference reaches the client.
    try {
      const aiResult = await payload.find({
        collection: 'ai-connections' as never,
        ...(siteWhere ? { where: siteWhere } : {}),
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      const aiDocs = aiResult.docs as any[]
      const aiIDs = aiDocs.map((doc) => String(doc.id))
      const credentialResult = aiIDs.length
        ? await payload.find({
            collection: 'ai-credentials' as never,
            where: { connection: { in: aiIDs } },
            limit: aiIDs.length,
            depth: 0,
            overrideAccess: true,
          })
        : { docs: [] }
      const configuredCredentials = new Set(
        (credentialResult.docs as any[]).map((doc) =>
          String(typeof doc.connection === 'object' ? doc.connection?.id : doc.connection),
        ),
      )
      for (const doc of aiDocs) {
        const testedAt = doc.lastTestedAt ? String(doc.lastTestedAt) : null
        const hasCredential = configuredCredentials.has(String(doc.id))
        const state =
          doc.status === 'degraded' || !hasCredential
            ? 'degraded'
            : testedAt
              ? 'validated'
              : 'configured'
        connections.push({
          id: String(doc.id),
          collection: 'ai-connections',
          group: 'AI',
          siteId: String(doc.site ?? siteId ?? ''),
          providerKey: String(doc.providerKey || 'ai.provider'),
          externalAccountId: String(doc.model || 'configured model'),
          label: String(doc.label || doc.providerKey || 'AI Provider'),
          status: doc.status === 'active' ? 'active' : 'degraded',
          providerState: state,
          healthState:
            state === 'degraded' ? 'warning' : state === 'validated' ? 'healthy' : 'unknown',
          encryptedSecretRef: hasCredential ? 'configured' : null,
          credentialSourceLabel: hasCredential
            ? 'Encrypted credential record; key material remains server-side'
            : 'Credential record unavailable',
          scopes: Array.isArray(doc.allowedTasks) ? doc.allowedTasks.map(String) : [],
          expiresAt: null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: testedAt,
          lastSuccessAt: testedAt && doc.status === 'active' ? testedAt : null,
          lastError: doc.lastError
            ? {
                code: 'unavailable',
                message: String(doc.lastError).slice(0, 300),
                retryable: false,
              }
            : null,
          auditEventIds: [],
          safeTestResult: testedAt
            ? doc.status === 'active'
              ? `Provider test passed ${new Date(testedAt).toLocaleString()}.`
              : `Provider test failed ${new Date(testedAt).toLocaleString()}.`
            : 'Not tested; no provider request was made from this overview.',
          limitations: [
            'AI usage is budgeted and task-scoped; image generation is unsupported by the current tested adapters.',
          ],
          canRotateSecret: false,
          canDisconnect: false,
          nextSafeRepairAction:
            state === 'degraded'
              ? 'Review the connection in AI Studio.'
              : 'Manage this connection in AI Studio.',
        })
      }
    } catch {
      // AI module may be disabled in this deployment profile.
    }
  } catch {
    // payload initialization fallback
  }

  const configuredProviderKeys = connections
    .filter((connection) =>
      ['social-accounts', 'ai-connections', 'pod-connections'].includes(
        String(connection.collection),
      ),
    )
    .map((connection) => connection.providerKey)
  const runtimeRows = runtimeProviderInventory(
    runtimeConfig,
    process.env,
    configuredProviderKeys,
  ).map(
    (item) =>
      ({
        id: item.id,
        collection: 'runtime-capability',
        group: item.group,
        siteId: siteId ?? '',
        providerKey: item.providerKey,
        externalAccountId: 'runtime configuration',
        label: item.label,
        status:
          item.state === 'enabled'
            ? ('active' as const)
            : item.state === 'degraded'
              ? ('degraded' as const)
              : ('unconfigured' as const),
        providerState: item.state,
        healthState:
          item.state === 'enabled'
            ? ('healthy' as const)
            : item.state === 'degraded'
              ? ('warning' as const)
              : ('unknown' as const),
        encryptedSecretRef: null,
        credentialSourceLabel: item.credentialSource,
        scopes: [],
        expiresAt: null,
        refreshMetadata: null,
        capabilities: [],
        lastHealthCheckAt: null,
        lastSuccessAt: null,
        lastError: null,
        auditEventIds: [],
        safeTestResult: item.safeTestResult,
        limitations: item.limitations,
        runtimeCapability: true,
        manageHref: item.manageHref
          ? `${item.manageHref}${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ''}`
          : undefined,
        canRotateSecret: false,
        canDisconnect: false,
        nextSafeRepairAction: 'Managed through deployment configuration.',
      }) satisfies OperationalConnection,
  )
  connections.push(...runtimeRows)

  return (
    <ConnectionsCenter
      connections={connections}
      deliveries={deliveries}
      auditEvents={auditEvents}
      isStaff={isStaff}
      siteId={siteId}
    />
  )
}

function safeEndpointLabel(value: unknown): string {
  try {
    const endpoint = new URL(String(value))
    return `${endpoint.host}${endpoint.pathname}`
  } catch {
    return 'Endpoint configured'
  }
}
