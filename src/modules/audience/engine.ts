import { createHash } from 'node:crypto'

/** AUD-04 deliberately compiles only this small predicate vocabulary.  A segment
 * is data, never a query string or executable provider rule. */
export const SEGMENT_FIELDS = [
  'channelEligible',
  'consentPurpose',
  'list',
  'tag',
  'form',
  'sourceCampaign',
  'engagement',
  'locale',
  'role',
  'commerceFact',
  'communityFact',
] as const
export type SegmentField = (typeof SEGMENT_FIELDS)[number]
export type Predicate = {
  field: SegmentField
  op: 'is' | 'in' | 'withinDays' | 'gte'
  value: string | string[] | number
}
export type SegmentNode =
  | { all: SegmentNode[] }
  | { any: SegmentNode[] }
  | { not: SegmentNode }
  | { predicate: Predicate }
export type AudienceProjection = {
  subscriberId: string
  siteId: string
  email: string
  channelEligible: boolean
  consentPurposes: string[]
  lists: string[]
  tags: string[]
  formIds: string[]
  sourceCampaigns: string[]
  locale?: string
  roles: string[]
  commerceFacts: string[]
  communityFacts: string[]
  engagementAt?: string
}
export type Explanation = { selected: boolean; reasons: string[]; exclusions: string[] }

export function validateSegmentTree(node: SegmentNode, depth = 0): string[] {
  if (depth > 8) return ['Segment nesting cannot exceed 8 levels.']
  if ('predicate' in node) {
    const p = node.predicate
    if (!SEGMENT_FIELDS.includes(p.field)) return ['Unsupported segment attribute.']
    if (!['is', 'in', 'withinDays', 'gte'].includes(p.op)) return ['Unsupported segment operator.']
    if (
      p.op === 'withinDays' &&
      (!Number.isInteger(p.value) || Number(p.value) < 1 || Number(p.value) > 3650)
    )
      return ['Time windows must be 1 to 3650 days.']
    return []
  }
  const children = 'not' in node ? [node.not] : 'all' in node ? node.all : node.any
  if (!children.length) return ['A group needs at least one rule.']
  return children.flatMap((child) => validateSegmentTree(child, depth + 1))
}
const values = (p: AudienceProjection, f: SegmentField): (string | boolean)[] => {
  const map: Record<SegmentField, (string | boolean)[]> = {
    channelEligible: [p.channelEligible],
    consentPurpose: p.consentPurposes,
    list: p.lists,
    tag: p.tags,
    form: p.formIds,
    sourceCampaign: p.sourceCampaigns,
    engagement: p.engagementAt ? [p.engagementAt] : [],
    locale: p.locale ? [p.locale] : [],
    role: p.roles,
    commerceFact: p.commerceFacts,
    communityFact: p.communityFacts,
  }
  return map[f]
}
function matched(p: AudienceProjection, q: Predicate, at: Date) {
  const actual = values(p, q.field)
  if (q.op === 'withinDays')
    return (
      !!p.engagementAt &&
      new Date(p.engagementAt).getTime() >= at.getTime() - Number(q.value) * 86400000
    )
  if (q.op === 'gte') return actual.some((x) => String(x) >= String(q.value))
  const expected = q.op === 'in' ? (q.value as string[]) : [String(q.value)]
  return actual.some((x) => expected.includes(String(x)))
}
export function explainSegment(
  node: SegmentNode,
  person: AudienceProjection,
  at = new Date(),
): Explanation {
  const reasons: string[] = []
  const visit = (n: SegmentNode): boolean => {
    if ('predicate' in n) {
      const ok = matched(person, n.predicate, at)
      ;(ok ? reasons : reasons).push(
        `${n.predicate.field} ${n.predicate.op} ${JSON.stringify(n.predicate.value)}: ${ok ? 'matched' : 'not matched'}`,
      )
      return ok
    }
    if ('not' in n) return !visit(n.not)
    const results = ('all' in n ? n.all : n.any).map(visit)
    return 'all' in n ? results.every(Boolean) : results.some(Boolean)
  }
  const selected = visit(node)
  return { selected, reasons, exclusions: selected ? [] : ['Does not satisfy segment rules.'] }
}
export function segmentVersion(definition: SegmentNode) {
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex')
}
export function recipientSnapshot(input: {
  siteId: string
  messageId: string
  segmentId?: string
  definition: SegmentNode
  recipients: AudienceProjection[]
  evaluatedAt?: string
}) {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString()
  const included = input.recipients
    .filter((r) => r.siteId === input.siteId)
    .map((r) => ({ r, x: explainSegment(input.definition, r, new Date(evaluatedAt)) }))
    .filter(({ r, x }) => r.channelEligible && r.consentPurposes.length > 0 && x.selected)
    .map(({ r }) => ({ subscriberId: r.subscriberId, email: r.email }))
  const excluded = input.recipients.length - included.length
  const evidence = {
    siteId: input.siteId,
    messageId: input.messageId,
    segmentId: input.segmentId,
    segmentVersion: segmentVersion(input.definition),
    evaluatedAt,
    included,
    exclusionCounts: { notEligible: excluded },
  }
  return { ...evidence, hash: createHash('sha256').update(JSON.stringify(evidence)).digest('hex') }
}

export const AUTOMATION_TRIGGERS = [
  'confirmed-subscription',
  'form-action',
  'published-content',
  'release-published',
  'anniversary',
  'community-event',
  'commerce-event',
] as const
export const AUTOMATION_ACTIONS = [
  'delay',
  'condition',
  'send-approved-message',
  'add-tag',
  'remove-tag',
  'add-list',
  'remove-list',
  'create-task',
  'notify',
  'exit',
] as const
export function validateAutomation(input: {
  trigger: string
  actions: { type: string; [key: string]: unknown }[]
}) {
  const errors: string[] = []
  if (!AUTOMATION_TRIGGERS.includes(input.trigger as never))
    errors.push('Unsupported automation trigger.')
  if (!input.actions.length || input.actions.length > 20)
    errors.push('Automations need 1 to 20 bounded actions.')
  input.actions.forEach((a) => {
    if (!AUTOMATION_ACTIONS.includes(a.type as never))
      errors.push(`Unsupported automation action: ${a.type}`)
    if (
      a.type === 'delay' &&
      (!Number.isInteger(a.minutes) || Number(a.minutes) < 0 || Number(a.minutes) > 525600)
    )
      errors.push('Delay must be a whole number of minutes within one year.')
  })
  return errors
}
export function deliverySafety(input: {
  consent: boolean
  suppressed: boolean
  addressHealthy: boolean
  sentInWindow: number
  cap: number
  providerSupports: boolean
}) {
  if (!input.consent) return 'consent-withdrawn'
  if (input.suppressed) return 'suppressed'
  if (!input.addressHealthy) return 'address-unhealthy'
  if (input.sentInWindow >= input.cap) return 'frequency-capped'
  if (!input.providerSupports) return 'provider-capability'
  return null
}
