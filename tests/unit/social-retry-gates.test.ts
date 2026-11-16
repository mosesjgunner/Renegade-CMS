import { describe, expect, it } from 'vitest'

import {
  canOperatorRetrySocialQueueItem,
  canReconcileBoundedFailure,
  canRetrySocialQueueItem,
} from '../../src/modules/social/tasks'

// RC2-H-05: the automatic sweep retries only error kinds that are safe to
// repeat blindly. An operator's explicit per-item retry may also recover
// repairable provider refusals classified 'validation' (e.g. a disabled
// destination, HTTP 422 DestinationDisabled) — the class that previously
// had NO recovery path. Both gates keep the duplicate-safety guards: an
// unknown remote outcome is never blind-retried, and the attempt bound
// and the backoff due-time still apply.
describe('social retry gates (RC2-H-05)', () => {
  const now = Date.parse('2026-11-14T12:00:00.000Z')
  const failed = (over: Record<string, unknown> = {}) => ({
    status: 'failed',
    attemptCount: 1,
    nextAttemptAt: null,
    deadLetterReason: { kind: 'transient', remoteOutcome: 'failed' },
    ...over,
  })

  it('automatic gate retries transient and rate-limit failures', () => {
    expect(canRetrySocialQueueItem(failed(), now)).toBe(true)
    expect(
      canRetrySocialQueueItem(
        failed({ deadLetterReason: { kind: 'rate-limit', remoteOutcome: 'failed' } }),
        now,
      ),
    ).toBe(true)
  })

  it('automatic gate refuses a validation-class refusal; the operator gate allows it', () => {
    const destinationDisabled = failed({
      deadLetterReason: {
        kind: 'validation',
        providerCode: 'DestinationDisabled',
        remoteOutcome: 'failed',
      },
    })
    expect(canRetrySocialQueueItem(destinationDisabled, now)).toBe(false)
    expect(canOperatorRetrySocialQueueItem(destinationDisabled, now)).toBe(true)
  })

  it('both gates refuse an unknown remote outcome (reconcile first, never blind-retry)', () => {
    const unknown = failed({
      deadLetterReason: { kind: 'transient', remoteOutcome: 'unknown' },
    })
    expect(canRetrySocialQueueItem(unknown, now)).toBe(false)
    expect(canOperatorRetrySocialQueueItem(unknown, now)).toBe(false)
  })

  it('both gates respect the attempt bound and the backoff due time', () => {
    expect(canOperatorRetrySocialQueueItem(failed({ attemptCount: 3 }), now)).toBe(false)
    expect(canRetrySocialQueueItem(failed({ attemptCount: 3 }), now)).toBe(false)
    const notDue = failed({ nextAttemptAt: '2026-11-14T12:05:00.000Z' })
    expect(canRetrySocialQueueItem(notDue, now)).toBe(false)
    expect(canOperatorRetrySocialQueueItem(notDue, now)).toBe(false)
    const due = failed({ nextAttemptAt: '2026-11-14T11:55:00.000Z' })
    expect(canRetrySocialQueueItem(due, now)).toBe(true)
    expect(canOperatorRetrySocialQueueItem(due, now)).toBe(true)
  })

  it('neither gate touches a non-failed item', () => {
    expect(canRetrySocialQueueItem(failed({ status: 'published' }), now)).toBe(false)
    expect(canOperatorRetrySocialQueueItem(failed({ status: 'scheduled' }), now)).toBe(false)
  })

  // RC2-DEBT-25: retry stays exhausted at the bound, but a bounded-out
  // failed item becomes eligible for read-only reconcile — the settle
  // path for a lose-response provider that committed the post on the
  // final attempt while the item recorded a known failure.
  it('bounded-out failures are reconcile-eligible but never retry-eligible', () => {
    const bounded = failed({ attemptCount: 3 })
    expect(canReconcileBoundedFailure(bounded)).toBe(true)
    expect(canRetrySocialQueueItem(bounded, now)).toBe(false)
    expect(canOperatorRetrySocialQueueItem(bounded, now)).toBe(false)
    expect(canReconcileBoundedFailure(failed({ attemptCount: 2 }))).toBe(false)
    expect(canReconcileBoundedFailure(failed({ attemptCount: 3, status: 'unknown' }))).toBe(false)
    expect(canReconcileBoundedFailure(failed({ attemptCount: 3, status: 'published' }))).toBe(false)
  })
})
