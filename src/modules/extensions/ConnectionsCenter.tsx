'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ConnectionGroup, ConnectionRecord } from './contracts'
import {
  INTEGRATION_SCOPES,
  type WebhookDeliveryDiagnosis,
} from '../integrations/service'

export type OperationalConnection = Omit<ConnectionRecord, 'status'> & {
  status: ConnectionRecord['status'] | 'unconfigured'
  collection?: string
  group?: ConnectionGroup
  lastSuccessAt?: string | null
  healthState?: 'healthy' | 'warning' | 'critical' | 'unknown'
  nextSafeRepairAction?: string
  unconfiguredFeatures?: string[]
  isUnknown?: boolean
  canRotateSecret?: boolean
  canDisconnect?: boolean
  failureCount?: number
  target?: string
  secretRef?: string
}

export type WebhookDeliveryItem = {
  id: string
  subscriptionId: string
  eventId: string
  eventType: string
  state: 'queued' | 'delivered' | 'retrying' | 'dead-letter'
  attempts: number
  nextAttemptAt?: string | null
  redactedResponse?: string | null
  lastError?: string | null
  diagnosis?: WebhookDeliveryDiagnosis
}

export type IntegrationAuditItem = {
  id: string
  action: string
  outcome: 'allowed' | 'denied' | 'failed'
  occurredAt: string
  client?: any
  subject?: any
}

const groups: readonly ConnectionGroup[] = [
  'Security',
  'Webhooks',
  'Payments & Support',
  'Fulfillment',
  'Social',
  'AI',
  'Email',
  'Analytics',
  'Messaging',
  'Media',
  'Commerce',
  'Identity',
]

const groupIcons: Record<ConnectionGroup, string> = {
  Security: '🔒',
  Webhooks: '⚡',
  'Payments & Support': '💳',
  Fulfillment: '📦',
  Social: '💬',
  AI: '🧠',
  Email: '✉️',
  Analytics: '📊',
  Messaging: '📨',
  Media: '🎬',
  Commerce: '🛍️',
  Identity: '🆔',
}

export function ConnectionsCenter({
  connections: initialConnections,
  deliveries: initialDeliveries = [],
  auditEvents: initialAuditEvents = [],
  groupFor,
  isStaff = true,
}: {
  connections: readonly OperationalConnection[]
  deliveries?: readonly WebhookDeliveryItem[]
  auditEvents?: readonly IntegrationAuditItem[]
  groupFor?: (providerKey: string) => ConnectionGroup
  isStaff?: boolean
}) {
  const [connections, setConnections] = useState<OperationalConnection[]>([...initialConnections])
  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[]>([...initialDeliveries])
  const [auditEvents, setAuditEvents] = useState<IntegrationAuditItem[]>([...initialAuditEvents])
  
  const [activeTab, setActiveTab] = useState<'overview' | 'webhooks' | 'vault' | 'audit'>('overview')
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [filterHealth, setFilterHealth] = useState<'all' | 'attention' | 'healthy' | 'unknown'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDeliveryItem | null>(null)
  const [isRedelivering, setIsRedelivering] = useState<string | null>(null)
  const [isReconciling, setIsReconciling] = useState<string | null>(null)
  const [disconnectModal, setDisconnectModal] = useState<OperationalConnection | null>(null)
  
  // Modals
  const [createClientModal, setCreateClientModal] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientScopes, setNewClientScopes] = useState<string[]>(['content.read'])
  const [generatedToken, setGeneratedToken] = useState<{ token: string; prefix: string } | null>(null)

  const [createWebhookModal, setCreateWebhookModal] = useState(false)
  const [webhookTarget, setWebhookTarget] = useState('')
  const [webhookSecretRef, setWebhookSecretRef] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['content.created', 'order.paid'])

  const [rotateSecretModal, setRotateSecretModal] = useState<OperationalConnection | null>(null)
  const [rotateNewSecretRef, setRotateNewSecretRef] = useState('')
  const [busyAction, setBusyAction] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type })
    setTimeout(() => setFeedback(null), 6000)
  }

  const getEffectiveGroup = (conn: OperationalConnection): ConnectionGroup => {
    if (conn.group) return conn.group
    if (groupFor) return groupFor(conn.providerKey)
    if (conn.providerKey.startsWith('client-') || conn.providerKey === 'api-client') return 'Security'
    if (conn.providerKey === 'webhook' || conn.collection === 'webhook-subscriptions') return 'Webhooks'
    if (conn.providerKey.startsWith('social.') || ['mastodon', 'bluesky', 'x'].includes(conn.providerKey)) return 'Social'
    if (['stripe', 'paypal', 'square', 'offline', 'merchant'].includes(conn.providerKey)) return 'Payments & Support'
    if (conn.providerKey.startsWith('pod-') || ['printful', 'printify', 'gelato'].includes(conn.providerKey)) return 'Fulfillment'
    if (conn.providerKey.startsWith('ai.') || ['openai', 'anthropic', 'google-genai', 'groq'].includes(conn.providerKey)) return 'AI'
    return 'Security'
  }

  // Live reconciliation action (strictly dry-run, no charges/external calls)
  const handleReconcile = async (conn: OperationalConnection) => {
    setIsReconciling(conn.id)
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'reconcile-provider',
          connectionId: conn.id,
          collection: conn.collection || (conn.providerKey === 'api-client' ? 'api-clients' : 'merchant-connections'),
          providerKey: conn.providerKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reconciliation failed.')
      
      setConnections((prev) =>
        prev.map((c) =>
          c.id === conn.id
            ? {
                ...c,
                lastHealthCheckAt: data.reconciliation.lastHealthCheckAt,
                lastSuccessAt: data.reconciliation.lastSuccessAt || c.lastSuccessAt,
                healthState: data.reconciliation.healthState,
                nextSafeRepairAction: data.reconciliation.nextSafeRepairAction,
                unconfiguredFeatures: data.reconciliation.unconfiguredFeatures,
                isUnknown: false,
              }
            : c,
        ),
      )
      showFeedback(data.message || 'Provider connection reconciled in dry-run mode.', 'success')
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Reconciliation check failed.', 'error')
    } finally {
      setIsReconciling(null)
    }
  }

  // Safe disconnect action
  const handleSafeDisconnect = async (conn: OperationalConnection) => {
    setBusyAction(true)
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'disconnect-provider',
          connectionId: conn.id,
          collection: conn.collection || 'api-clients',
          providerKey: conn.providerKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Disconnect failed.')

      setConnections((prev) =>
        prev.map((c) =>
          c.id === conn.id
            ? {
                ...c,
                status: 'disconnected',
                healthState: 'critical',
                nextSafeRepairAction: 'Connection is disconnected. Re-issue credentials to reconnect.',
                canDisconnect: false,
              }
            : c,
        ),
      )
      setDisconnectModal(null)
      showFeedback(data.message || 'Connection safely disconnected. Canonical data preserved.', 'success')
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Disconnect failed.', 'error')
    } finally {
      setBusyAction(false)
    }
  }

  // Manual redelivery action
  const handleRedeliver = async (deliveryId: string) => {
    setIsRedelivering(deliveryId)
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'redeliver-webhook', deliveryId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Redelivery request failed.')

      showFeedback('Redelivery enqueued with fresh idempotency envelope.', 'success')
      if (data.delivery) {
        setDeliveries((prev) => [
          {
            id: String(data.delivery.id),
            subscriptionId: String(data.delivery.subscription),
            eventId: String(data.delivery.eventId),
            eventType: String(data.delivery.eventType),
            state: 'queued',
            attempts: 0,
            diagnosis: {
              category: 'delivered',
              statusCode: null,
              explanation: 'Queued for immediate delivery attempt.',
              nextSafeRepairAction: 'Delivery in progress.',
              canRedeliver: false,
              backoffDelaySeconds: null,
              isDeadLetter: false,
            },
          },
          ...prev,
        ])
      }
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to redeliver.', 'error')
    } finally {
      setIsRedelivering(null)
    }
  }

  // Create Machine Client
  const handleCreateClient = async () => {
    if (!newClientName.trim()) return
    setBusyAction(true)
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create-client',
          name: newClientName,
          scopes: newClientScopes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create client.')

      setGeneratedToken({ token: data.token, prefix: data.tokenPrefix })
      setConnections((prev) => [
        {
          id: String(data.client.id),
          collection: 'api-clients',
          group: 'Security',
          providerKey: 'api-client',
          label: String(data.client.name),
          externalAccountId: String(data.tokenPrefix),
          status: 'active',
          healthState: 'healthy',
          scopes: newClientScopes,
          expiresAt: null,
          lastSuccessAt: null,
          lastHealthCheckAt: new Date().toISOString(),
          nextSafeRepairAction: 'New client ready. Store token securely in external client.',
          unconfiguredFeatures: [],
          isUnknown: false,
          canRotateSecret: true,
          canDisconnect: true,
          siteId: 'default',
          auditEventIds: [],
          capabilities: [],
          encryptedSecretRef: null,
          lastError: null,
          refreshMetadata: null,
        },
        ...prev,
      ])
      showFeedback('Machine credential created successfully.', 'success')
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to issue credential.', 'error')
    } finally {
      setBusyAction(false)
    }
  }

  // Rotate Secret
  const handleRotateSecret = async () => {
    if (!rotateSecretModal) return
    setBusyAction(true)
    try {
      const isClient = rotateSecretModal.collection === 'api-clients'
      const body = isClient
        ? { action: 'rotate-client-secret', clientId: rotateSecretModal.id }
        : { action: 'rotate-webhook-secret', subscriptionId: rotateSecretModal.id, secretRef: rotateNewSecretRef }

      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Rotation failed.')

      if (isClient && data.token) {
        setGeneratedToken({ token: data.token, prefix: data.tokenPrefix })
      }

      setConnections((prev) =>
        prev.map((c) =>
          c.id === rotateSecretModal.id
            ? {
                ...c,
                status: 'active',
                healthState: 'healthy',
                lastSuccessAt: new Date().toISOString(),
                lastHealthCheckAt: new Date().toISOString(),
                nextSafeRepairAction: 'Secret rotated. Client or receiver synchronized.',
              }
            : c,
        ),
      )
      setRotateSecretModal(null)
      showFeedback(data.message || 'Secret successfully rotated.', 'success')
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Secret rotation failed.', 'error')
    } finally {
      setBusyAction(false)
    }
  }

  // Create Webhook Subscription
  const handleCreateWebhook = async () => {
    if (!webhookTarget.trim() || !webhookSecretRef.trim()) return
    setBusyAction(true)
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create-webhook',
          target: webhookTarget.trim(),
          secretRef: webhookSecretRef.trim(),
          events: webhookEvents,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to register webhook.')

      const sub = data.subscription
      setConnections((prev) => [
        {
          id: String(sub.id),
          collection: 'webhook-subscriptions',
          group: 'Webhooks',
          providerKey: 'webhook',
          label: `Webhook: ${new URL(webhookTarget).pathname}`,
          externalAccountId: webhookTarget,
          status: 'active',
          healthState: 'healthy',
          scopes: webhookEvents,
          expiresAt: null,
          lastSuccessAt: new Date().toISOString(),
          lastHealthCheckAt: new Date().toISOString(),
          nextSafeRepairAction: 'Healthy. Receiving challenge verified.',
          unconfiguredFeatures: [],
          isUnknown: false,
          canRotateSecret: true,
          canDisconnect: true,
          siteId: 'default',
          auditEventIds: [],
          capabilities: [],
          encryptedSecretRef: null,
          lastError: null,
          refreshMetadata: null,
        },
        ...prev,
      ])
      setCreateWebhookModal(false)
      setWebhookTarget('')
      setWebhookSecretRef('')
      showFeedback('Webhook subscription verified and created.', 'success')
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to register webhook.', 'error')
    } finally {
      setBusyAction(false)
    }
  }

  // Filter connections
  const filteredConnections = connections.filter((conn) => {
    const group = getEffectiveGroup(conn)
    if (selectedGroup !== 'all' && group !== selectedGroup) return false
    if (filterHealth === 'attention' && conn.healthState !== 'warning' && conn.healthState !== 'critical') return false
    if (filterHealth === 'healthy' && conn.healthState !== 'healthy') return false
    if (filterHealth === 'unknown' && !conn.isUnknown && conn.status !== 'unconfigured') return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        conn.label.toLowerCase().includes(q) ||
        conn.providerKey.toLowerCase().includes(q) ||
        conn.externalAccountId.toLowerCase().includes(q) ||
        (conn.nextSafeRepairAction && conn.nextSafeRepairAction.toLowerCase().includes(q))
      )
    }
    return true
  })

  const stats = {
    total: connections.length,
    healthy: connections.filter((c) => c.healthState === 'healthy' || c.status === 'active').length,
    attention: connections.filter((c) => c.healthState === 'warning' || c.healthState === 'critical' || c.status === 'degraded' || c.status === 'expired').length,
    unknown: connections.filter((c) => c.isUnknown || c.status === 'unconfigured').length,
    pendingRetries: deliveries.filter((d) => d.state === 'retrying' || d.state === 'dead-letter').length,
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 space-y-8 font-sans">
      {/* Top Banner Alert */}
      {feedback && (
        <div
          role="alert"
          className={`p-4 rounded-xl text-sm flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline ml-4 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-3xl">⚡</span>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-950 dark:text-stone-50 font-display">
              Connections & Integrations
            </h1>
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Operational center for external APIs, webhooks, payment processors, and AI agents with zero secret leakage.
          </p>
        </div>

        {isStaff && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setGeneratedToken(null)
                setCreateClientModal(true)
              }}
              className="btn btn-primary text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90"
              id="btn-issue-client-token"
            >
              <span>🔑</span>
              <span>Issue API Client</span>
            </button>
            <button
              onClick={() => setCreateWebhookModal(true)}
              className="btn btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-900 dark:text-stone-100"
              id="btn-add-webhook"
            >
              <span>⚡</span>
              <span>Add Webhook</span>
            </button>
            <Link
              href="/admin"
              className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-300 px-2 py-1"
            >
              Studio &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Operational KPI Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 flex flex-col">
          <span className="text-xs font-medium text-stone-500">Connected Integrations</span>
          <span className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 font-mono">
            {stats.total}
          </span>
          <span className="text-[11px] text-stone-400 mt-1">Across all provider categories</span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 flex flex-col">
          <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Verified Succeeded</span>
          <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 font-mono">
            {stats.healthy}
          </span>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-1">Active & health acknowledged</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 flex flex-col">
          <span className="text-xs font-medium text-amber-800 dark:text-amber-300">Needs Attention</span>
          <span className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1 font-mono">
            {stats.attention}
          </span>
          <span className="text-[11px] text-amber-600 dark:text-amber-500 mt-1">Degraded, expired, or retrying</span>
        </div>

        <div className="p-4 rounded-xl bg-stone-50/80 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 flex flex-col">
          <span className="text-xs font-medium text-stone-500">Unknown / Unconfigured</span>
          <span className="text-2xl font-bold text-stone-700 dark:text-stone-300 mt-1 font-mono">
            {stats.unknown}
          </span>
          <span className="text-[11px] text-stone-400 mt-1">Pending setup or check</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200 dark:border-stone-800 gap-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-300'
          }`}
          id="tab-overview"
        >
          All Providers & Health ({connections.length})
        </button>

        <button
          onClick={() => setActiveTab('webhooks')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'webhooks'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-300'
          }`}
          id="tab-webhooks"
        >
          <span>Webhooks & Deliveries</span>
          {stats.pendingRetries > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-mono">
              {stats.pendingRetries}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('vault')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'vault'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-300'
          }`}
          id="tab-vault"
        >
          Key Vault & Machine Scopes
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-300'
          }`}
          id="tab-audit"
        >
          Canonical Audit Trail
        </button>
      </div>

      {/* TAB 1: OVERVIEW & HEALTH GRID */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-stone-50/60 dark:bg-stone-900/40 p-3 rounded-xl border border-stone-200 dark:border-stone-800">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search provider, scope, or repair action…"
                className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 w-64 focus:outline-none focus:ring-1 focus:ring-red-500"
              />

              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none"
              >
                <option value="all">All Categories</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {groupIcons[g]} {g}
                  </option>
                ))}
              </select>

              <select
                value={filterHealth}
                onChange={(e) => setFilterHealth(e.target.value as any)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none"
              >
                <option value="all">All Health States</option>
                <option value="attention">⚠️ Needs Attention</option>
                <option value="healthy">✓ Verified Healthy</option>
                <option value="unknown">❓ Unknown / Unconfigured</option>
              </select>
            </div>

            <span className="text-xs text-stone-500 font-mono">
              Showing {filteredConnections.length} of {connections.length}
            </span>
          </div>

          {/* Connections Grid */}
          {filteredConnections.length === 0 ? (
            <div className="text-center py-12 bg-stone-50/50 dark:bg-stone-900/20 rounded-2xl border border-stone-200 dark:border-stone-800">
              <span className="text-3xl block mb-2">🔍</span>
              <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">No matching integrations found</p>
              <p className="text-xs text-stone-500 mt-1">Adjust your filters or add a new connection.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredConnections.map((conn) => {
                const group = getEffectiveGroup(conn)
                const isHealthy = conn.healthState === 'healthy' || conn.status === 'active'
                const isDegraded = conn.healthState === 'warning' || conn.status === 'degraded' || conn.status === 'expired'
                const isUnknown = conn.isUnknown || conn.status === 'unconfigured'

                return (
                  <div
                    key={conn.id}
                    className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-stone-300 dark:hover:border-stone-700 transition-all"
                  >
                    <div className="space-y-3">
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl p-1.5 rounded-lg bg-stone-100 dark:bg-stone-800">
                            {groupIcons[group] || '⚡'}
                          </span>
                          <div>
                            <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                              {conn.label}
                            </h3>
                            <p className="text-[11px] text-stone-400 font-mono truncate max-w-[180px]">
                              {conn.externalAccountId}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                            isHealthy
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : isDegraded
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : isUnknown
                                  ? 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {conn.status}
                        </span>
                      </div>

                      {/* Scopes */}
                      {conn.scopes && conn.scopes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {conn.scopes.slice(0, 3).map((scope) => (
                            <span
                              key={scope}
                              className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800/80 font-mono text-[10px] text-stone-600 dark:text-stone-300"
                            >
                              {scope}
                            </span>
                          ))}
                          {conn.scopes.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800/80 font-mono text-[10px] text-stone-400">
                              +{conn.scopes.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : null}

                      {/* Status Telemetry */}
                      <div className="pt-2 border-t border-stone-100 dark:border-stone-800/60 text-[11px] space-y-1 font-mono">
                        <div className="flex items-center justify-between text-stone-500">
                          <span>What actually succeeded:</span>
                          <span className={conn.lastSuccessAt ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-stone-400'}>
                            {conn.lastSuccessAt
                              ? new Date(conn.lastSuccessAt).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'None verified'}
                          </span>
                        </div>

                        {conn.unconfiguredFeatures && conn.unconfiguredFeatures.length > 0 && (
                          <div className="flex items-center justify-between text-stone-400">
                            <span>Unconfigured:</span>
                            <span className="text-amber-600 dark:text-amber-400">
                              {conn.unconfiguredFeatures.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Next Safe Repair Action Callout */}
                      <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-950/60 border border-stone-200/80 dark:border-stone-800 text-[11px] space-y-1">
                        <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300 font-semibold">
                          <span>🛠️ Next Safe Repair:</span>
                        </div>
                        <p className="text-stone-600 dark:text-stone-400 leading-snug">
                          {conn.nextSafeRepairAction || 'No repair action needed; connection is stable.'}
                        </p>
                      </div>
                    </div>

                    {/* Operational Action Buttons */}
                    <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleReconcile(conn)}
                          disabled={isReconciling === conn.id}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 disabled:opacity-50 transition-colors"
                          title="Reconcile provider connectivity safely without making external charges or posts"
                        >
                          {isReconciling === conn.id ? 'Checking…' : 'Reconcile'}
                        </button>

                        {conn.canRotateSecret && (
                          <button
                            onClick={() => {
                              setRotateNewSecretRef('')
                              setRotateSecretModal(conn)
                            }}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 transition-colors"
                          >
                            Rotate
                          </button>
                        )}
                      </div>

                      {conn.canDisconnect && (
                        <button
                          onClick={() => setDisconnectModal(conn)}
                          className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WEBHOOKS & DELIVERIES HUB */}
      {activeTab === 'webhooks' && (
        <div className="space-y-8">
          {/* Webhook Deliveries Log */}
          <div className="surface-card p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 dark:border-stone-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <span>📨</span> Webhook Delivery History & Diagnosis
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Inspection of outbound event envelopes, HTTP response status, redaction, and bounded retry timers.
                </p>
              </div>

              <span className="text-xs text-stone-400 font-mono">
                {deliveries.length} recent deliveries
              </span>
            </div>

            {deliveries.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400 italic">
                No outbound webhook deliveries recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-400">
                      <th className="py-2 pr-4 font-semibold">Event ID / Type</th>
                      <th className="py-2 px-4 font-semibold">State</th>
                      <th className="py-2 px-4 font-semibold">Attempts</th>
                      <th className="py-2 px-4 font-semibold">Next Attempt / Status</th>
                      <th className="py-2 pl-4 text-right font-semibold">Diagnosis & Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {deliveries.map((delivery) => {
                      const isDelivered = delivery.state === 'delivered'
                      const isDeadLetter = delivery.state === 'dead-letter'
                      const isRetrying = delivery.state === 'retrying'

                      return (
                        <tr key={delivery.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/40">
                          <td className="py-3 pr-4">
                            <span className="font-bold text-stone-900 dark:text-stone-100 block">
                              {delivery.eventType}
                            </span>
                            <span className="text-[10px] text-stone-400 block truncate max-w-xs">
                              {delivery.eventId}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                                isDelivered
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : isRetrying
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : isDeadLetter
                                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                      : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                              }`}
                            >
                              {delivery.state}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span>{delivery.attempts} / 5</span>
                          </td>

                          <td className="py-3 px-4 text-stone-500">
                            {delivery.nextAttemptAt ? (
                              <span>Retry: {new Date(delivery.nextAttemptAt).toLocaleTimeString()}</span>
                            ) : isDelivered ? (
                              <span className="text-emerald-600">Completed</span>
                            ) : isDeadLetter ? (
                              <span className="text-rose-600 font-semibold">Exceeded max attempts</span>
                            ) : (
                              'Pending'
                            )}
                          </td>

                          <td className="py-3 pl-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setSelectedDelivery(delivery)}
                                className="text-[11px] text-stone-700 dark:text-stone-300 underline font-sans"
                              >
                                Diagnose
                              </button>

                              {!isDelivered && (
                                <button
                                  onClick={() => handleRedeliver(delivery.id)}
                                  disabled={isRedelivering === delivery.id}
                                  className="text-[11px] px-2.5 py-1 rounded bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-sans hover:opacity-90 disabled:opacity-50"
                                >
                                  {isRedelivering === delivery.id ? 'Queuing…' : 'Redeliver'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: KEY VAULT & MACHINE SCOPES */}
      {activeTab === 'vault' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3.5">
            <span className="text-2xl">🛡️</span>
            <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-bold">Zero-Secret Vault Guarantee</p>
              <p className="text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                Machine API client tokens are hashed one-way using SHA-256 before persistence. Secret values are never returned by the database or transmitted in UI state. Webhook secrets must point to valid environment or vault references.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {connections
              .filter((c) => c.providerKey === 'api-client' || c.collection === 'api-clients')
              .map((client) => (
                <div
                  key={client.id}
                  className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                        {client.label}
                      </h4>
                      <p className="text-xs text-stone-400 font-mono">
                        Prefix: {client.externalAccountId}
                      </p>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                        client.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      {client.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-stone-500">Granted Scopes:</span>
                    <div className="flex flex-wrap gap-1">
                      {client.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 font-mono text-[10px] text-stone-600 dark:text-stone-300"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-400 font-mono flex items-center justify-between">
                    <span>Last used: {client.lastSuccessAt ? new Date(client.lastSuccessAt).toLocaleDateString() : 'Never'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setRotateNewSecretRef('')
                          setRotateSecretModal(client)
                        }}
                        className="text-stone-700 dark:text-stone-300 underline font-sans"
                      >
                        Rotate Token
                      </button>
                      {client.status === 'active' && (
                        <button
                          onClick={() => setDisconnectModal(client)}
                          className="text-rose-600 dark:text-rose-400 underline font-sans"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 4: CANONICAL AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="surface-card p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Integration Audit Events
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Canonical, immutable record of authorization, secret rotations, and redeliveries.
              </p>
            </div>
            <span className="text-xs text-stone-400 font-mono">
              {auditEvents.length} events logged
            </span>
          </div>

          {auditEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400 italic">
              No audit events found in this tenant scope.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-400">
                    <th className="py-2 pr-4 font-semibold">Timestamp</th>
                    <th className="py-2 px-4 font-semibold">Action</th>
                    <th className="py-2 px-4 font-semibold">Outcome</th>
                    <th className="py-2 pl-4 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {auditEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/40">
                      <td className="py-2.5 pr-4 text-stone-500">
                        {new Date(event.occurredAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-stone-900 dark:text-stone-100">
                        {event.action}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                            event.outcome === 'allowed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {event.outcome}
                        </span>
                      </td>
                      <td className="py-2.5 pl-4 text-stone-500 truncate max-w-sm">
                        {event.subject ? JSON.stringify(event.subject) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: DELIVERY DIAGNOSIS & MANUAL REDELIVERY */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">
                  Delivery Diagnosis: {selectedDelivery.eventType}
                </h3>
                <p className="text-xs text-stone-400 font-mono">
                  Event ID: {selectedDelivery.eventId}
                </p>
              </div>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 font-mono">
                <div>
                  <span className="text-stone-400 block text-[10px]">State</span>
                  <span className="font-bold uppercase text-stone-800 dark:text-stone-200">
                    {selectedDelivery.state}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px]">Attempts</span>
                  <span className="font-bold text-stone-800 dark:text-stone-200">
                    {selectedDelivery.attempts} / 5
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px]">HTTP Status</span>
                  <span className="font-bold text-stone-800 dark:text-stone-200">
                    {selectedDelivery.diagnosis?.statusCode ?? 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px]">Backoff Delay</span>
                  <span className="font-bold text-stone-800 dark:text-stone-200">
                    {selectedDelivery.diagnosis?.backoffDelaySeconds
                      ? `${selectedDelivery.diagnosis.backoffDelaySeconds}s`
                      : 'None'}
                  </span>
                </div>
              </div>

              {/* Diagnosis Explanation */}
              <div className="space-y-1">
                <span className="font-bold text-stone-700 dark:text-stone-300">Failure Explanation:</span>
                <p className="text-stone-600 dark:text-stone-400 leading-relaxed bg-stone-50 dark:bg-stone-950 p-2.5 rounded-lg border border-stone-200 dark:border-stone-800">
                  {selectedDelivery.diagnosis?.explanation || 'No error details recorded.'}
                </p>
              </div>

              {/* Recommended Next Safe Repair Action */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 space-y-1">
                <span className="font-bold text-amber-900 dark:text-amber-200">
                  🛠️ Next Safe Repair Action:
                </span>
                <p className="text-amber-800/90 dark:text-amber-300/90">
                  {selectedDelivery.diagnosis?.nextSafeRepairAction || 'Verify endpoint availability.'}
                </p>
              </div>

              {/* Redacted Response Preview */}
              {selectedDelivery.redactedResponse && (
                <div className="space-y-1">
                  <span className="font-bold text-stone-500">Redacted Response Payload:</span>
                  <pre className="p-2.5 rounded-lg bg-stone-900 text-stone-100 font-mono text-[10px] overflow-x-auto max-h-32">
                    {selectedDelivery.redactedResponse}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                onClick={() => setSelectedDelivery(null)}
                className="btn btn-secondary text-xs px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700"
              >
                Close
              </button>
              {selectedDelivery.state !== 'delivered' && (
                <button
                  onClick={() => {
                    handleRedeliver(selectedDelivery.id)
                    setSelectedDelivery(null)
                  }}
                  className="btn btn-primary text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90"
                >
                  Manual Redelivery Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE MACHINE CREDENTIAL */}
      {createClientModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">
              Issue Machine API Client
            </h3>
            <p className="text-xs text-stone-500">
              Machine credentials use bearer tokens scoped to specific system permissions. Tokens are hashed one-way.
            </p>

            {generatedToken ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-2">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  ⚠️ Save Your Machine Token Now
                </span>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  This token will never be displayed again. Store it securely in your external client secret vault.
                </p>
                <div className="p-2.5 bg-white dark:bg-stone-900 rounded border border-emerald-200 dark:border-emerald-800 font-mono text-xs break-all select-all text-stone-900 dark:text-stone-100">
                  {generatedToken.token}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(generatedToken.token)
                    showFeedback('Token copied to clipboard.', 'success')
                  }}
                  className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 underline"
                >
                  Copy to Clipboard
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-bold block text-stone-700 dark:text-stone-300 mb-1">
                    Client Name
                  </label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="e.g., Marketing Automation Sync"
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="font-bold block text-stone-700 dark:text-stone-300 mb-1">
                    Granted Scopes
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950">
                    {INTEGRATION_SCOPES.map((scope) => (
                      <label key={scope} className="flex items-center gap-1.5 text-[11px] font-mono">
                        <input
                          type="checkbox"
                          checked={newClientScopes.includes(scope)}
                          onChange={(e) => {
                            if (e.target.checked) setNewClientScopes([...newClientScopes, scope])
                            else setNewClientScopes(newClientScopes.filter((s) => s !== scope))
                          }}
                        />
                        <span>{scope}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                onClick={() => {
                  setCreateClientModal(false)
                  setGeneratedToken(null)
                  setNewClientName('')
                }}
                className="btn btn-secondary text-xs px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700"
              >
                {generatedToken ? 'Done' : 'Cancel'}
              </button>

              {!generatedToken && (
                <button
                  onClick={handleCreateClient}
                  disabled={busyAction || !newClientName.trim()}
                  className="btn btn-primary text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 disabled:opacity-50"
                >
                  {busyAction ? 'Generating…' : 'Generate Credential'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD WEBHOOK */}
      {createWebhookModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">
              Register Webhook Subscription
            </h3>
            <p className="text-xs text-stone-500">
              Outbound webhooks deliver signed event payloads. Renegade verifies the endpoint with a challenge ping before activation.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold block text-stone-700 dark:text-stone-300 mb-1">
                  Target HTTPS URL
                </label>
                <input
                  type="url"
                  value={webhookTarget}
                  onChange={(e) => setWebhookTarget(e.target.value)}
                  placeholder="https://receiver.example.com/api/webhooks"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold block text-stone-700 dark:text-stone-300 mb-1">
                  Secret Reference Key (Vault / Env Key)
                </label>
                <input
                  type="text"
                  value={webhookSecretRef}
                  onChange={(e) => setWebhookSecretRef(e.target.value)}
                  placeholder="e.g., PARTNER_WEBHOOK_SECRET"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono focus:outline-none"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  Reference name only. Raw secrets are never entered or stored in the database.
                </span>
              </div>

              <div>
                <label className="font-bold block text-stone-700 dark:text-stone-300 mb-1">
                  Subscribed Events
                </label>
                <div className="flex flex-wrap gap-2">
                  {['content.created', 'content.updated', 'order.paid', 'member.created', 'subscription.renewed'].map((ev) => (
                    <label key={ev} className="flex items-center gap-1 font-mono text-[11px]">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(ev)}
                        onChange={(e) => {
                          if (e.target.checked) setWebhookEvents([...webhookEvents, ev])
                          else setWebhookEvents(webhookEvents.filter((item) => item !== ev))
                        }}
                      />
                      <span>{ev}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                onClick={() => setCreateWebhookModal(false)}
                className="btn btn-secondary text-xs px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWebhook}
                disabled={busyAction || !webhookTarget.trim() || !webhookSecretRef.trim()}
                className="btn btn-primary text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 disabled:opacity-50"
              >
                {busyAction ? 'Verifying Challenge…' : 'Verify & Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ROTATE SECRET */}
      {rotateSecretModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">
              Rotate Secret: {rotateSecretModal.label}
            </h3>
            <p className="text-xs text-stone-500">
              {rotateSecretModal.collection === 'api-clients'
                ? 'Rotating this machine token will invalidate the previous secret and issue a fresh one-way hashed token.'
                : 'Enter the new secret reference. Renegade will challenge the webhook endpoint with the new secret before committing.'}
            </p>

            {rotateSecretModal.collection !== 'api-clients' && (
              <div>
                <label className="font-bold block text-xs text-stone-700 dark:text-stone-300 mb-1">
                  New Secret Reference Key
                </label>
                <input
                  type="text"
                  value={rotateNewSecretRef}
                  onChange={(e) => setRotateNewSecretRef(e.target.value)}
                  placeholder="NEW_WEBHOOK_SECRET_REF"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono text-xs focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                onClick={() => setRotateSecretModal(null)}
                className="btn btn-secondary text-xs px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRotateSecret}
                disabled={busyAction || (rotateSecretModal.collection !== 'api-clients' && !rotateNewSecretRef.trim())}
                className="btn btn-primary text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 disabled:opacity-50"
              >
                {busyAction ? 'Rotating…' : 'Rotate Secret'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SAFE DISCONNECT */}
      {disconnectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-base">
              <span>⚠️</span>
              <h3>Safe Disconnect Confirmation</h3>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
              Are you sure you want to disconnect <strong>{disconnectModal.label}</strong>?
            </p>
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 text-[11px] text-stone-600 dark:text-stone-300 space-y-1">
              <p className="font-semibold text-stone-900 dark:text-stone-100">Guaranteed Safe Behavior:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Active secrets and tokens are wiped immediately.</li>
                <li>Canonical data (orders, jobs, audit trail) is <strong>strictly preserved</strong>.</li>
                <li>No external charges, refunds, or destructive remote posts occur.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                onClick={() => setDisconnectModal(null)}
                className="btn btn-secondary text-xs px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSafeDisconnect(disconnectModal)}
                disabled={busyAction}
                className="btn btn-danger text-xs px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busyAction ? 'Disconnecting…' : 'Confirm Safe Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
