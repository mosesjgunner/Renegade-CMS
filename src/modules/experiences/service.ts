import { createHash, randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import type { AnalyticsEventStore } from '../analytics/service'
import {
  ANALYTICS_SCHEMA_VERSION,
  type EventType,
  type FirstPartyEvent,
} from '../analytics/contracts'
import {
  ALLOWED_EXPERIENCE_INPUTS,
  analyzeExperiment,
  approveWinner,
  deterministicAssignment,
  experimentEventKey,
  type AllowedExperienceInput,
  type Assignment,
  type ExperimentState,
  type Variant,
} from './contracts'

export type AudienceValue = string | boolean | number | readonly string[]
export type ExperienceCondition = Readonly<{
  input: AllowedExperienceInput
  equals?: AudienceValue
}>
export type ExperienceDefinition = Readonly<{
  id: string
  siteId: string
  state: ExperimentState
  assignmentSalt: string
  collectionEnabled: boolean
  conditions: readonly ExperienceCondition[]
  variants: readonly Variant[]
}>
export type FirstPartySubject = Readonly<{
  /** The caller may use only an already-permitted first-party cookie, session, or member identifier. */
  kind: 'first-party-cookie' | 'session' | 'member'
  value: string
}>
export type RuntimePrivacy = Readonly<{
  analyticsConsent: boolean
  personalizationConsent: boolean
  doNotTrack?: boolean
  capabilityEnabled: boolean
}>
export type ExperienceRuntimeRequest = Readonly<{
  subject?: FirstPartySubject
  audience?: Readonly<Record<string, AudienceValue | undefined>>
  privacy: RuntimePrivacy
}>
export type RuntimeResolution = Readonly<{
  eligible: boolean
  reason?: 'not-running' | 'audience-mismatch' | 'privacy-control' | 'capability-disabled'
  assignment: Assignment
  component: string
}>
export type ExperimentDecisionStore = {
  record(input: {
    experimentId: string
    selectedVariantId: string
    actorId: string
    reason: string
    decidedAt: string
  }): Promise<void>
}

const allowedInputs = new Set<string>(ALLOWED_EXPERIENCE_INPUTS)
const isEqual = (left: AudienceValue | undefined, right: AudienceValue | undefined) =>
  JSON.stringify(left) === JSON.stringify(right)
const analyticsPermitted = (privacy: RuntimePrivacy) =>
  privacy.capabilityEnabled &&
  privacy.analyticsConsent &&
  privacy.personalizationConsent &&
  !privacy.doNotTrack
const control = (experiment: ExperienceDefinition) =>
  experiment.variants.find((variant) => variant.isControl) ?? experiment.variants[0]
const analyticsAssignmentKey = (assignment: Assignment) =>
  'experiment-assignment:sha256:' + createHash('sha256').update(assignment.dedupeKey).digest('hex')

/** Server/runtime service for declarative, first-party-only experiments. */
export class ExperiencesRuntimeService {
  constructor(
    private readonly analytics: AnalyticsEventStore,
    private readonly registeredComponents: ReadonlySet<string>,
    private readonly decisions?: ExperimentDecisionStore,
  ) {}

  resolve(experiment: ExperienceDefinition, request: ExperienceRuntimeRequest): RuntimeResolution {
    this.validateDefinition(experiment)
    this.validateAudience(request.audience)
    const fallback = control(experiment)
    if (!fallback) throw new Error('An experiment requires a control variant.')
    if (!request.privacy.capabilityEnabled)
      return this.defaultResolution(experiment, fallback, 'capability-disabled')
    if (!analyticsPermitted(request.privacy))
      return this.defaultResolution(experiment, fallback, 'privacy-control')
    if (experiment.state !== 'running')
      return this.defaultResolution(experiment, fallback, 'not-running')
    if (
      !experiment.conditions.every((condition) =>
        isEqual(request.audience?.[condition.input], condition.equals),
      )
    )
      return this.defaultResolution(experiment, fallback, 'audience-mismatch')
    const assignment = deterministicAssignment({
      experimentId: experiment.id,
      salt: experiment.assignmentSalt,
      subjectKey: request.subject?.value,
      consented: true,
      collectionEnabled: experiment.collectionEnabled,
      variants: experiment.variants,
    })
    const variant = experiment.variants.find((item) => item.id === assignment.variantId) ?? fallback
    return { eligible: true, assignment, component: variant.registeredComponent }
  }

  async recordExposure(input: {
    experiment: ExperienceDefinition
    resolution: RuntimeResolution
    privacy: RuntimePrivacy
    occurredAt: string
  }) {
    return this.record(input, 'experiment_exposure', 'exposure')
  }

  async recordConversion(input: {
    experiment: ExperienceDefinition
    resolution: RuntimeResolution
    privacy: RuntimePrivacy
    goalKey: string
    occurredAt: string
  }) {
    if (!input.goalKey) throw new Error('A conversion goal key is required.')
    return this.record(input, 'experiment_conversion', 'conversion')
  }

  analyze(experiment: ExperienceDefinition, events: readonly FirstPartyEvent[]) {
    this.validateDefinition(experiment)
    return analyzeExperiment(
      experiment.variants.map((variant) => {
        const matches = events.filter(
          (event) =>
            event.context.siteId === experiment.siteId &&
            event.properties?.experimentId === experiment.id &&
            event.properties?.variantId === variant.id,
        )
        return {
          id: variant.id,
          isControl: variant.isControl,
          exposures: matches.filter((event) => event.eventType === 'experiment_exposure').length,
          conversions: matches.filter((event) => event.eventType === 'experiment_conversion')
            .length,
        }
      }),
    )
  }

  async approveWinner(input: {
    experiment: ExperienceDefinition
    selectedVariantId: string
    actorId: string
    reason: string
    humanApproved: boolean
    decidedAt: string
  }) {
    this.validateDefinition(input.experiment)
    if (!input.experiment.variants.some((variant) => variant.id === input.selectedVariantId))
      throw new Error('Selected variant is not registered for this experiment.')
    const state = approveWinner({
      state: input.experiment.state,
      selectedVariantId: input.selectedVariantId,
      humanApproved: input.humanApproved,
    })
    if (!this.decisions) throw new Error('A decision store is required to approve a winner.')
    await this.decisions.record({
      experimentId: input.experiment.id,
      selectedVariantId: input.selectedVariantId,
      actorId: input.actorId,
      reason: input.reason,
      decidedAt: input.decidedAt,
    })
    return state
  }

  health(experiments: readonly ExperienceDefinition[]) {
    try {
      experiments
        .filter((experiment) => experiment.state === 'running')
        .forEach((experiment) => this.validateDefinition(experiment))
      return { health: 'healthy' as const }
    } catch (error) {
      return {
        health: 'degraded' as const,
        detail: error instanceof Error ? error.message : 'Invalid experiment.',
      }
    }
  }

  private defaultResolution(
    experiment: ExperienceDefinition,
    variant: Variant,
    reason: NonNullable<RuntimeResolution['reason']>,
  ): RuntimeResolution {
    return {
      eligible: false,
      reason,
      assignment: deterministicAssignment({
        experimentId: experiment.id,
        salt: experiment.assignmentSalt,
        consented: false,
        collectionEnabled: false,
        variants: experiment.variants,
      }),
      component: variant.registeredComponent,
    }
  }

  private validateDefinition(experiment: ExperienceDefinition) {
    if (!experiment.variants.length) throw new Error('An experiment requires variants.')
    if (!experiment.variants.some((variant) => variant.isControl))
      throw new Error('An experiment requires a control variant.')
    for (const variant of experiment.variants)
      if (!this.registeredComponents.has(variant.registeredComponent))
        throw new Error(`Unregistered experiment component: ${variant.registeredComponent}`)
    for (const condition of experiment.conditions)
      if (!allowedInputs.has(condition.input))
        throw new Error(`Prohibited targeting input: ${condition.input}`)
  }

  private validateAudience(audience: ExperienceRuntimeRequest['audience']) {
    for (const key of Object.keys(audience ?? {}))
      if (!allowedInputs.has(key)) throw new Error(`Prohibited targeting input: ${key}`)
  }

  private async record(
    input: {
      experiment: ExperienceDefinition
      resolution: RuntimeResolution
      privacy: RuntimePrivacy
      goalKey?: string
      occurredAt: string
    },
    eventType: Extract<EventType, 'experiment_exposure' | 'experiment_conversion'>,
    kind: 'exposure' | 'conversion',
  ) {
    if (!input.resolution.eligible || !analyticsPermitted(input.privacy))
      return { recorded: false, deduplicated: false }
    const sourceEventId = experimentEventKey(
      kind,
      input.experiment.id,
      analyticsAssignmentKey(input.resolution.assignment),
      input.goalKey,
    )
    const event: FirstPartyEvent = {
      id: randomUUID(),
      eventType,
      occurredAt: input.occurredAt,
      receivedAt: input.occurredAt,
      identity: {},
      context: { siteId: input.experiment.siteId, sourceEventId },
      consentBasis: 'analytics-consent',
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      trusted: false,
      dedupeKey: '',
      properties: {
        experimentId: input.experiment.id,
        variantId: input.resolution.assignment.variantId,
        assignmentKey: analyticsAssignmentKey(input.resolution.assignment),
        ...(input.goalKey ? { goalKey: input.goalKey } : {}),
      },
    }
    const result = await this.analytics.record(event)
    return { recorded: !result.deduplicated, deduplicated: result.deduplicated }
  }
}

type DecisionsPayload = Pick<Payload, 'create'>

/** Persists explicit human approval in the existing experience decision ledger. */
export class PayloadExperimentDecisionStore implements ExperimentDecisionStore {
  constructor(private readonly payload: DecisionsPayload) {}

  async record(input: {
    experimentId: string
    selectedVariantId: string
    actorId: string
    reason: string
    decidedAt: string
  }) {
    await this.payload.create({
      collection: 'experiment-decisions',
      data: {
        experiment: input.experimentId,
        selectedVariant: input.selectedVariantId,
        decision: 'winner-selected',
        actor: input.actorId,
        reason: input.reason,
        decidedAt: input.decidedAt,
        approvalRequired: true,
        approvedBy: input.actorId,
        approvedAt: input.decidedAt,
      },
      overrideAccess: true,
    } as never)
  }
}
