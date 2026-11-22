import { describe, expect, it } from 'vitest'
import {
  assertSocialTransition,
  campaignState,
  canTransitionSocial,
} from '../../src/modules/social/contracts'

describe('RC3-16 evergreen + manual-handoff state contract', () => {
  it('allows pause from queued/scheduled and resume back, nothing else', () => {
    expect(canTransitionSocial('scheduled', 'paused')).toBe(true)
    expect(canTransitionSocial('queued', 'paused')).toBe(true)
    expect(canTransitionSocial('paused', 'scheduled')).toBe(true)
    expect(canTransitionSocial('paused', 'queued')).toBe(true)
    expect(canTransitionSocial('paused', 'cancelled')).toBe(true)
    expect(canTransitionSocial('paused', 'publishing')).toBe(false)
    expect(canTransitionSocial('published', 'paused')).toBe(false)
    expect(canTransitionSocial('failed', 'paused')).toBe(false)
    expect(() => assertSocialTransition('published', 'paused')).toThrow(/Cannot move/)
  })

  it('routes publishing to manual-handoff and manual-handoff only to published/cancelled', () => {
    expect(canTransitionSocial('publishing', 'manual-handoff')).toBe(true)
    expect(canTransitionSocial('manual-handoff', 'published')).toBe(true)
    expect(canTransitionSocial('manual-handoff', 'cancelled')).toBe(true)
    expect(canTransitionSocial('manual-handoff', 'publishing')).toBe(false)
    expect(canTransitionSocial('scheduled', 'manual-handoff')).toBe(false)
    expect(canTransitionSocial('scheduled', 'published')).toBe(false)
  })

  it('campaign state treats a pending handoff as in-flight and a paused variant as scheduled', () => {
    expect(campaignState(['manual-handoff'])).toBe('publishing')
    expect(campaignState(['published', 'manual-handoff'])).toBe('publishing')
    expect(campaignState(['paused'])).toBe('scheduled')
    expect(campaignState(['published', 'paused'])).toBe('scheduled')
    expect(campaignState(['published'])).toBe('published')
  })
})
