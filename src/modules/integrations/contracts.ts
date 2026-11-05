export const INTEGRATION_API_VERSION = 'v1'
export const MAX_WEBHOOK_PAYLOAD_BYTES = 256 * 1024
export const WEBHOOK_FAILURE_LIMIT = 5

export const INTEGRATION_SCOPES = [
  'site.read',
  'content.read',
  'content.draft.read',
  'content.draft.write',
  'content.schedule.read',
  'media.read',
  'capabilities.read',
  'commerce.catalog.read',
  'commerce.orders.read',
  'audience.read',
  'integrations.read',
  'webhooks.manage',
  'agent.invoke',
] as const

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number]

export type IntegrationScopeTarget = {
  siteId: string
  publicationId?: string | null
  spaceId?: string | null
}

export type WebhookDiagnosisCategory =
  | 'delivered'
  | 'transient_network'
  | 'auth_failure'
  | 'rate_limited'
  | 'payload_rejected'
  | 'endpoint_error'
  | 'dead_letter'
  | 'unknown'

export type WebhookDeliveryDiagnosis = {
  category: WebhookDiagnosisCategory
  statusCode: number | null
  explanation: string
  nextSafeRepairAction: string
  canRedeliver: boolean
  backoffDelaySeconds: number | null
  isDeadLetter: boolean
}
