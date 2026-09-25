/* eslint-disable @typescript-eslint/no-explicit-any -- Payload dynamic collections at operational boundary */
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  diagnoseWebhookDelivery,
  issueMachineCredential,
  reconcileProviderState,
  resolveNextSafeRepairAction,
  rotateMachineCredential,
  safeDisconnectProviderState,
  type IntegrationScope,
} from '@/modules/integrations/service'
import {
  redeliverWebhook,
  resolveWebhookSecret,
  verifyWebhookEndpoint,
} from '@/modules/integrations/webhooks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'publisher', 'staff'].includes(String(user?.role))

const asId = (value: unknown) =>
  String(typeof value === 'object' && value ? (value as { id?: unknown }).id : (value ?? ''))

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized. Staff role required.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId') || undefined
    const siteWhere = siteId ? { site: { equals: siteId } } : undefined

    const [
      apiClientsRes,
      webhooksRes,
      merchantsRes,
      socialsRes,
      podRes,
      aiRes,
      auditEventsRes,
    ] = await Promise.all([
      payload.find({ collection: 'api-clients' as never, where: siteWhere, limit: 100, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] })),
      payload.find({ collection: 'webhook-subscriptions' as never, where: siteWhere, limit: 100, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] })),
      payload.find({ collection: 'merchant-connections' as never, where: siteWhere, limit: 100, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] })),
      payload.find({ collection: 'social-accounts' as never, where: siteWhere, limit: 100, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] })),
      payload.find({ collection: 'pod-connections' as never, where: siteWhere, limit: 100, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] })),
      payload.find({ collection: 'ai-connections' as never, where: siteWhere, limit: 100, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] })),
      payload.find({ collection: 'integration-audit-events' as never, where: siteWhere, limit: 50, sort: '-occurredAt', depth: 0, overrideAccess: true }).catch(() => ({ docs: [] })),
    ])

    const webhookIds = webhooksRes.docs.map((doc: any) => String(doc.id))
    const deliveriesWhere = webhookIds.length > 0 ? { subscription: { in: webhookIds } } : undefined
    const deliveriesRes = await payload.find({
      collection: 'webhook-deliveries' as never,
      where: deliveriesWhere,
      limit: 100,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }).catch(() => ({ docs: [] }))

    const deliveries = (deliveriesRes.docs as any[]).map((doc) => {
      const diagnosis = diagnoseWebhookDelivery({
        state: doc.state,
        attempts: Number(doc.attempts ?? 0),
        redactedResponse: doc.redactedResponse,
        lastError: doc.lastError,
      })
      return {
        id: String(doc.id),
        subscriptionId: asId(doc.subscription),
        eventId: String(doc.eventId),
        eventType: String(doc.eventType),
        state: doc.state,
        attempts: Number(doc.attempts ?? 0),
        nextAttemptAt: doc.nextAttemptAt ?? null,
        redactedResponse: doc.redactedResponse ?? null,
        lastError: doc.lastError ?? null,
        diagnosis,
      }
    })

    const connections: any[] = []

    // 1. API Clients
    for (const doc of apiClientsRes.docs as any[]) {
      const isRevoked = Boolean(doc.revokedAt)
      const isExpired = doc.expiresAt ? new Date(doc.expiresAt) <= new Date() : false
      const status = isRevoked ? 'revoked' : isExpired ? 'expired' : 'active'
      const lastSuccessAt = doc.lastUsedAt ? String(doc.lastUsedAt) : null
      connections.push({
        id: String(doc.id),
        collection: 'api-clients',
        group: 'Security',
        providerKey: 'api-client',
        label: String(doc.name || 'API Client'),
        externalAccountId: String(doc.tokenPrefix || doc.id),
        status,
        healthState: status === 'active' ? 'healthy' : 'warning',
        scopes: Array.isArray(doc.scopes) ? doc.scopes : [],
        expiresAt: doc.expiresAt ? String(doc.expiresAt) : null,
        lastSuccessAt,
        lastHealthCheckAt: doc.lastUsedAt ? String(doc.lastUsedAt) : null,
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

    // 2. Webhook Subscriptions
    for (const doc of webhooksRes.docs as any[]) {
      const failureCount = Number(doc.failureCount ?? 0)
      const isDeadLetter = failureCount >= 5
      const status = doc.status === 'disabled' ? 'disabled' : isDeadLetter ? 'degraded' : 'active'
      const relatedDeliveries = deliveries.filter((d) => d.subscriptionId === String(doc.id))
      const lastDelivered = relatedDeliveries.find((d) => d.state === 'delivered')

      connections.push({
        id: String(doc.id),
        collection: 'webhook-subscriptions',
        group: 'Webhooks',
        providerKey: 'webhook',
        label: `Webhook: ${doc.target ? new URL(doc.target).pathname : 'Endpoint'}`,
        externalAccountId: String(doc.target),
        status,
        healthState: status === 'active' ? 'healthy' : status === 'degraded' ? 'warning' : 'critical',
        scopes: Array.isArray(doc.events) ? doc.events : [],
        expiresAt: null,
        lastSuccessAt: lastDelivered ? lastDelivered.eventId : doc.rotatedAt ? String(doc.rotatedAt) : null,
        lastHealthCheckAt: doc.rotatedAt ? String(doc.rotatedAt) : null,
        nextSafeRepairAction: resolveNextSafeRepairAction({
          status,
          providerKey: 'webhook',
          failureCount,
          lastHealthCheckAt: doc.rotatedAt,
        }),
        unconfiguredFeatures: !doc.secretRef ? ['Secret Reference Unset'] : [],
        isUnknown: failureCount === 0 && !lastDelivered && !doc.rotatedAt,
        canRotateSecret: true,
        canDisconnect: doc.status === 'active',
        failureCount,
        target: doc.target,
        secretRef: doc.secretRef,
      })
    }

    // 3. Merchant Connections
    for (const doc of merchantsRes.docs as any[]) {
      const status = doc.status === 'active' ? 'active' : doc.status === 'degraded' ? 'degraded' : 'disabled'
      connections.push({
        id: String(doc.id),
        collection: 'merchant-connections',
        group: 'Payments & Support',
        providerKey: String(doc.providerKey || 'merchant'),
        label: String(doc.label || doc.providerKey || 'Merchant Gateway'),
        externalAccountId: String(doc.merchantCountry || 'default'),
        status,
        healthState: status === 'active' ? 'healthy' : 'warning',
        scopes: ['payments.checkout.one_time', 'payments.subscription.recurring'],
        expiresAt: null,
        lastSuccessAt: status === 'active' ? String(doc.updatedAt || doc.createdAt) : null,
        lastHealthCheckAt: String(doc.updatedAt || doc.createdAt),
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

    // 4. Social Accounts
    for (const doc of socialsRes.docs as any[]) {
      const health = doc.credentialHealth
      const status = health === 'healthy' ? 'active' : health === 'expired' ? 'expired' : health === 'revoked' ? 'revoked' : 'unconfigured'
      connections.push({
        id: String(doc.id),
        collection: 'social-accounts',
        group: 'Social',
        providerKey: String(doc.network || 'social'),
        label: String(doc.displayName || doc.network || 'Social Account'),
        externalAccountId: String(doc.externalAccountId || doc.id),
        status,
        healthState: status === 'active' ? 'healthy' : 'warning',
        scopes: ['social.publish.text'],
        expiresAt: doc.credentialExpiresAt ? String(doc.credentialExpiresAt) : null,
        lastSuccessAt: doc.lastVerifiedAt ? String(doc.lastVerifiedAt) : null,
        lastHealthCheckAt: doc.lastVerifiedAt ? String(doc.lastVerifiedAt) : null,
        nextSafeRepairAction: resolveNextSafeRepairAction({
          status,
          providerKey: doc.network || 'social',
          expiresAt: doc.credentialExpiresAt,
          lastHealthCheckAt: doc.lastVerifiedAt,
        }),
        unconfiguredFeatures: !doc.connectionReference ? ['OAuth Token Reference'] : [],
        isUnknown: !doc.lastVerifiedAt && status === 'unconfigured',
        canRotateSecret: true,
        canDisconnect: status !== 'revoked',
      })
    }

    // 5. POD Connections
    for (const doc of podRes.docs as any[]) {
      const status = doc.status === 'active' ? 'active' : doc.status === 'degraded' ? 'degraded' : 'disabled'
      connections.push({
        id: String(doc.id),
        collection: 'pod-connections',
        group: 'Fulfillment',
        providerKey: String(doc.providerKey || 'pod'),
        label: String(doc.label || 'Print On Demand'),
        externalAccountId: String(doc.remoteStoreId || 'store'),
        status,
        healthState: status === 'active' ? 'healthy' : 'warning',
        scopes: ['commerce.orders', 'fulfillment.sync'],
        expiresAt: null,
        lastSuccessAt: doc.lastHealthStatus === 'ok' && doc.lastHealthCheckedAt ? String(doc.lastHealthCheckedAt) : null,
        lastHealthCheckAt: doc.lastHealthCheckedAt ? String(doc.lastHealthCheckedAt) : null,
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

    // 6. AI Connections
    for (const doc of aiRes.docs as any[]) {
      const status = doc.status === 'active' ? 'active' : doc.status === 'degraded' ? 'degraded' : 'disabled'
      connections.push({
        id: String(doc.id),
        collection: 'ai-connections',
        group: 'AI',
        providerKey: String(doc.providerKey || 'ai'),
        label: String(doc.label || 'AI Model Gateway'),
        externalAccountId: String(doc.model || 'model'),
        status,
        healthState: status === 'active' ? 'healthy' : 'warning',
        scopes: Array.isArray(doc.capabilities) ? doc.capabilities : ['ai.text.rewrite'],
        expiresAt: null,
        lastSuccessAt: doc.lastTestedAt ? String(doc.lastTestedAt) : null,
        lastHealthCheckAt: doc.lastTestedAt ? String(doc.lastTestedAt) : null,
        nextSafeRepairAction: resolveNextSafeRepairAction({
          status,
          providerKey: doc.providerKey || 'ai',
          lastError: doc.lastError,
          lastHealthCheckAt: doc.lastTestedAt,
        }),
        unconfiguredFeatures: !doc.endpoint ? ['Custom Endpoint'] : [],
        isUnknown: !doc.lastTestedAt,
        canRotateSecret: true,
        canDisconnect: status !== 'disabled',
      })
    }

    const stats = {
      total: connections.length,
      healthy: connections.filter((c) => c.healthState === 'healthy').length,
      degraded: connections.filter((c) => c.healthState === 'warning').length,
      unconfigured: connections.filter((c) => c.isUnknown || c.status === 'unconfigured').length,
      pendingRetries: deliveries.filter((d) => d.state === 'retrying').length,
      deadLetters: deliveries.filter((d) => d.state === 'dead-letter').length,
    }

    return NextResponse.json({
      connections,
      deliveries: deliveries.slice(0, 50),
      subscriptions: webhooksRes.docs,
      auditEvents: auditEventsRes.docs,
      stats,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query operational integration records.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized. Staff role required.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || !body.action) {
      return NextResponse.json({ error: 'Missing operation action.' }, { status: 400 })
    }

    const defaultSiteId = 'default'

    switch (body.action) {
      case 'create-client': {
        if (!body.name || typeof body.name !== 'string') {
          return NextResponse.json({ error: 'Client name is required.' }, { status: 422 })
        }
        const siteId = body.siteId || defaultSiteId
        const scopes: readonly IntegrationScope[] = Array.isArray(body.scopes) && body.scopes.length > 0
          ? body.scopes
          : ['content.read']

        const clientId = `client_${Date.now()}`
        const issued = issueMachineCredential({
          id: clientId,
          name: body.name.trim(),
          siteId,
          publicationId: body.publicationId || null,
          spaceId: body.spaceId || null,
          scopes,
          expiresAt: body.expiresAt || null,
          revokedAt: null,
        })

        const created = await payload.create({
          collection: 'api-clients' as never,
          data: {
            site: siteId,
            publication: body.publicationId || undefined,
            space: body.spaceId || undefined,
            name: body.name.trim(),
            tokenPrefix: issued.credential.tokenPrefix,
            tokenHash: issued.credential.tokenHash,
            scopes,
            expiresAt: body.expiresAt || undefined,
          } as never,
          overrideAccess: true,
        })

        await payload.create({
          collection: 'integration-audit-events' as never,
          data: {
            site: siteId,
            action: 'client.issued',
            client: (created as any).id,
            subject: { name: body.name, scopes, tokenPrefix: issued.credential.tokenPrefix },
            outcome: 'allowed',
            occurredAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        }).catch(() => null)

        return NextResponse.json({
          client: created,
          token: issued.token,
          tokenPrefix: issued.credential.tokenPrefix,
          message: 'Machine credential issued successfully. Store token securely now; clear secret cannot be recovered.',
        }, { status: 201 })
      }

      case 'rotate-client-secret': {
        if (!body.clientId) {
          return NextResponse.json({ error: 'clientId is required.' }, { status: 422 })
        }
        const existing = await payload.findByID({
          collection: 'api-clients' as never,
          id: body.clientId,
          depth: 0,
          overrideAccess: true,
        }).catch(() => null)
        if (!existing) {
          return NextResponse.json({ error: 'API Client not found.' }, { status: 404 })
        }

        const rotated = rotateMachineCredential({
          id: String((existing as any).id),
          name: String((existing as any).name),
          siteId: asId((existing as any).site),
          publicationId: (existing as any).publication ? asId((existing as any).publication) : null,
          spaceId: (existing as any).space ? asId((existing as any).space) : null,
          tokenPrefix: String((existing as any).tokenPrefix),
          tokenHash: String((existing as any).tokenHash),
          scopes: Array.isArray((existing as any).scopes) ? (existing as any).scopes : [],
          expiresAt: (existing as any).expiresAt ? String((existing as any).expiresAt) : null,
          revokedAt: (existing as any).revokedAt ? String((existing as any).revokedAt) : null,
        })

        await payload.update({
          collection: 'api-clients' as never,
          id: body.clientId,
          data: {
            tokenPrefix: rotated.credential.tokenPrefix,
            tokenHash: rotated.credential.tokenHash,
            revokedAt: null,
          } as never,
          overrideAccess: true,
        })

        await payload.create({
          collection: 'integration-audit-events' as never,
          data: {
            site: (existing as any).site,
            action: 'client.secret_rotated',
            client: body.clientId,
            subject: { tokenPrefix: rotated.credential.tokenPrefix },
            outcome: 'allowed',
            occurredAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        }).catch(() => null)

        return NextResponse.json({
          token: rotated.token,
          tokenPrefix: rotated.credential.tokenPrefix,
          message: 'Machine credential secret rotated successfully. Copy new secret now.',
        })
      }

      case 'revoke-client': {
        if (!body.clientId) {
          return NextResponse.json({ error: 'clientId is required.' }, { status: 422 })
        }
        const existing = await payload.findByID({
          collection: 'api-clients' as never,
          id: body.clientId,
          depth: 0,
          overrideAccess: true,
        }).catch(() => null)
        if (!existing) {
          return NextResponse.json({ error: 'API Client not found.' }, { status: 404 })
        }

        await payload.update({
          collection: 'api-clients' as never,
          id: body.clientId,
          data: {
            revokedAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        })

        await payload.create({
          collection: 'integration-audit-events' as never,
          data: {
            site: (existing as any).site,
            action: 'client.revoked',
            client: body.clientId,
            subject: { tokenPrefix: (existing as any).tokenPrefix },
            outcome: 'allowed',
            occurredAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        }).catch(() => null)

        return NextResponse.json({ success: true, message: 'Client credential revoked safely.' })
      }

      case 'create-webhook': {
        if (!body.target || !body.secretRef || !Array.isArray(body.events) || body.events.length === 0) {
          return NextResponse.json({ error: 'target URL, secretRef, and events are required.' }, { status: 422 })
        }
        const siteId = body.siteId || defaultSiteId
        const secret = await resolveWebhookSecret(String(body.secretRef))
        if (!secret) {
          return NextResponse.json({ error: 'secretRef cannot be resolved in this environment.' }, { status: 422 })
        }

        try {
          await verifyWebhookEndpoint(String(body.target), secret)
        } catch (err) {
          return NextResponse.json({
            error: err instanceof Error ? err.message : 'Target endpoint verification failed.',
          }, { status: 422 })
        }

        const created = await payload.create({
          collection: 'webhook-subscriptions' as never,
          data: {
            site: siteId,
            target: body.target,
            secretRef: body.secretRef,
            events: body.events,
            status: 'active',
            failureCount: 0,
            rotatedAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        })

        await payload.create({
          collection: 'integration-audit-events' as never,
          data: {
            site: siteId,
            action: 'webhook.subscribed',
            subject: { target: body.target, events: body.events, secretRef: body.secretRef },
            outcome: 'allowed',
            occurredAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        }).catch(() => null)

        return NextResponse.json({ subscription: created, message: 'Webhook subscription verified and registered.' }, { status: 201 })
      }

      case 'rotate-webhook-secret': {
        if (!body.subscriptionId || !body.secretRef) {
          return NextResponse.json({ error: 'subscriptionId and secretRef are required.' }, { status: 422 })
        }
        const sub = await payload.findByID({
          collection: 'webhook-subscriptions' as never,
          id: body.subscriptionId,
          depth: 0,
          overrideAccess: true,
        }).catch(() => null)
        if (!sub) return NextResponse.json({ error: 'Webhook subscription not found.' }, { status: 404 })

        const secret = await resolveWebhookSecret(String(body.secretRef))
        if (!secret) {
          return NextResponse.json({ error: 'New secretRef cannot be resolved.' }, { status: 422 })
        }

        try {
          await verifyWebhookEndpoint(String((sub as any).target), secret)
        } catch (err) {
          return NextResponse.json({
            error: err instanceof Error ? err.message : 'New secret endpoint challenge failed.',
          }, { status: 422 })
        }

        const updated = await payload.update({
          collection: 'webhook-subscriptions' as never,
          id: body.subscriptionId,
          data: {
            secretRef: body.secretRef,
            rotatedAt: new Date().toISOString(),
            status: 'active',
            failureCount: 0,
          } as never,
          overrideAccess: true,
        })

        await payload.create({
          collection: 'integration-audit-events' as never,
          data: {
            site: (sub as any).site,
            action: 'webhook.secret_rotated',
            subject: { subscriptionId: body.subscriptionId, secretRef: body.secretRef },
            outcome: 'allowed',
            occurredAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        }).catch(() => null)

        return NextResponse.json({ subscription: updated, message: 'Webhook secret rotated and verified.' })
      }

      case 'toggle-webhook': {
        if (!body.subscriptionId || !body.status) {
          return NextResponse.json({ error: 'subscriptionId and status are required.' }, { status: 422 })
        }
        const updated = await payload.update({
          collection: 'webhook-subscriptions' as never,
          id: body.subscriptionId,
          data: {
            status: body.status === 'active' ? 'active' : 'disabled',
            failureCount: body.status === 'active' ? 0 : undefined,
          } as never,
          overrideAccess: true,
        })

        return NextResponse.json({ subscription: updated, message: `Webhook subscription is now ${body.status}.` })
      }

      case 'redeliver-webhook': {
        if (!body.deliveryId) {
          return NextResponse.json({ error: 'deliveryId is required.' }, { status: 422 })
        }
        const redelivered = await redeliverWebhook(payload as any, body.deliveryId)

        await payload.create({
          collection: 'integration-audit-events' as never,
          data: {
            site: defaultSiteId,
            action: 'webhook.manual_redelivery',
            subject: { previousDeliveryId: body.deliveryId, newDeliveryId: redelivered.id },
            outcome: 'allowed',
            occurredAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        }).catch(() => null)

        return NextResponse.json({ delivery: redelivered, message: 'Delivery re-queued with fresh idempotency key.' }, { status: 202 })
      }

      case 'reconcile-provider': {
        if (!body.connectionId || !body.collection) {
          return NextResponse.json({ error: 'connectionId and collection are required.' }, { status: 422 })
        }

        const existing = await payload.findByID({
          collection: body.collection as never,
          id: body.connectionId,
          depth: 0,
          overrideAccess: true,
        }).catch(() => null)

        if (!existing) {
          return NextResponse.json({ error: 'Connection record not found in provider collection.' }, { status: 404 })
        }

        // Dry-run reconciliation: inspects credentials and configuration without sending live external network calls,
        // charges, emails, or posts.
        const reconciliation = reconcileProviderState({
          providerKey: String((existing as any).providerKey || (existing as any).network || 'generic'),
          status: String((existing as any).status || (existing as any).credentialHealth || 'active'),
          credentialRef: (existing as any).credentialReference || (existing as any).connectionReference || (existing as any).encryptedApiKey || null,
          scopes: Array.isArray((existing as any).scopes) ? (existing as any).scopes : [],
          expiresAt: (existing as any).expiresAt || (existing as any).credentialExpiresAt || null,
        })

        const updateData: Record<string, any> = {}
        if (body.collection === 'pod-connections') {
          updateData.lastHealthCheckedAt = reconciliation.lastHealthCheckAt
          updateData.lastHealthStatus = reconciliation.healthState === 'healthy' ? 'ok' : 'degraded'
        } else if (body.collection === 'social-accounts') {
          updateData.lastVerifiedAt = reconciliation.lastHealthCheckAt
        } else if (body.collection === 'ai-connections') {
          updateData.lastTestedAt = reconciliation.lastHealthCheckAt
        }

        if (Object.keys(updateData).length > 0) {
          await payload.update({
            collection: body.collection as never,
            id: body.connectionId,
            data: updateData as never,
            overrideAccess: true,
          }).catch(() => null)
        }

        await payload.create({
          collection: 'integration-audit-events' as never,
          data: {
            site: (existing as any).site || defaultSiteId,
            action: 'connection.reconciled',
            subject: {
              collection: body.collection,
              connectionId: body.connectionId,
              providerKey: (existing as any).providerKey || (existing as any).network,
              dryRun: true,
              reconciliation,
            },
            outcome: reconciliation.healthState === 'healthy' ? 'allowed' : 'failed',
            occurredAt: new Date().toISOString(),
          } as never,
          overrideAccess: true,
        }).catch(() => null)

        return NextResponse.json({
          reconciliation,
          message: 'Provider connection reconciled in safe dry-run mode (zero external transactions).',
        })
      }

      case 'disconnect-provider': {
        if (!body.connectionId || !body.collection) {
          return NextResponse.json({ error: 'connectionId and collection are required.' }, { status: 422 })
        }

        const existing = await payload.findByID({
          collection: body.collection as never,
          id: body.connectionId,
          depth: 0,
          overrideAccess: true,
        }).catch(() => null)

        if (!existing) {
          return NextResponse.json({ error: 'Connection record not found.' }, { status: 404 })
        }

        const safeDisconnect = safeDisconnectProviderState({
          providerKey: String((existing as any).providerKey || (existing as any).network || 'provider'),
          label: String((existing as any).label || (existing as any).displayName || 'Connection'),
        })

        // Preserve all canonical records, orders, audit logs. Only clear active secret references and set status disabled/revoked.
        const updateData: Record<string, any> = {}
        if (body.collection === 'merchant-connections') {
          updateData.status = 'disabled'
          updateData.credentialReference = null
        } else if (body.collection === 'social-accounts') {
          updateData.credentialHealth = 'revoked'
          updateData.connectionReference = null
        } else if (body.collection === 'pod-connections') {
          updateData.status = 'disabled'
          updateData.disabledReason = 'Disconnected safely by operator'
        } else if (body.collection === 'ai-connections') {
          updateData.status = 'disabled'
        } else if (body.collection === 'api-clients') {
          updateData.revokedAt = safeDisconnect.revokedAt
        } else if (body.collection === 'webhook-subscriptions') {
          updateData.status = 'disabled'
        }

        await payload.update({
          collection: body.collection as never,
          id: body.connectionId,
          data: updateData as never,
          overrideAccess: true,
        })

        await payload.create({
          collection: 'integration-audit-events' as never,
          data: {
            site: (existing as any).site || defaultSiteId,
            action: safeDisconnect.auditAction,
            subject: {
              collection: body.collection,
              connectionId: body.connectionId,
              label: (existing as any).label || (existing as any).displayName,
              canonicalDataPreserved: true,
            },
            outcome: 'allowed',
            occurredAt: safeDisconnect.revokedAt,
          } as never,
          overrideAccess: true,
        }).catch(() => null)

        return NextResponse.json({
          success: true,
          message: safeDisconnect.message,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Operation failed.' },
      { status: 500 },
    )
  }
}
