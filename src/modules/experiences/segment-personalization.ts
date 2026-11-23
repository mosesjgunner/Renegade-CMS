/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-19 (#35) — privacy-conscious personalization driven by real
 * audience-segment membership.
 *
 * The experiences runtime has always accepted a `consented-segment`
 * targeting input, but nothing in the product ever fed it: callers
 * supplied key/value audience attributes by hand, so "personalization"
 * was proven only against attributes a caller asserted, never against
 * the audience the operator actually defined. This resolver closes
 * that gap with the canonical segment evaluator: a subscriber counts
 * as a consented segment member exactly when
 * `evaluateSegmentRecipients` would include them in a send to that
 * segment (segment rules match, subscription active, address not
 * suppressed). Membership is computed per site — a segment from
 * another site can never personalize this one.
 *
 * Privacy shape: without personalization consent the runtime's own
 * privacy gate returns the default (control) resolution; when the
 * subscriber opts out (unsubscribe/suppression) they stop being an
 * eligible recipient, so the personalized variant stops resolving for
 * them with no separate opt-out plumbing.
 */
import type { Payload } from 'payload'

import { evaluateSegmentRecipients } from '../audience/service'
import {
  ExperiencesRuntimeService,
  type ExperienceDefinition,
  type RuntimePrivacy,
  type RuntimeResolution,
} from './service'

type Doc = Record<string, any>
const relationId = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object' && value && 'id' in value) return String((value as Doc).id)
  const str = String(value).trim()
  return str.length > 0 ? str : undefined
}

export type SegmentMembership = {
  member: boolean
  /** Why membership was denied, when it was: the honest boundary, named. */
  reason?: 'segment-not-found' | 'segment-site-mismatch' | 'not-eligible'
}

/** Consented membership of one subscriber in one segment, on one site. */
export async function consentedSegmentMembership(
  payload: Payload,
  input: { siteId: string; segmentId: string; subscriberId: string },
): Promise<SegmentMembership> {
  const segment = (await payload
    .findByID({
      collection: 'audience-segments',
      id: input.segmentId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as Doc | null
  if (!segment) return { member: false, reason: 'segment-not-found' }
  if (relationId(segment.site) !== input.siteId)
    return { member: false, reason: 'segment-site-mismatch' }
  const evaluation = await evaluateSegmentRecipients(payload, {
    siteId: input.siteId,
    segmentId: input.segmentId,
  })
  const member = evaluation.eligibleRecipients.some(
    (recipient) => recipient.subscriberId === input.subscriberId,
  )
  return member ? { member: true } : { member: false, reason: 'not-eligible' }
}

/**
 * Resolve an experience for a subscriber with the `consented-segment`
 * input fed from real segment membership. Experiments declare the
 * segment they target as a condition on that input
 * (`{ input: 'consented-segment', equals: '<segmentId>' }`); members
 * resolve through the normal deterministic assignment, everyone else
 * gets the runtime's default resolution.
 */
export async function resolveSegmentExperience(
  payload: Payload,
  runtime: ExperiencesRuntimeService,
  input: {
    siteId: string
    segmentId: string
    subscriberId: string
    experiment: ExperienceDefinition
    privacy: RuntimePrivacy
  },
): Promise<{ membership: SegmentMembership; resolution: RuntimeResolution }> {
  const membership = await consentedSegmentMembership(payload, input)
  const resolution = runtime.resolve(input.experiment, {
    subject: { kind: 'member', value: input.subscriberId },
    audience: membership.member ? { 'consented-segment': input.segmentId } : {},
    privacy: input.privacy,
  })
  return { membership, resolution }
}
