/**
 * POD-04 (POD-REQ-09, POD-REQ-10): pure production state-machine and
 * guest-admission evaluation. The Payload-backed walk, publish guards,
 * calendar entries, and feed effects are proven by
 * tests/integration/podcast-studio-l1.integration.test.ts.
 */
import { describe, expect, it } from 'vitest'

import {
  canTransitionProduction,
  evaluateGuestAdmission,
  isProductionState,
  PRODUCTION_STATES,
  publicStatusForProductionState,
} from '../../src/modules/podcast-studio/production'

describe('POD-04 production state machine', () => {
  it('walks the full lifecycle idea → published and the withdraw/restore loop', () => {
    const walk = [
      'idea',
      'scripted',
      'scheduled-record',
      'recorded',
      'editing',
      'review',
      'scheduled',
      'published',
      'withdrawn',
      'published',
    ] as const
    for (let i = 1; i < walk.length; i++) {
      expect(canTransitionProduction(walk[i - 1], walk[i]), `${walk[i - 1]} → ${walk[i]}`).toBe(
        true,
      )
    }
  })

  it('rejects jumps that skip the desk (idea → published, published → editing, withdrawn → review)', () => {
    expect(canTransitionProduction('idea', 'published')).toBe(false)
    expect(canTransitionProduction('idea', 'review')).toBe(false)
    expect(canTransitionProduction('published', 'editing')).toBe(false)
    expect(canTransitionProduction('published', 'published')).toBe(true) // idempotent no-op
    expect(canTransitionProduction('withdrawn', 'review')).toBe(false)
    expect(canTransitionProduction('recorded', 'published')).toBe(false)
  })

  it('every state can reach withdrawn except withdrawn itself (no-op)', () => {
    for (const state of PRODUCTION_STATES) {
      expect(canTransitionProduction(state, 'withdrawn'), `${state} → withdrawn`).toBe(true)
    }
  })

  it('keeps the public status in sync per state', () => {
    expect(publicStatusForProductionState('published')).toBe('published')
    expect(publicStatusForProductionState('withdrawn')).toBe('unavailable')
    expect(publicStatusForProductionState('scheduled')).toBe('scheduled')
    for (const state of [
      'idea',
      'scripted',
      'scheduled-record',
      'recorded',
      'editing',
      'review',
    ] as const) {
      expect(publicStatusForProductionState(state)).toBe('draft')
    }
  })

  it('recognises only the nine production states', () => {
    for (const state of PRODUCTION_STATES) expect(isProductionState(state)).toBe(true)
    expect(isProductionState('live')).toBe(false)
    expect(isProductionState('')).toBe(false)
    expect(isProductionState(null)).toBe(false)
  })
})

describe('POD-04 guest admission evaluation', () => {
  const consented = [{ id: 'a1', consentAt: '2026-11-18T00:00:00.000Z' }]
  const unconsented = [{ id: 'a2', consentAt: null }]

  it('off never flags, even with no consent anywhere', () => {
    expect(evaluateGuestAdmission('off', unconsented)).toMatchObject({ ready: true, warnings: [] })
    expect(evaluateGuestAdmission('off', [])).toMatchObject({ ready: true, warnings: [] })
  })

  it('warn flags missing consent but admits', () => {
    const admission = evaluateGuestAdmission('warn', unconsented)
    expect(admission.ready).toBe(true)
    expect(admission.warnings).toHaveLength(1)
    expect(admission.missingAppearanceIds).toEqual(['a2'])
  })

  it('warn treats a guest with no appearance on file as missing', () => {
    const admission = evaluateGuestAdmission('warn', [])
    expect(admission.ready).toBe(true)
    expect(admission.warnings).toHaveLength(1)
  })

  it('block refuses missing consent and admits recorded consent', () => {
    expect(evaluateGuestAdmission('block', unconsented).ready).toBe(false)
    expect(evaluateGuestAdmission('block', []).ready).toBe(false)
    expect(evaluateGuestAdmission('block', consented)).toMatchObject({
      ready: true,
      warnings: [],
      missingAppearanceIds: [],
    })
  })

  it('an unknown policy falls back to warn', () => {
    expect(evaluateGuestAdmission(undefined, unconsented).policy).toBe('warn')
    expect(evaluateGuestAdmission('bogus', unconsented).policy).toBe('warn')
  })
})
