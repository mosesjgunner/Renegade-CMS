/**
 * Renegade CMoS Content Intelligence - Source Verification & Human Review Engine
 *
 * Handles source attachment, source freshness, conflict detection, and strict human
 * fact-checking verification. AI checks may propose suggestions but are strictly
 * forbidden from marking a claim as verified.
 */

import { randomUUID } from 'node:crypto'
import type {
  ClaimConflict,
  ClaimReviewStatus,
  EditorialClaim,
  HumanVerificationRecord,
  ReviewerHistoryEntry,
  SourceEvidence,
  SourceFreshness,
  SourceStance,
} from './contracts'

export interface AttachSourceInput {
  sourceUrl: string
  title?: string
  author?: string
  publisher?: string
  publishedDate?: string
  accessedDate?: string
  quote?: string
  locator?: string
  stance: SourceStance
  addedBy?: string
  currentDate?: Date
  staleThresholdYears?: number
}

export interface HumanReviewerContext {
  userId: string
  role: 'owner' | 'administrator' | 'staff' | 'editor' | 'publisher'
  notes?: string
}

/**
 * Calculates source freshness based on publication date and domain threshold.
 */
export function evaluateSourceFreshness(
  publishedDate?: string,
  options?: {
    currentDate?: Date
    staleThresholdYears?: number
  },
): SourceFreshness {
  if (!publishedDate) {
    return {
      status: 'undated',
      freshnessNotes: 'Source lacks explicit publication date; freshness cannot be verified.',
      isStale: false,
    }
  }

  const pubTime = Date.parse(publishedDate)
  if (Number.isNaN(pubTime)) {
    return {
      status: 'undated',
      freshnessNotes: `Invalid date format '${publishedDate}'.`,
      isStale: false,
    }
  }

  const now = options?.currentDate ?? new Date()
  const thresholdYears = options?.staleThresholdYears ?? 3.0
  const ageMs = now.getTime() - pubTime
  const ageYears = Math.max(0, ageMs / (1000 * 60 * 60 * 24 * 365.25))

  if (ageYears <= 1.0) {
    return {
      status: 'fresh',
      publishedDate,
      ageYears: Number(ageYears.toFixed(1)),
      freshnessNotes: `Source published ${ageYears.toFixed(1)} years ago; considered fresh.`,
      isStale: false,
    }
  }

  if (ageYears <= thresholdYears) {
    return {
      status: 'aging',
      publishedDate,
      ageYears: Number(ageYears.toFixed(1)),
      freshnessNotes: `Source published ${ageYears.toFixed(1)} years ago; aging but acceptable for non-dynamic topics.`,
      isStale: false,
    }
  }

  return {
    status: 'stale',
    publishedDate,
    ageYears: Number(ageYears.toFixed(1)),
    freshnessNotes: `Source is ${ageYears.toFixed(1)} years old (exceeds ${thresholdYears}-year freshness threshold). Requires updated citations.`,
    isStale: true,
  }
}

/**
 * Evaluates whether an incoming source creates a contradiction with the claim or existing sources.
 */
export function detectConflict(
  claim: EditorialClaim,
  newSource: {
    stance: SourceStance
    sourceUrl: string
    quote?: string
  },
): ClaimConflict {
  const existingConflicting = [...claim.conflict.conflictingEvidence]

  if (newSource.stance === 'contradicts') {
    existingConflicting.push({
      sourceId: newSource.sourceUrl,
      statement: newSource.quote || 'Source asserts contradictory findings.',
      reason: `Direct contradiction: source at ${newSource.sourceUrl} refutes the claim statement.`,
    })
  }

  // Check if we have both supporting and contradicting sources
  const hasSupporters =
    claim.sources.some((s) => s.stance === 'supports') || newSource.stance === 'supports'
  const hasContradictors =
    claim.sources.some((s) => s.stance === 'contradicts') || newSource.stance === 'contradicts'

  const hasConflict = hasContradictors && (hasSupporters || newSource.stance === 'contradicts')

  return {
    hasConflict,
    conflictType: hasConflict ? 'direct_contradiction' : undefined,
    conflictingEvidence: existingConflicting,
  }
}

/**
 * Attaches a source citation to a claim, evaluating freshness and conflicting evidence,
 * updating status deterministically without human verification.
 */
export function attachSourceToClaim(
  claim: EditorialClaim,
  input: AttachSourceInput,
): EditorialClaim {
  const sourceId = `src-${randomUUID().slice(0, 8)}`
  const freshness = evaluateSourceFreshness(input.publishedDate, {
    currentDate: input.currentDate,
    staleThresholdYears: input.staleThresholdYears,
  })

  const newSource: SourceEvidence = {
    id: sourceId,
    sourceUrl: input.sourceUrl,
    title: input.title,
    author: input.author,
    publisher: input.publisher,
    publishedDate: input.publishedDate,
    accessedDate: input.accessedDate || new Date().toISOString().split('T')[0],
    quote: input.quote,
    locator: input.locator,
    freshness,
    stance: input.stance,
    addedAt: new Date().toISOString(),
    addedBy: input.addedBy || 'editor',
  }

  const updatedSources = [...claim.sources, newSource]
  const updatedConflict = detectConflict(claim, newSource)

  // Determine updated review status (strictly distinguishing unsupported, contradicted, outdated, unreviewed)
  let updatedStatus: ClaimReviewStatus = claim.reviewStatus

  // If already human verified, attaching new contradicting evidence resets status to 'contradicted' for re-review
  if (updatedConflict.hasConflict) {
    updatedStatus = 'contradicted'
  } else if (newSource.stance === 'contradicts') {
    updatedStatus = 'contradicted'
  } else if (updatedSources.length > 0 && updatedSources.every((s) => s.freshness.isStale)) {
    updatedStatus = 'outdated'
  } else if (
    newSource.stance === 'supports' &&
    (claim.reviewStatus === 'unreviewed' ||
      claim.reviewStatus === 'unsupported' ||
      claim.reviewStatus === 'outdated')
  ) {
    updatedStatus = 'supported'
  }

  return {
    ...claim,
    sources: updatedSources,
    conflict: updatedConflict,
    reviewStatus: updatedStatus,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Automated check proposal.
 * AI models may identify claims, compute checks, or suggest statuses,
 * but MUST NEVER mark a claim as 'human_verified'.
 */
export function applyAutomatedCheckProposal(
  claim: EditorialClaim,
  proposal: {
    suggestedStatus: 'supported' | 'unsupported' | 'contradicted' | 'outdated'
    rationale: string
    modelOrRuleId: string
  },
): EditorialClaim {
  // Defensive guard against model attempt to set human verification
  if ((proposal.suggestedStatus as string) === 'human_verified') {
    throw new Error(
      'Automated checks are strictly forbidden from setting reviewStatus to human_verified. Human review sign-off is required.',
    )
  }

  // Update automated check metadata without silently overriding human decisions
  const isHumanDecided =
    claim.reviewStatus === 'human_verified' || claim.reviewStatus === 'rejected'
  const newStatus = isHumanDecided ? claim.reviewStatus : proposal.suggestedStatus

  return {
    ...claim,
    automatedCheck: {
      suggestedStatus: proposal.suggestedStatus,
      rationale: proposal.rationale,
      modelOrRuleId: proposal.modelOrRuleId,
      checkedAt: new Date().toISOString(),
    },
    reviewStatus: newStatus,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Executes a human verification decision on a claim.
 * Requires authenticated human user context with appropriate role.
 */
export function verifyClaimHuman(
  claim: EditorialClaim,
  reviewer: HumanReviewerContext,
  decision: 'verified' | 'rejected' | 'disputed',
): EditorialClaim {
  if (!reviewer?.userId || !reviewer?.role) {
    throw new Error('Human verification requires an authenticated human user ID and valid role.')
  }

  const allowedRoles = ['owner', 'administrator', 'staff', 'editor', 'publisher']
  if (!allowedRoles.includes(reviewer.role)) {
    throw new Error(
      `Role '${reviewer.role}' is not authorized to verify or reject editorial claims.`,
    )
  }

  let newStatus: ClaimReviewStatus
  if (decision === 'verified') {
    if (claim.conflict.hasConflict) {
      throw new Error(
        'Cannot mark claim verified while unresolved contradictory sources exist. Contradictions must be resolved first.',
      )
    }
    if (claim.sources.length === 0) {
      throw new Error('Cannot mark claim verified without at least one supporting source citation.')
    }
    newStatus = 'human_verified'
  } else if (decision === 'rejected') {
    newStatus = 'rejected'
  } else {
    newStatus = 'contradicted'
  }

  const now = new Date().toISOString()
  const verificationRecord: HumanVerificationRecord = {
    verifiedBy: reviewer.userId,
    verifiedRole: reviewer.role,
    verifiedAt: now,
    decision,
    notes: reviewer.notes,
  }

  const historyEntry: ReviewerHistoryEntry = {
    reviewerId: reviewer.userId,
    reviewerRole: reviewer.role,
    previousStatus: claim.reviewStatus,
    newStatus,
    decidedAt: now,
    notes: reviewer.notes,
    contentRevision: claim.contentRevision,
  }

  return {
    ...claim,
    reviewStatus: newStatus,
    humanVerification: verificationRecord,
    reviewerHistory: [...claim.reviewerHistory, historyEntry],
    updatedAt: now,
  }
}
