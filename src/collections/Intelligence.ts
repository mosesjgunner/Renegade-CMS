import type { CollectionConfig, Field } from 'payload'
import { ownerFields } from './canonical-shared'
import { siteScopedAdminAccess } from '../modules/admin/site-access'

const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Intelligence' },
  access: siteScopedAdminAccess(),
  fields: [],
})

const select = (name: string, options: string[], defaultValue?: string, required = true): Field =>
  ({
    name,
    type: 'select',
    required,
    options,
    ...(defaultValue ? { defaultValue } : {}),
  }) as Field

const rel = (name: string, relationTo: string, required = false, hasMany = false): Field =>
  ({
    name,
    type: 'relationship',
    relationTo: relationTo as never,
    required,
    hasMany,
    index: true,
  }) as Field

export const IntelligenceEntities: CollectionConfig = {
  ...base('intelligence-entities', 'name'),
  fields: [
    ...ownerFields(),
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true },
    select('entityType', [
      'person',
      'organization',
      'place',
      'concept',
      'product',
      'event',
      'work',
    ]),
    { name: 'description', type: 'textarea' },
    { name: 'aliases', type: 'json', defaultValue: [] },
    { name: 'sameAs', type: 'json', defaultValue: [] },
    { name: 'confidence', type: 'number', defaultValue: 1.0 },
    { name: 'externalId', type: 'text', required: true, index: true },
    { name: 'provenance', type: 'json', required: true },
    rel('topics', 'topics', false, true),
  ],
  indexes: [{ fields: ['site', 'externalId'], unique: true }],
}

export const IntelligenceClaims: CollectionConfig = {
  ...base('intelligence-claims', 'statement'),
  fields: [
    ...ownerFields(),
    rel('targetContent', 'content'),
    rel('targetTopic', 'topics'),
    { name: 'statement', type: 'textarea', required: true },
    rel('subjectEntity', 'intelligence-entities'),
    { name: 'predicate', type: 'text' },
    { name: 'objectValue', type: 'text' },
    { name: 'uncertainty', type: 'number', required: true, defaultValue: 0.5 },
    select('verificationStatus', ['unverified', 'supported', 'refuted', 'contested'], 'unverified'),
    { name: 'externalId', type: 'text', required: true, index: true },
    { name: 'provenance', type: 'json', required: true },
    { name: 'quote', type: 'textarea' },
  ],
  indexes: [{ fields: ['site', 'externalId'], unique: true }],
}

export const IntelligenceCitations: CollectionConfig = {
  ...base('intelligence-citations', 'title'),
  fields: [
    ...ownerFields(),
    rel('claim', 'intelligence-claims'),
    rel('targetContent', 'content'),
    rel('source', 'sources'),
    { name: 'sourceUrl', type: 'text', required: true },
    { name: 'title', type: 'text' },
    { name: 'author', type: 'text' },
    { name: 'publisher', type: 'text' },
    { name: 'publishedAt', type: 'date' },
    { name: 'accessedAt', type: 'date' },
    { name: 'quote', type: 'textarea' },
    { name: 'locator', type: 'text' },
    { name: 'relevanceScore', type: 'number', defaultValue: 1.0 },
    { name: 'externalId', type: 'text', required: true, index: true },
  ],
  indexes: [{ fields: ['site', 'externalId'], unique: true }],
}

export const IntelligenceAnalyses: CollectionConfig = {
  ...base('intelligence-analyses', 'id'),
  fields: [
    ...ownerFields(),
    select('targetType', ['content', 'topic', 'site'], 'content'),
    { name: 'targetId', type: 'text', required: true, index: true },
    { name: 'contentRevision', type: 'text', required: true, index: true },
    { name: 'source', type: 'text', required: true },
    { name: 'version', type: 'text', required: true },
    { name: 'timestamp', type: 'date', required: true },
    select('status', ['pending', 'running', 'completed', 'failed', 'stale'], 'pending'),
    { name: 'evidence', type: 'json', required: true },
    { name: 'error', type: 'json' },
    { name: 'job', type: 'relationship', relationTo: 'payload-jobs' as never, index: true },
  ],
  indexes: [
    { fields: ['site', 'targetType', 'targetId', 'contentRevision', 'source'], unique: true },
  ],
}

export const IntelligenceFindings: CollectionConfig = {
  ...base('intelligence-findings', 'dedupeKey'),
  fields: [
    ...ownerFields(),
    rel('analysis', 'intelligence-analyses', true),
    { name: 'targetType', type: 'text', required: true },
    { name: 'targetId', type: 'text', required: true, index: true },
    { name: 'ruleId', type: 'text', required: true },
    select('nature', ['deterministic', 'ai_assessment'], 'deterministic'),
    select('severity', ['info', 'warning', 'critical'], 'warning'),
    { name: 'message', type: 'textarea', required: true },
    { name: 'evidence', type: 'json' },
    select('status', ['open', 'resolved', 'dismissed', 'uncertain'], 'open'),
    { name: 'dedupeKey', type: 'text', required: true, unique: true },
  ],
}

export const IntelligenceRecommendations: CollectionConfig = {
  ...base('intelligence-recommendations', 'id'),
  fields: [
    ...ownerFields(),
    rel('analysis', 'intelligence-analyses', true),
    rel('finding', 'intelligence-findings'),
    select('targetCollection', ['content', 'topics', 'sites'], 'content'),
    { name: 'targetId', type: 'text', required: true, index: true },
    { name: 'isProposal', type: 'checkbox', required: true, defaultValue: true },
    select('nature', ['deterministic', 'ai'], 'deterministic'),
    select('action', [
      'update_seo_title',
      'update_seo_description',
      'update_canonical_path',
      'link_entity',
      'add_citation',
      'assign_topic',
      'custom',
    ]),
    { name: 'currentValue', type: 'json' },
    { name: 'proposedValue', type: 'json', required: true },
    { name: 'rationale', type: 'textarea', required: true },
    select('validationStatus', ['valid', 'invalid'], 'valid'),
    { name: 'validationIssues', type: 'json', defaultValue: [] },
    select('status', ['pending', 'approved', 'rejected', 'applied'], 'pending'),
    { name: 'rejectionReason', type: 'textarea' },
    rel('decidedBy', 'users'),
    { name: 'decidedAt', type: 'date' },
  ],
}

export const IntelligenceExecutions: CollectionConfig = {
  ...base('intelligence-executions', 'id'),
  fields: [
    ...ownerFields(),
    rel('recommendation', 'intelligence-recommendations', true),
    { name: 'targetCollection', type: 'text', required: true },
    { name: 'targetId', type: 'text', required: true, index: true },
    { name: 'executedAt', type: 'date', required: true },
    rel('executedBy', 'users', true),
    { name: 'beforeSnapshot', type: 'json', required: true },
    { name: 'afterSnapshot', type: 'json', required: true },
    select('status', ['applied', 'reverted'], 'applied'),
    { name: 'revertedAt', type: 'date' },
    rel('revertedBy', 'users'),
  ],
}
