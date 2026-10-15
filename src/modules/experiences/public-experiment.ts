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

/** Load persisted experiment identity and variants; the blueprint alone is not an active experiment. */
export async function getActivePublicExperiment(payload: Payload, siteId?: string) {
  const empty = {
    ...CANONICAL_PUBLIC_EXPERIMENT,
    dbId: null as string | null,
    siteId: siteId ?? '',
    state: 'draft' as ExperimentState,
    collectionEnabled: false,
    configurationStatus: 'unconfigured' as 'unconfigured' | 'configured' | 'unavailable',
    configurationIssue: 'No persisted experiment is configured.' as string | null,
    winnerDecision: null as {
      selectedVariantId: string | undefined
      reason: string
      decidedAt: string
      approvedBy: unknown
    } | null,
  }
  if (!siteId) return empty
  try {
    const existing = await payload.find({
      collection: 'experiments',
      where: {
        and: [{ site: { equals: siteId } }, { name: { equals: CANONICAL_PUBLIC_EXPERIMENT.name } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const experiment = existing.docs[0]
    if (!experiment) return empty
    const [variants, decisions] = await Promise.all([
      payload.find({
        collection: 'experiment-variants',
        where: { and: [{ site: { equals: siteId } }, { experiment: { equals: experiment.id } }] },
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'experiment-decisions',
        where: {
          and: [
            { site: { equals: siteId } },
            { experiment: { equals: experiment.id } },
            { decision: { equals: 'winner-selected' } },
          ],
        },
        sort: '-decidedAt',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      }),
    ])
    const configured =
      variants.docs.length > 0 &&
      variants.docs.reduce((sum, variant) => sum + variant.allocation, 0) === 100 &&
      variants.docs.filter((variant) => variant.isControl).length === 1
    const decision = configured ? decisions.docs[0] : undefined
    const winner =
      typeof decision?.selectedVariant === 'object'
        ? decision.selectedVariant?.id
        : decision?.selectedVariant
    return {
      ...empty,
      id: String(experiment.id),
      dbId: String(experiment.id),
      name: experiment.name,
      description: experiment.description ?? '',
      assignmentSalt: experiment.assignmentSalt,
      state: (configured
        ? decision
          ? 'winner-selected'
          : (experiment.state ?? 'draft')
        : 'draft') as ExperimentState,
      collectionEnabled: configured && experiment.collectionEnabled !== false,
      configurationStatus: configured ? ('configured' as const) : ('unconfigured' as const),
      configurationIssue: configured
        ? null
        : 'Configure variants totaling 100 percent with one control.',
      variants: configured
        ? variants.docs.map((variant) => ({
            ...CANONICAL_PUBLIC_EXPERIMENT.variants[variant.isControl ? 0 : 1],
            id: String(variant.id),
            name: variant.name,
            isControl: Boolean(variant.isControl),
            allocation: variant.allocation,
            registeredComponent: variant.registeredComponent,
          }))
        : CANONICAL_PUBLIC_EXPERIMENT.variants,
      winnerDecision: decision
        ? {
            selectedVariantId: winner ? String(winner) : undefined,
            reason: decision.reason,
            decidedAt: decision.decidedAt,
            approvedBy: decision.approvedBy,
          }
        : null,
    }
  } catch {
    return {
      ...empty,
      configurationStatus: 'unavailable' as const,
      configurationIssue: 'Experiment records could not be loaded.',
    }
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
