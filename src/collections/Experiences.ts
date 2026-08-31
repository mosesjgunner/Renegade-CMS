import type { CollectionConfig, Field } from 'payload'
import { ownerFields } from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Experience' },
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
const relation = (name: string, relationTo: string, required = false): Field =>
  ({ name, type: 'relationship', relationTo: relationTo as never, required, index: true }) as Field

/** Rules are declarative only; renderers may select registered components, never execute arbitrary code. */
export const ExperienceRules: CollectionConfig = {
  ...base('experience-rules', 'name'),
  fields: [
    ...ownerFields(),
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'conditions', type: 'json', required: true, defaultValue: [] },
    select('status', ['draft', 'approved', 'active', 'paused', 'archived'], 'draft'),
    relation('approvedBy', 'users'),
    { name: 'approvedAt', type: 'date' },
  ],
}
export const ExperienceVariants: CollectionConfig = {
  ...base('experience-variants', 'name'),
  fields: [
    ...ownerFields(),
    relation('rule', 'experience-rules', true),
    { name: 'name', type: 'text', required: true },
    { name: 'registeredComponent', type: 'text', required: true },
    { name: 'contentRevision', type: 'relationship', relationTo: 'revision-records' as never },
    { name: 'properties', type: 'json', required: true, defaultValue: {} },
    select('status', ['draft', 'approved', 'active', 'archived'], 'draft'),
  ],
}
export const Experiments: CollectionConfig = {
  ...base('experiments', 'name'),
  fields: [
    ...ownerFields(),
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    relation('rule', 'experience-rules'),
    relation('conversionGoal', 'conversion-goals'),
    select(
      'state',
      ['draft', 'approved', 'running', 'paused', 'stopped', 'inconclusive', 'winner-selected'],
      'draft',
    ),
    { name: 'assignmentSalt', type: 'text', required: true },
    { name: 'collectionEnabled', type: 'checkbox', defaultValue: true },
    relation('approvedBy', 'users'),
    { name: 'approvedAt', type: 'date' },
    { name: 'startedAt', type: 'date' },
    { name: 'stoppedAt', type: 'date' },
  ],
}
export const ExperimentVariants: CollectionConfig = {
  ...base('experiment-variants', 'name'),
  fields: [
    ...ownerFields(),
    relation('experiment', 'experiments', true),
    relation('experienceVariant', 'experience-variants'),
    { name: 'name', type: 'text', required: true },
    { name: 'isControl', type: 'checkbox', defaultValue: false },
    { name: 'allocation', type: 'number', required: true, min: 0, max: 100 },
    { name: 'registeredComponent', type: 'text', required: true },
  ],
  indexes: [{ fields: ['experiment', 'name'], unique: true }],
}
export const TrafficAllocations: CollectionConfig = {
  ...base('traffic-allocations', 'id'),
  fields: [
    ...ownerFields(),
    relation('experiment', 'experiments', true),
    relation('variant', 'experiment-variants', true),
    { name: 'allocation', type: 'number', required: true, min: 0, max: 100 },
    { name: 'effectiveAt', type: 'date', required: true },
  ],
}
export const ExperimentAssignments: CollectionConfig = {
  ...base('experiment-assignments', 'dedupeKey'),
  fields: [
    ...ownerFields(),
    relation('experiment', 'experiments', true),
    relation('variant', 'experiment-variants', true),
    { name: 'subjectKey', type: 'text', required: true },
    { name: 'dedupeKey', type: 'text', required: true, unique: true },
    { name: 'consentBasis', type: 'text', required: true },
    { name: 'assignedAt', type: 'date', required: true },
    { name: 'isDefault', type: 'checkbox', defaultValue: false },
  ],
  indexes: [{ fields: ['experiment', 'subjectKey'], unique: true }],
}
export const ConversionGoals: CollectionConfig = {
  ...base('conversion-goals', 'key'),
  fields: [
    ...ownerFields(),
    { name: 'key', type: 'text', required: true },
    { name: 'name', type: 'text', required: true },
    { name: 'eventTypes', type: 'json', required: true },
    { name: 'definition', type: 'textarea', required: true },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
  ],
  indexes: [{ fields: ['site', 'key'], unique: true }],
}
export const ExperimentEvents: CollectionConfig = {
  ...base('experiment-events', 'dedupeKey'),
  fields: [
    ...ownerFields(),
    relation('experiment', 'experiments', true),
    relation('variant', 'experiment-variants', true),
    relation('assignment', 'experiment-assignments'),
    select('kind', ['exposure', 'conversion'], 'exposure'),
    { name: 'goalKey', type: 'text' },
    { name: 'dedupeKey', type: 'text', required: true, unique: true },
    { name: 'occurredAt', type: 'date', required: true },
    { name: 'consentBasis', type: 'text', required: true },
  ],
}
export const ExperimentAnalyses: CollectionConfig = {
  ...base('experiment-analyses', 'id'),
  fields: [
    ...ownerFields(),
    relation('experiment', 'experiments', true),
    { name: 'computedAt', type: 'date', required: true },
    { name: 'result', type: 'json', required: true },
    { name: 'warnings', type: 'json', required: true, defaultValue: [] },
  ],
}
export const ExperimentDecisions: CollectionConfig = {
  ...base('experiment-decisions', 'id'),
  fields: [
    ...ownerFields(),
    relation('experiment', 'experiments', true),
    relation('selectedVariant', 'experiment-variants'),
    select('decision', ['pause', 'stop', 'inconclusive', 'winner-selected'], 'inconclusive'),
    { name: 'reason', type: 'textarea', required: true },
    relation('actor', 'users', true),
    { name: 'decidedAt', type: 'date', required: true },
    { name: 'approvalRequired', type: 'checkbox', defaultValue: true },
    relation('approvedBy', 'users'),
    { name: 'approvedAt', type: 'date' },
  ],
}
