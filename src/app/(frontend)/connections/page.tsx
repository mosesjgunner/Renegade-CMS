import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { ConnectionsCenter } from '@/modules/extensions/ConnectionsCenter'
import type { ConnectionGroup, ConnectionRecord } from '@/modules/extensions/contracts'

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
  return 'Security'
}

export default async function ConnectionsPage() {
  const connections: ConnectionRecord[] = []

  try {
    const payload = await getPayload({ config: configPromise })

    // 1. Merchant connections
    try {
      const merchants = await payload.find({
        collection: 'merchant-connections' as never,
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of merchants.docs as any[]) {
        connections.push({
          id: String(doc.id),
          siteId: String(doc.site ?? 'default'),
          providerKey: String(doc.providerKey || 'merchant'),
          externalAccountId: String(doc.merchantCountry || 'default'),
          label: String(doc.label || doc.providerKey || 'Merchant Gateway'),
          status:
            doc.status === 'active'
              ? 'active'
              : doc.status === 'degraded'
                ? 'degraded'
                : 'disabled',
          encryptedSecretRef: doc.credentialReference ?? null,
          scopes: ['payments.checkout.one_time', 'payments.subscription.recurring'],
          expiresAt: null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: null,
          lastError: null,
          auditEventIds: [],
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
        connections.push({
          id: String(doc.id),
          siteId: String(doc.site ?? 'default'),
          providerKey: String(doc.network || 'social'),
          externalAccountId: String(doc.externalAccountId || doc.id),
          label: String(doc.displayName || doc.network || 'Social Account'),
          status:
            doc.credentialHealth === 'healthy'
              ? 'active'
              : doc.credentialHealth === 'expired'
                ? 'expired'
                : 'configured',
          encryptedSecretRef: doc.connectionReference ?? null,
          scopes: ['social.publish.text'],
          expiresAt: doc.credentialExpiresAt ? String(doc.credentialExpiresAt) : null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: null,
          lastError: null,
          auditEventIds: [],
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
        connections.push({
          id: String(doc.id),
          siteId: String(doc.site ?? 'default'),
          providerKey: 'api-client',
          externalAccountId: String(doc.tokenPrefix || doc.id),
          label: String(doc.name || 'API Client'),
          status: doc.revokedAt ? 'revoked' : 'active',
          encryptedSecretRef: null,
          scopes: Array.isArray(doc.scopes) ? doc.scopes.map(String) : [],
          expiresAt: doc.expiresAt ? String(doc.expiresAt) : null,
          refreshMetadata: null,
          capabilities: [],
          lastHealthCheckAt: null,
          lastError: null,
          auditEventIds: [],
        })
      }
    } catch {
      // module might be disabled in current profile
    }
  } catch {
    // payload initialization fallback
  }

  return <ConnectionsCenter connections={connections} groupFor={determineGroup} />
}
