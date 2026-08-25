import type { Capability, Iso8601Instant, SemVer, SemVerRange } from '../core/contracts'

export const CAPABILITY_KEYS = [
  'social.publish.text',
  'email.transactional',
  'ai.text.rewrite',
  'ai.text.structured',
  'ai.image.assist',
  'ai.agent.tool_call',
  'grammar.local.check',
  'grammar.ai.suggest',
  'identity.oauth',
  'wallet.connect.evm',
  'wallet.connect.solana',
  'identity.wallet.siwx',
  'messaging.realtime',
  'messaging.external_delivery',
  'federation.activitypub.actor',
  'federation.atproto.publish',
  'graph.project.events',
  'graph.timeline.suggest',
  'scraper.events.import',
  'payments.method.list_eligible',
  'payments.checkout.one_time',
  'payments.subscription.recurring',
  'payments.refund',
  'patron.members.sync',
  'crypto.payment.verify',
  'content.hash.anchor',
  'storage.object',
  'commerce.orders',
] as const satisfies readonly Capability['key'][]
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]
export type ExtensionFamily = 'module' | 'theme' | 'provider' | 'trusted-plugin'
export type ConnectionGroup =
  | 'Social'
  | 'Media'
  | 'AI'
  | 'Payments & Support'
  | 'Commerce'
  | 'Fulfillment'
  | 'Email'
  | 'Analytics'
  | 'Identity'
  | 'Messaging'
  | 'Security'
export type ConnectionScope = {
  siteId: string
  publicationId?: string
  spaceId?: string
  memberId?: string
}

export type ResourceBudget = {
  baseline: string
  peak: string
  separateWorker: boolean
  externalProvider: boolean
  concurrency: number
  degradedMode: string
}
export type ExtensionManifest = {
  key: `${string}.${string}`
  version: SemVer
  family: ExtensionFamily
  compatibleCore: SemVerRange
  compatibleSchema: SemVerRange
  dependencies: readonly `${string}.${string}`[]
  conflicts: readonly `${string}.${string}`[]
  provides: readonly CapabilityKey[]
  requires: readonly CapabilityKey[]
  permissions: readonly string[]
  configSchema: { version: number; jsonSchema: Record<string, unknown> }
  migrations: { owner: string; versions: readonly string[] }
  failureMode: 'fail-closed' | 'degraded' | 'disabled'
  dataOwner: string
  exportOwner: string
  retention: 'shared-policy-required' | 'module-owned'
  uninstall: 'retain' | 'archive' | 'export' | 'delete-confirmed'
  budget: ResourceBudget
}
export type ProviderContract = ExtensionManifest & {
  family: 'provider'
  group: ConnectionGroup
  contractVersion: number
  authorization: { modes: readonly string[]; minimumScopes: readonly string[] }
  rateLimits: {
    requestsPerMinute?: number
    retryAfterHeader?: string
    idempotency: 'required' | 'supported' | 'none'
  }
  ownership: { canonicalData: 'renegade'; remoteData: 'provider'; portability: string }
  disconnect: { revokeRemote: boolean; preserveCanonicalData: boolean; callbackOwner: string }
}
export type ConnectionRecord = ConnectionScope & {
  id: string
  providerKey: string
  externalAccountId: string
  label: string
  status: 'configured' | 'active' | 'expired' | 'invalid' | 'disabled' | 'disconnected'
  encryptedSecretRef: string | null
  scopes: readonly string[]
  expiresAt: Iso8601Instant | null
  refreshMetadata: Record<string, unknown> | null
  capabilities: readonly Capability[]
  lastHealthCheckAt: Iso8601Instant | null
  lastError: NormalizedProviderError | null
  auditEventIds: readonly string[]
}
export type NormalizedProviderError = {
  code:
    | 'unauthorized'
    | 'expired_credentials'
    | 'rate_limited'
    | 'transient'
    | 'invalid_request'
    | 'unavailable'
    | 'revoked'
  message: string
  retryable: boolean
  retryAfterSeconds?: number
}
export type ProviderAdapter = {
  contract: ProviderContract
  test(connection: ConnectionRecord): Promise<{ capabilities: readonly Capability[] }>
  execute(
    input: { capability: CapabilityKey; payload: Record<string, unknown>; idempotencyKey: string },
    connection: ConnectionRecord,
  ): Promise<Record<string, unknown>>
  revoke?(connection: ConnectionRecord): Promise<void>
}

export type ToolManifest = {
  name: string
  version: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  permission: string
  dataSensitivity: 'public' | 'member' | 'staff' | 'restricted'
  rateLimit: string
  idempotency: 'required' | 'supported' | 'none'
  approval: 'never' | 'always'
  timeoutMs: number
  audit: 'required'
  rollback: 'none' | 'compensating-action'
  capability?: CapabilityKey
}
export type AgentRun = {
  id: string
  agentId: string
  status: 'running' | 'awaiting-approval' | 'completed' | 'denied'
  toolCalls: ToolCall[]
}
export type ToolCall = {
  id: string
  tool: string
  input: Record<string, unknown>
  output?: Record<string, unknown>
  status: 'proposed' | 'approved' | 'denied' | 'completed'
  auditId: string
}
export type ApprovalRequest = {
  id: string
  toolCallId: string
  reason: string
  status: 'pending' | 'approved' | 'denied'
}
export type ResourceProfile = 'Lean' | 'Standard' | 'Media' | 'Scale'
