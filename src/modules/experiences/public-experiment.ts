import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import {
  browserPrivacySignals,
  privacyPolicyFromSettings,
  readConsent,
} from '@/modules/analytics/privacy'
import { analyticsAllowed, isBotOrInternal } from '@/modules/analytics/contracts'
import { deterministicAssignment, type ExperimentState, type Variant } from './contracts'
import { createExperiencesRuntimeService, type ExperienceDefinition } from './service'

export interface PublicExperimentVariantConfig extends Variant {
  name: string
  headline: string
  tagline: string
  ctaText: string
  badge: string
}

export const CANONICAL_PUBLIC_EXPERIMENT: {
  id: string
  name: string
  description: string
  state: ExperimentState
  assignmentSalt: string
  collectionEnabled: boolean
  goalKey: string
  variants: readonly PublicExperimentVariantConfig[]
} = {
  id: 'exp-homepage-hero-cta',
  name: 'Homepage Hero CTA & Reader Onboarding Optimization',
  description:
    'Testing Sovereign Dispatch CTA (Control) vs. Free Reader Network CTA (Treatment) for reader conversion.',
  state: 'running',
  assignmentSalt: 'renegade-hero-experiment-salt-2026',
  collectionEnabled: true,
  goalKey: 'newsletter-member-signup',
  variants: [
    {
      id: 'variant-control',
      name: 'Sovereign Dispatch (Control)',
      isControl: true,
      allocation: 50,
      registeredComponent: 'publisher.newsletter-cta',
      headline: 'Subscribe to Sovereign Dispatch',
      tagline: 'Independent journalism, unfiltered dispatches, zero corporate tracking.',
      ctaText: 'Subscribe to Dispatch',
      badge: 'Control (Standard)',
    },
    {
      id: 'variant-treatment',
      name: 'Free Reader Network (Treatment)',
      isControl: false,
      allocation: 50,
      registeredComponent: 'publisher.cta',
      headline: 'Join the Sovereign Reader Network',
      tagline:
        'Full access to decentralised analysis, community discussions, and verified member feeds.',
      ctaText: 'Join Reader Network',
      badge: 'Treatment (Community Focus)',
    },
  ],
}

/** Retrieves or provisions the canonical public experiment in Payload. */
export async function getActivePublicExperiment(payload: Payload, siteId?: string) {
  let dbExperiment: Record<string, unknown> | null = null

  if (siteId) {
    try {
      const existing = await payload.find({
        collection: 'experiments',
        where: {
          and: [
            { site: { equals: siteId } },
            { name: { equals: CANONICAL_PUBLIC_EXPERIMENT.name } },
          ],
        },
        limit: 1,
        depth: 1,
        overrideAccess: true,
      } as never)
      if (existing.docs.length > 0) {
        dbExperiment = existing.docs[0] as unknown as Record<string, unknown>
      }
    } catch {
      // Database query best effort
    }
  }

  // Check if a human winner decision has been recorded
  let winnerDecision: Record<string, unknown> | null = null
  try {
    const decisions = await payload.find({
      collection: 'experiment-decisions',
      where: {
        experiment: {
          equals: dbExperiment?.id ? String(dbExperiment.id) : CANONICAL_PUBLIC_EXPERIMENT.id,
        },
      },
      sort: '-decidedAt',
      limit: 1,
      depth: 1,
      overrideAccess: true,
    } as never)
    if (decisions.docs.length > 0) {
      winnerDecision = decisions.docs[0] as unknown as Record<string, unknown>
    }
  } catch {
    // Non-blocking decision check
  }

  const state: ExperimentState = winnerDecision
    ? 'winner-selected'
    : ((dbExperiment?.state as ExperimentState) ?? CANONICAL_PUBLIC_EXPERIMENT.state)
  const selectedVariantId = winnerDecision
    ? typeof winnerDecision.selectedVariant === 'string'
      ? winnerDecision.selectedVariant
      : (winnerDecision.selectedVariant as { id?: string } | undefined)?.id
    : undefined

  return {
    ...CANONICAL_PUBLIC_EXPERIMENT,
    dbId: dbExperiment?.id ? String(dbExperiment.id) : CANONICAL_PUBLIC_EXPERIMENT.id,
    siteId: siteId ?? 'default-site',
    state,
    winnerDecision: winnerDecision
      ? {
          selectedVariantId,
          reason: String(winnerDecision.reason ?? ''),
          decidedAt: String(winnerDecision.decidedAt ?? ''),
          approvedBy: winnerDecision.approvedBy,
        }
      : null,
  }
}

/** Evaluates visitor privacy and returns deterministic assignment. */
export function resolvePublicExperimentVariant(input: {
  experiment: ReturnType<typeof getActivePublicExperiment> extends Promise<infer T> ? T : never
  cookieHeader: string | null
  headers: Headers
  secret: string
  privacyPolicy: ReturnType<typeof privacyPolicyFromSettings>
}) {
  const control = input.experiment.variants.find((v) => v.isControl) ?? input.experiment.variants[0]
  const consent = readConsent(input.cookieHeader, input.secret)
  const signals = browserPrivacySignals(input.headers)
  const allowed =
    consent &&
    analyticsAllowed({ choices: consent.choices, policy: input.privacyPolicy, ...signals })
  const bot = isBotOrInternal({
    userAgent: input.headers.get('user-agent') ?? undefined,
    internal: input.headers.get('x-renegade-internal') === '1',
  })

  // If winner has been approved by operator, winner is rendered for all
  if (
    input.experiment.state === 'winner-selected' &&
    input.experiment.winnerDecision?.selectedVariantId
  ) {
    const winnerVariant =
      input.experiment.variants.find(
        (v) => v.id === input.experiment.winnerDecision?.selectedVariantId,
      ) ?? control
    return {
      variant: winnerVariant,
      assignment: {
        experimentId: input.experiment.id,
        variantId: winnerVariant.id,
        subjectKey: 'approved-winner',
        isDefault: false,
        dedupeKey: `experiment:${input.experiment.id}:winner:${winnerVariant.id}`,
      },
      consented: Boolean(allowed && !bot),
      privacyMode: 'winner-enforced' as const,
      reason: 'Human-approved winning variant permanently deployed.',
    }
  }

  // If tracking off, consent absent, or bot: deliver control safely with no tracking
  if (!allowed || bot || input.experiment.state !== 'running') {
    return {
      variant: control,
      assignment: {
        experimentId: input.experiment.id,
        variantId: control.id,
        subjectKey: 'privacy-default',
        isDefault: true,
        dedupeKey: `experiment:${input.experiment.id}:privacy-default`,
      },
      consented: false,
      privacyMode: bot ? 'bot-filtered' : !allowed ? 'tracking-off' : 'experiment-paused',
      reason: bot
        ? 'Automated bot / crawler detected; tracking disabled.'
        : !allowed
          ? 'Visitor has not consented or DNT/GPC privacy shield is active; privacy-default variant rendered.'
          : 'Experiment is paused or stopped.',
    }
  }

  const subjectKey = consent.subject
  const assignment = deterministicAssignment({
    experimentId: input.experiment.id,
    salt: input.experiment.assignmentSalt,
    subjectKey,
    consented: true,
    collectionEnabled: input.experiment.collectionEnabled,
    variants: input.experiment.variants,
  })

  const variant = input.experiment.variants.find((v) => v.id === assignment.variantId) ?? control

  return {
    variant,
    assignment,
    consented: true,
    privacyMode: 'consented-active' as const,
    reason: 'First-party deterministic variant assigned under valid visitor consent.',
  }
}
