import { describe, expect, it } from 'vitest'

import { allowsCreatorTransition } from '../fixtures/creator-studio-transitions'

describe('CRE-00 proposed lifecycle boundaries', () => {
  it.each([
    ['capture', 'recoverable', 'processing'],
    ['live', 'replay-failed', 'replay-processing'],
    ['upload', 'quarantined', 'inspecting'],
    ['delivery', 'reconnecting', 'live'],
    ['job', 'retryable', 'queued'],
  ])('allows %s recovery from %s to %s', (family, from, to) => {
    expect(allowsCreatorTransition(family, from, to)).toBe(true)
  })

  it.each([
    ['capture', 'cancelled', 'recording'],
    ['live', 'live', 'archived'],
    ['upload', 'quarantined', 'published'],
    ['delivery', 'revoked', 'connecting'],
    ['job', 'succeeded', 'running'],
    ['constructor', 'live', 'ended'],
    ['live', 'toString', 'ended'],
  ])('denies %s transition from %s to %s', (family, from, to) => {
    expect(allowsCreatorTransition(family, from, to)).toBe(false)
  })
})
