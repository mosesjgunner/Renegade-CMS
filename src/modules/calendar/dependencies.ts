export type ScheduleRuleViolationSeverity = 'error' | 'warning'

export type ScheduleRuleViolation = {
  ruleId:
    | 'prerequisite-unmet'
    | 'embargo-breached'
    | 'rights-expired'
    | 'slot-collision'
    | 'missing-approval'
    | 'quality-gate-blocked'
  severity: ScheduleRuleViolationSeverity
  message: string
  evidence: Record<string, unknown>
}

export type SchedulePolicyConfig = {
  policy: 'block' | 'warn'
  maxItemsPerSlot?: number
}

export type ScheduleTargetContext = {
  id: string
  title: string
  status: string
  scheduledFor: string
  siteId: string
  publicationId?: string | null
  embargoDate?: string | null
  rightsExpirationDate?: string | null
  prerequisites?: Array<{
    id: string
    title: string
    isPublished: boolean
    publishedAt?: string | null
  }>
  qualityGate?: {
    blockingIssueCount: number
    waived: boolean
  }
}

export type ExistingScheduledSlot = {
  id: string
  title: string
  scheduledFor: string
  siteId: string
  publicationId?: string | null
}

export type ScheduleEvaluationResult = {
  allowed: boolean
  hasWarnings: boolean
  policy: 'block' | 'warn'
  violations: ScheduleRuleViolation[]
}

/**
 * Evaluates scheduling rules and content dependencies before enqueuing or updating a schedule slot.
 */
export function evaluateScheduleRules(
  target: ScheduleTargetContext,
  existingSlots: ExistingScheduledSlot[],
  policyConfig: SchedulePolicyConfig = { policy: 'block', maxItemsPerSlot: 2 },
): ScheduleEvaluationResult {
  const violations: ScheduleRuleViolation[] = []
  const targetTime = new Date(target.scheduledFor).getTime()

  // 1. Missing Approval check
  if (target.status !== 'approved' && target.status !== 'scheduled') {
    violations.push({
      ruleId: 'missing-approval',
      severity: 'error',
      message: `Item status is "${target.status}". Only approved content can be scheduled.`,
      evidence: { currentStatus: target.status },
    })
  }

  // 2. Quality Gate check
  if (
    target.qualityGate &&
    target.qualityGate.blockingIssueCount > 0 &&
    !target.qualityGate.waived
  ) {
    violations.push({
      ruleId: 'quality-gate-blocked',
      severity: 'error',
      message: `Content has ${target.qualityGate.blockingIssueCount} un-waived blocking quality issues.`,
      evidence: {
        blockingIssueCount: target.qualityGate.blockingIssueCount,
        waived: target.qualityGate.waived,
      },
    })
  }

  // 3. Embargo check
  if (target.embargoDate) {
    const embargoTime = new Date(target.embargoDate).getTime()
    if (targetTime < embargoTime) {
      violations.push({
        ruleId: 'embargo-breached',
        severity: 'error',
        message: `Scheduled time (${target.scheduledFor}) is prior to the embargo date (${target.embargoDate}).`,
        evidence: { scheduledFor: target.scheduledFor, embargoDate: target.embargoDate },
      })
    }
  }

  // 4. Rights Expiration check
  if (target.rightsExpirationDate) {
    const expirationTime = new Date(target.rightsExpirationDate).getTime()
    if (targetTime > expirationTime) {
      violations.push({
        ruleId: 'rights-expired',
        severity: 'error',
        message: `Scheduled time (${target.scheduledFor}) is after media rights expiration date (${target.rightsExpirationDate}).`,
        evidence: {
          scheduledFor: target.scheduledFor,
          rightsExpirationDate: target.rightsExpirationDate,
        },
      })
    }
  }

  // 5. Prerequisite Content check
  if (target.prerequisites && target.prerequisites.length > 0) {
    const unmet = target.prerequisites.filter((p) => !p.isPublished)
    if (unmet.length > 0) {
      violations.push({
        ruleId: 'prerequisite-unmet',
        severity: 'error',
        message: `Prerequisite content is not yet published: ${unmet.map((u) => u.title).join(', ')}.`,
        evidence: { unmetPrerequisites: unmet },
      })
    }
  }

  // 6. Same-slot Campaign / Content Collision check (within 15 minute window)
  const windowMs = 15 * 60 * 1000
  const maxSlot = policyConfig.maxItemsPerSlot ?? 2
  const colliding = existingSlots.filter((slot) => {
    if (slot.id === target.id) return false
    if (slot.siteId !== target.siteId) return false
    if (target.publicationId && slot.publicationId && target.publicationId !== slot.publicationId)
      return false
    const slotTime = new Date(slot.scheduledFor).getTime()
    return Math.abs(slotTime - targetTime) <= windowMs
  })

  if (colliding.length >= maxSlot) {
    violations.push({
      ruleId: 'slot-collision',
      severity: policyConfig.policy === 'block' ? 'error' : 'warning',
      message: `Time slot has ${colliding.length} existing scheduled items in the same 15m window.`,
      evidence: {
        collidingCount: colliding.length,
        collidingTitles: colliding.map((c) => c.title),
      },
    })
  }

  const hasErrors = violations.some((v) => v.severity === 'error')
  const hasWarnings = violations.some((v) => v.severity === 'warning')

  const allowed = policyConfig.policy === 'warn' ? !hasErrors : violations.length === 0

  return {
    allowed,
    hasWarnings,
    policy: policyConfig.policy,
    violations,
  }
}
