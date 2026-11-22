// Proposed CRE-00 transitions for the proof harness. Production writes still
// need authorization, version checks and operation-specific preconditions.
const transitions: Record<string, Readonly<Record<string, readonly string[]>>> = {
  capture: {
    draft: ['preflight', 'cancelled'],
    preflight: ['ready', 'cancelled', 'failed'],
    ready: ['recording', 'cancelled'],
    recording: ['stopping', 'recoverable'],
    stopping: ['processing', 'recoverable'],
    recoverable: ['processing', 'cancelled'],
    processing: ['completed', 'failed'],
    failed: ['processing'],
    completed: [],
    cancelled: [],
  },
  live: {
    draft: ['scheduled'],
    scheduled: ['lobby'],
    lobby: ['starting'],
    starting: ['live', 'recoverable', 'failed'],
    live: ['ending', 'recoverable'],
    recoverable: ['live', 'ending', 'failed'],
    ending: ['ended', 'recoverable'],
    ended: ['replay-processing'],
    'replay-processing': ['archived', 'replay-failed'],
    'replay-failed': ['replay-processing'],
    failed: [],
    archived: [],
  },
  upload: {
    staged: ['inspecting'],
    inspecting: ['ready', 'quarantined', 'rejected'],
    quarantined: ['inspecting', 'removed'],
    ready: ['review', 'removed'],
    review: ['approved', 'rejected', 'removed'],
    approved: ['published', 'removed'],
    published: ['removed'],
    rejected: ['removed'],
    removed: [],
  },
  delivery: {
    unconfigured: ['validating'],
    validating: ['ready', 'failed'],
    ready: ['connecting', 'revoked'],
    connecting: ['live', 'reconnecting', 'failed', 'revoked'],
    live: ['reconnecting', 'ended', 'revoked'],
    reconnecting: ['live', 'failed', 'ended', 'revoked'],
    failed: [],
    ended: [],
    revoked: [],
  },
  job: {
    queued: ['running', 'cancelled'],
    running: ['succeeded', 'retryable', 'failed', 'cancelled'],
    retryable: ['queued', 'failed', 'cancelled'],
    succeeded: [],
    failed: [],
    cancelled: [],
  },
}

export function allowsCreatorTransition(family: string, from: string, to: string): boolean {
  if (!Object.hasOwn(transitions, family)) return false
  const states = transitions[family]!
  return Object.hasOwn(states, from) && states[from]!.includes(to)
}
