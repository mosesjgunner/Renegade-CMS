import { createHash } from 'node:crypto'

export type AllowedExperienceInput =
  | 'language-region'
  | 'logged-in-role'
  | 'space-membership'
  | 'supporter-entitlement'
  | 'consented-segment'
  | 'new-returning-session'
  | 'campaign-referral'
  | 'device-class'
  | 'explicit-preference'
  | 'time-event-campaign-state'
export const ALLOWED_EXPERIENCE_INPUTS: readonly AllowedExperienceInput[] = [
  'language-region',
  'logged-in-role',
  'space-membership',
  'supporter-entitlement',
  'consented-segment',
  'new-returning-session',
  'campaign-referral',
  'device-class',
  'explicit-preference',
  'time-event-campaign-state',
]
export type ExperimentState =
  | 'draft'
  | 'approved'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'inconclusive'
  | 'winner-selected'
export type Variant = Readonly<{
  id: string
  allocation: number
  isControl?: boolean
  registeredComponent: string
}>
export type Assignment = Readonly<{
  experimentId: string
  variantId: string
  subjectKey: string
  isDefault: boolean
  dedupeKey: string
}>
export const assignmentKey = (experimentId: string, subjectKey: string) =>
  `experiment:${experimentId}:subject:${subjectKey}`
export function deterministicAssignment(input: {
  experimentId: string
  salt: string
  subjectKey?: string
  consented: boolean
  collectionEnabled: boolean
  variants: readonly Variant[]
}): Assignment {
  const control = input.variants.find((variant) => variant.isControl) ?? input.variants[0]
  if (!control) throw new Error('An experiment requires a control variant.')
  if (!input.consented || !input.collectionEnabled || !input.subjectKey)
    return {
      experimentId: input.experimentId,
      variantId: control.id,
      subjectKey: input.subjectKey ?? 'privacy-default',
      isDefault: true,
      dedupeKey: assignmentKey(input.experimentId, input.subjectKey ?? 'privacy-default'),
    }
  const total = input.variants.reduce((sum, variant) => sum + variant.allocation, 0)
  if (total !== 100) throw new Error('Traffic allocation must total 100.')
  const bucket =
    createHash('sha256').update(`${input.salt}:${input.subjectKey}`).digest().readUInt32BE(0) % 100
  let cursor = 0
  const selected =
    input.variants.find((variant) => (cursor += variant.allocation) > bucket) ?? control
  return {
    experimentId: input.experimentId,
    variantId: selected.id,
    subjectKey: input.subjectKey,
    isDefault: false,
    dedupeKey: assignmentKey(input.experimentId, input.subjectKey),
  }
}
export const experimentEventKey = (
  kind: 'exposure' | 'conversion',
  experimentId: string,
  assignmentId: string,
  goalKey?: string,
) => `${kind}:${experimentId}:${assignmentId}:${goalKey ?? ''}`
export function analyzeExperiment(
  variants: readonly { id: string; exposures: number; conversions: number; isControl?: boolean }[],
) {
  const control = variants.find((variant) => variant.isControl) ?? variants[0]
  if (!control) throw new Error('An experiment requires a control.')
  const rate = (value: { exposures: number; conversions: number }) =>
    value.exposures ? value.conversions / value.exposures : 0
  const controlRate = rate(control)
  const results = variants.map((variant) => {
    const conversionRate = rate(variant)
    const se = Math.sqrt(
      (conversionRate * (1 - conversionRate)) / Math.max(1, variant.exposures) +
        (controlRate * (1 - controlRate)) / Math.max(1, control.exposures),
    )
    return {
      ...variant,
      conversionRate,
      practicalEffect: conversionRate - controlRate,
      uncertainty95: 1.96 * se,
    }
  })
  const tiny = variants.some((variant) => variant.exposures < 100)
  return {
    controlId: control.id,
    results,
    warnings: tiny
      ? [
          'Tiny sample: fewer than 100 exposures in at least one variant.',
          'Insufficient evidence: do not select a winner or stop early.',
        ]
      : [],
  }
}
export function approveWinner(input: {
  state: ExperimentState
  selectedVariantId?: string
  humanApproved: boolean
}) {
  if (!input.humanApproved)
    throw new Error('A human approval is required before a winner can be selected.')
  if (!input.selectedVariantId) throw new Error('A selected variant is required.')
  if (!['running', 'paused', 'stopped', 'inconclusive'].includes(input.state))
    throw new Error('Only an evaluated experiment can select a winner.')
  return 'winner-selected' as const
}
