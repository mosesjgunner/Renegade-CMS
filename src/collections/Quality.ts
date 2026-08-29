import type { CollectionConfig, Field } from 'payload'
import { ownerFields } from './canonical-shared'
const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner' || req.user?.role === 'staff'
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Quality Center' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [],
})
const select = (name: string, options: string[], defaultValue?: string): Field =>
  ({
    name,
    type: 'select',
    required: true,
    options,
    ...(defaultValue ? { defaultValue } : {}),
  }) as Field
const rel = (name: string, relationTo: string, required = false): Field =>
  ({ name, type: 'relationship', relationTo: relationTo as never, required, index: true }) as Field
export const QualityPolicies: CollectionConfig = {
  ...base('quality-policies', 'name'),
  fields: [
    ...ownerFields(),
    { name: 'name', type: 'text', required: true },
    select('status', ['draft', 'active', 'archived'], 'draft'),
    { name: 'releaseChecksRequired', type: 'checkbox', defaultValue: true },
    { name: 'rules', type: 'json', defaultValue: [] },
  ],
}
export const QualityRules: CollectionConfig = {
  ...base('quality-rules', 'key'),
  fields: [
    ...ownerFields(),
    rel('policy', 'quality-policies'),
    { name: 'key', type: 'text', required: true },
    { name: 'producer', type: 'text', required: true },
    { name: 'description', type: 'textarea', required: true },
    select('severity', ['informational', 'warning', 'publication_blocking'], 'warning'),
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'configuration', type: 'json', defaultValue: {} },
  ],
}
export const QualityScans: CollectionConfig = {
  ...base('quality-scans', 'id'),
  fields: [
    ...ownerFields(),
    rel('policy', 'quality-policies'),
    select(
      'targetType',
      ['document', 'content-release', 'publication', 'space', 'site'],
      'document',
    ),
    { name: 'targetId', type: 'text', required: true },
    { name: 'revisionId', type: 'text' },
    select('status', ['queued', 'running', 'completed', 'failed'], 'queued'),
    { name: 'startedAt', type: 'date' },
    { name: 'completedAt', type: 'date' },
    { name: 'job', type: 'relationship', relationTo: 'payload-jobs' as never, index: true },
    { name: 'summary', type: 'json' },
  ],
}
export const QualityIssues: CollectionConfig = {
  ...base('quality-issues', 'dedupeKey'),
  fields: [
    ...ownerFields().filter((field) => !('name' in field) || field.name !== 'owner'),
    rel('scan', 'quality-scans'),
    rel('rule', 'quality-rules'),
    { name: 'dedupeKey', type: 'text', required: true, unique: true },
    { name: 'revisionId', type: 'text' },
    { name: 'targetType', type: 'text', required: true },
    { name: 'targetId', type: 'text', required: true },
    { name: 'surface', type: 'text' },
    select('severity', ['informational', 'warning', 'publication_blocking'], 'warning'),
    select('status', ['open', 'resolved', 'waived', 'uncertain'], 'open'),
    select('workflowState', ['new', 'assigned', 'in_remediation', 'ready_for_rescan'], 'new'),
    { name: 'category', type: 'text', required: true, defaultValue: 'content' },
    { name: 'message', type: 'textarea', required: true },
    { name: 'remediation', type: 'json' },
    rel('owner', 'users'),
    { name: 'firstSeenAt', type: 'date', required: true },
    { name: 'resolvedAt', type: 'date' },
    { name: 'lastSeenAt', type: 'date', required: true },
    { name: 'dependencyFingerprint', type: 'text' },
  ],
}
export const QualityExceptions: CollectionConfig = {
  ...base('quality-exceptions', 'reason'),
  fields: [
    ...ownerFields(),
    rel('rule', 'quality-rules', true),
    { name: 'targetType', type: 'text', required: true },
    { name: 'targetId', type: 'text', required: true },
    { name: 'reason', type: 'textarea', required: true },
    rel('actor', 'users', true),
    { name: 'expiresAt', type: 'date', required: true },
  ],
}
export const QualityWaivers: CollectionConfig = {
  ...base('quality-waivers', 'reason'),
  fields: [
    ...ownerFields(),
    rel('issue', 'quality-issues', true),
    { name: 'reason', type: 'textarea', required: true },
    rel('actor', 'users', true),
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'authorizedBy', type: 'relationship', relationTo: 'users' as never, required: true },
  ],
}
export const QualityReports: CollectionConfig = {
  ...base('quality-reports', 'id'),
  fields: [
    ...ownerFields(),
    rel('scan', 'quality-scans', true),
    { name: 'report', type: 'json', required: true },
    { name: 'generatedAt', type: 'date', required: true },
  ],
}
