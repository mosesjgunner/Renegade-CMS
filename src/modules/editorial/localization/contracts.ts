import type { QualityGateSnapshot, QualityWaiverAuthorization } from '../contracts'

export type LocaleCode = string // e.g. 'en', 'es', 'fr', 'de', 'ja'

export type TranslationStatus =
  | 'requested'
  | 'assigned'
  | 'in-translation'
  | 'in-review'
  | 'changes-requested'
  | 'approved'
  | 'completed'
  | 'cancelled'

export type LocaleVariantStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'archived'

/**
 * Pinned revision of the source document at the moment translation was requested or re-aligned.
 */
export interface SourceRevisionPin {
  sequence: number
  hash: string
  revisionId?: string
  pinnedAt: string
  title: string
  summary?: string
  bodySnapshot?: Record<string, unknown> | string
}

/**
 * Attribution metadata for machine/provider-generated translation drafts.
 * Human review and approval is mandatory before publish/release.
 */
export interface TranslationDraftAttribution {
  provider: string // e.g. 'renegade-ai-translator', 'deepl', 'manual'
  model?: string
  tokensUsed?: number
  cost?: number
  generatedAt: string
  isMachineDraft: boolean
  humanReviewed: boolean
  humanReviewerId?: string | null
  humanApprovedAt?: string | null
  errorMetadata?: {
    code: string
    message: string
    timestamp: string
  }
}

/**
 * Media asset localized choice (localized alt text, caption, or locale-specific image asset).
 */
export interface LocalizedMediaChoice {
  mediaId: string
  altText: string
  caption?: string
  localeSpecificAssetId?: string
}

/**
 * A single locale variant belonging to a conceptual translation group.
 * Retains its own canonical revision, URL, SEO/discovery state, media choices, and workflow status.
 */
export interface LocaleVariant {
  documentId: string
  locale: LocaleCode
  title: string
  slug: string
  canonicalPath: string
  canonicalUrl: string
  seoTitle?: string
  seoDescription?: string
  summary?: string
  body?: Record<string, unknown> | string
  mediaChoices?: Record<string, LocalizedMediaChoice>
  revisionSequence: number
  revisionHash: string
  status: LocaleVariantStatus
  attribution?: TranslationDraftAttribution
  completenessScore?: number
  updatedAt: string
}

/**
 * Translation Group linking locale variants to one conceptual content item.
 * Guarantees the source document is never overwritten and each locale retains its own canonical identity.
 */
export interface TranslationGroup {
  id: string // e.g. 'grp_...'
  conceptualId: string
  sourceDocumentId: string
  sourceLocale: LocaleCode
  variants: Record<LocaleCode, LocaleVariant>
  createdAt: string
  updatedAt: string
}

/**
 * Formal translation request and task assignment.
 */
export interface TranslationRequest {
  id: string // e.g. 'tr_...'
  groupId: string
  sourceDocumentId: string
  sourceLocale: LocaleCode
  targetLocale: LocaleCode
  sourceRevisionPin: SourceRevisionPin
  targetDocumentId: string | null
  translatorId?: string | null
  reviewerId?: string | null
  dueDate?: string | null
  progress: number // 0 to 100
  status: TranslationStatus
  changesRequestedReason?: string | null
  isStale: boolean
  staleReason?: string | null
  sourceCurrentRevision?: { sequence: number; hash: string }
  attribution?: TranslationDraftAttribution
  createdAt: string
  updatedAt: string
}

/**
 * Rich-text AST node for structured completeness and safety evaluation.
 */
export interface RichTextNode {
  type: string
  text?: string
  children?: RichTextNode[]
  url?: string
  [key: string]: unknown
}

/**
 * Structured completeness inspection findings.
 */
export interface CompletenessFinding {
  field: string
  code: string
  message: string
  severity: 'blocker' | 'warning'
  repairUrl?: string
  details?: Record<string, unknown>
}

/**
 * Detailed report of side-by-side source/target comparison.
 */
export interface TranslationCompletenessReport {
  isComplete: boolean
  score: number // 0 to 100
  blockers: CompletenessFinding[]
  warnings: CompletenessFinding[]
  details: {
    title: {
      source: string
      target: string
      status: 'ok' | 'missing' | 'untranslated_duplicate'
    }
    bodyBlocks: {
      sourceBlocksCount: number
      targetBlocksCount: number
      unsupportedNodes: string[]
      status: 'ok' | 'missing' | 'unsupported_nodes' | 'block_count_mismatch'
    }
    links: {
      sourceLinksCount: number
      targetLinksCount: number
      brokenLinks: string[]
      status: 'ok' | 'broken_links' | 'missing_links'
    }
    media: {
      sourceMediaCount: number
      targetMediaCount: number
      missingAltOrCaptions: Array<{ mediaId: string; issue: string }>
      status: 'ok' | 'missing_alt_caption'
    }
    seoFields: {
      metaTitleStatus: 'ok' | 'missing' | 'length_warning'
      metaDescriptionStatus: 'ok' | 'missing' | 'length_warning'
      status: 'ok' | 'issue'
    }
    schemaFacts: {
      authorStatus: 'ok' | 'missing'
      publishDateStatus: 'ok' | 'missing'
      status: 'ok' | 'issue'
    }
    presentationSlots: {
      matchedSlots: string[]
      missingSlots: string[]
      status: 'ok' | 'missing_slots'
    }
  }
}

/**
 * Notification event types.
 */
export type NotificationEventType =
  | 'assignment'
  | 'mention_comment'
  | 'changes_requested'
  | 'approval'
  | 'due_overdue'
  | 'schedule_release_failure'
  | 'stale_translation'
  | 'rights_quality_issue'
  | 'completion'

export type NotificationChannel = 'in_app' | 'email' | 'webhook'

/**
 * User notification preferences.
 */
export interface NotificationPreferences {
  userId: string
  enabledChannels: Record<NotificationChannel, boolean>
  mutedEvents: NotificationEventType[]
  emailAddress?: string
  webhookEndpointUrl?: string
}

/**
 * Durable outbox record for operationally reliable notifications.
 * Delivery failures do not compromise workflow state truth.
 */
export interface NotificationOutboxItem {
  id: string
  eventId: string
  eventType: NotificationEventType
  recipientId: string
  channel: NotificationChannel
  title: string
  message: string
  payload: Record<string, unknown>
  status: 'pending' | 'delivered' | 'failed' | 'retrying'
  attempts: number
  maxAttempts: number
  nextAttemptAt?: string
  lastError?: string | null
  createdAt: string
  deliveredAt?: string | null
}

/**
 * In-app notification record.
 */
export interface InAppNotification {
  id: string
  userId: string
  eventType: NotificationEventType
  title: string
  message: string
  metadata: Record<string, unknown>
  read: boolean
  createdAt: string
}

/**
 * Webhook subscription with secret rotation support.
 */
export interface WebhookSubscription {
  id: string
  name: string
  targetUrl: string
  primarySecret: string
  secondarySecret?: string | null // For zero-downtime secret rotation
  eventTypes: NotificationEventType[]
  isActive: boolean
  timeoutMs?: number
  createdAt: string
  updatedAt: string
}

/**
 * Webhook delivery log entry for auditability.
 */
export interface WebhookDeliveryLogEntry {
  id: string
  webhookId: string
  eventId: string
  eventType: NotificationEventType
  targetUrl: string
  attempt: number
  statusCode?: number
  durationMs: number
  error?: string | null
  status: 'success' | 'failed'
  timestamp: string
}

/**
 * Deterministic quality gate rule for localization/translation.
 */
export interface LocalizationQualityRule {
  ruleId: string
  ruleVersion: string
  name: string
  severity: 'blocker' | 'warning'
  evaluate: (context: {
    variant: LocaleVariant
    group: TranslationGroup
    request?: TranslationRequest
    sourceRevision?: { sequence: number; hash: string }
  }) => {
    passed: boolean
    message: string
    repairUrl?: string
    details?: Record<string, unknown>
  }
}
