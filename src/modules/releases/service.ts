/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload'
import { assertIanaTimeZone } from '../calendar/contracts'
import { releaseEligible, type QualityFinding } from '../quality/contracts'

type Doc = Record<string, any>
/** Canonical ContentRelease scheduling command. Calendar callers must use this boundary. */
export async function scheduleContentRelease(
  payload: Payload,
  input: {
    releaseId: string
    scheduledFor: string
    timeZone: string
    actorId: string
    idempotencyKey: string
    qualityFindings?: readonly QualityFinding[]
  },
) {
  assertIanaTimeZone(input.timeZone)
  if (input.qualityFindings && !releaseEligible(input.qualityFindings))
    throw new Error('ContentRelease is blocked by unresolved publication-blocking quality issues.')
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: input.releaseId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (release.lastScheduleMutationId === input.idempotencyKey) return release
  const before = { scheduledFor: release.scheduledFor ?? null, timeZone: release.timeZone ?? null }
  const updated = await payload.update({
    collection: 'content-releases' as never,
    id: input.releaseId,
    data: {
      scheduledFor: input.scheduledFor,
      timeZone: input.timeZone,
      status: 'scheduled',
      lastScheduleMutationId: input.idempotencyKey,
      scheduleAudit: [
        ...(Array.isArray(release.scheduleAudit) ? release.scheduleAudit : []),
        {
          action: 'release.rescheduled',
          actorId: input.actorId,
          at: new Date().toISOString(),
          before,
          after: { scheduledFor: input.scheduledFor, timeZone: input.timeZone },
        },
      ],
    },
    overrideAccess: true,
  } as never)
  return updated
}
