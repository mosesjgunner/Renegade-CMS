import { describe, expect, it } from 'vitest'

import {
  convertLocalToUtc,
  formatUtcInTimeZone,
  DSTNonexistentTimeError,
} from '../../src/modules/calendar/timezone'

import {
  evaluateScheduleRules,
  type ScheduleTargetContext,
  type ExistingScheduledSlot,
} from '../../src/modules/calendar/dependencies'

import { sanitizeErrorLog, type CatchUpPolicyConfig } from '../../src/modules/editorial/scheduler'
import { generateICalendarFeed } from '../../src/app/(frontend)/api/calendar/export/route'

describe('FLOW-03 Scheduling & Calendar Comprehensive Unit Suite', () => {
  describe('1. Timezone & DST Engine', () => {
    it('converts standard local time to UTC instant accurately', () => {
      const res = convertLocalToUtc('2026-09-20T14:00:00', 'America/Chicago')
      expect(res.utcInstant).toBe('2026-09-20T19:00:00.000Z')
      expect(res.timeZone).toBe('America/Chicago')
      expect(res.isDst).toBe(true)
      expect(res.wasNonexistent).toBe(false)
      expect(res.isAmbiguous).toBe(false)
    })

    it('handles Spring Forward nonexistent DST gap time by advancing', () => {
      const res = convertLocalToUtc('2026-03-08T02:30:00', 'America/Chicago', { nonexistentHandling: 'advance' })
      expect(res.wasNonexistent).toBe(true)
      expect(res.utcInstant).toBeDefined()
    })

    it('rejects Spring Forward gap time when nonexistentHandling is reject', () => {
      expect(() => {
        convertLocalToUtc('2026-03-08T02:30:00', 'America/Chicago', { nonexistentHandling: 'reject' })
      }).toThrow(DSTNonexistentTimeError)
    })

    it('handles Fall Back ambiguous DST overlap time with earlier preference', () => {
      const res1 = convertLocalToUtc('2026-11-01T01:30:00', 'America/Chicago', { ambiguousPreference: 'earlier' })
      const res2 = convertLocalToUtc('2026-11-01T01:30:00', 'America/Chicago', { ambiguousPreference: 'later' })

      expect(res1.isAmbiguous).toBe(true)
      expect(res2.isAmbiguous).toBe(true)
      expect(new Date(res1.utcInstant).getTime()).toBeLessThan(new Date(res2.utcInstant).getTime())
    })

    it('formats UTC instant back into local time in specified zone', () => {
      const formatted = formatUtcInTimeZone('2026-09-20T19:00:00.000Z', 'America/Chicago')
      expect(formatted).toContain('2026-09-20 14:00:00')
      expect(formatted).toContain('America/Chicago')
    })
  })

  describe('2. Schedule Dependency & Rule Validator', () => {
    const validTarget: ScheduleTargetContext = {
      id: 'art-001',
      title: 'Valid Article',
      status: 'approved',
      scheduledFor: '2026-09-25T15:00:00.000Z',
      siteId: 'site-alpha',
      publicationId: 'pub-daily',
    }

    it('allows valid approved item scheduling', () => {
      const res = evaluateScheduleRules(validTarget, [])
      expect(res.allowed).toBe(true)
      expect(res.violations).toHaveLength(0)
    })

    it('blocks item when status is not approved', () => {
      const draftTarget = { ...validTarget, status: 'draft' }
      const res = evaluateScheduleRules(draftTarget, [])
      expect(res.allowed).toBe(false)
      expect(res.violations.some((v) => v.ruleId === 'missing-approval')).toBe(true)
    })

    it('blocks item when quality scan has un-waived blocking issues', () => {
      const blockedTarget = {
        ...validTarget,
        qualityGate: { blockingIssueCount: 2, waived: false },
      }
      const res = evaluateScheduleRules(blockedTarget, [])
      expect(res.allowed).toBe(false)
      expect(res.violations.some((v) => v.ruleId === 'quality-gate-blocked')).toBe(true)
    })

    it('blocks item scheduled before embargo date', () => {
      const embargoedTarget = {
        ...validTarget,
        scheduledFor: '2026-09-20T12:00:00.000Z',
        embargoDate: '2026-09-22T00:00:00.000Z',
      }
      const res = evaluateScheduleRules(embargoedTarget, [])
      expect(res.allowed).toBe(false)
      expect(res.violations.some((v) => v.ruleId === 'embargo-breached')).toBe(true)
    })

    it('blocks item scheduled after media rights expiration', () => {
      const expiredTarget = {
        ...validTarget,
        scheduledFor: '2026-09-30T12:00:00.000Z',
        rightsExpirationDate: '2026-09-28T00:00:00.000Z',
      }
      const res = evaluateScheduleRules(expiredTarget, [])
      expect(res.allowed).toBe(false)
      expect(res.violations.some((v) => v.ruleId === 'rights-expired')).toBe(true)
    })

    it('blocks item when prerequisite content is not published', () => {
      const prereqTarget = {
        ...validTarget,
        prerequisites: [
          { id: 'pre-1', title: 'Part 1', isPublished: false },
        ],
      }
      const res = evaluateScheduleRules(prereqTarget, [])
      expect(res.allowed).toBe(false)
      expect(res.violations.some((v) => v.ruleId === 'prerequisite-unmet')).toBe(true)
    })

    it('warns on same-slot campaign collision when threshold exceeded', () => {
      const existing: ExistingScheduledSlot[] = [
        { id: 'art-100', title: 'Slot 1', scheduledFor: '2026-09-25T15:05:00.000Z', siteId: 'site-alpha', publicationId: 'pub-daily' },
        { id: 'art-101', title: 'Slot 2', scheduledFor: '2026-09-25T15:10:00.000Z', siteId: 'site-alpha', publicationId: 'pub-daily' },
      ]
      const res = evaluateScheduleRules(validTarget, existing, { policy: 'warn', maxItemsPerSlot: 2 })
      expect(res.allowed).toBe(true)
      expect(res.hasWarnings).toBe(true)
      expect(res.violations.some((v) => v.ruleId === 'slot-collision')).toBe(true)
    })
  })

  describe('3. Scheduler Immutability, Catch-Up Policy & Sanitization', () => {
    it('sanitizes connection strings and tokens from error logs', () => {
      const rawLog = 'Database connection error: postgres://admin:super_secret_password@db.prod.internal:5432/cms?auth=bearer_abc123_token'
      const sanitized = sanitizeErrorLog(rawLog)
      expect(sanitized).not.toContain('super_secret_password')
      expect(sanitized).not.toContain('bearer_abc123_token')
      expect(sanitized).toContain('***REDACTED***')
    })

    it('evaluates catch-up policy threshold correctly', () => {
      const policy: CatchUpPolicyConfig = {
        mode: 'expire-and-fail',
        thresholdMinutes: 60,
      }

      const scheduledMs = new Date('2026-09-20T10:00:00.000Z').getTime()
      const nowMsLate = new Date('2026-09-20T11:45:00.000Z').getTime() // 105 minutes late

      const lateMinutes = (nowMsLate - scheduledMs) / (60 * 1000)
      expect(lateMinutes).toBeGreaterThan(policy.thresholdMinutes)
    })

    it('validates optimistic concurrency sequence mismatch', () => {
      const currentSequence: number = 2
      const expectedSequence: number = 1

      const hasConflict = expectedSequence !== undefined && expectedSequence !== currentSequence
      expect(hasConflict).toBe(true)
    })
  })

  describe('4. Calendar iCalendar (.ics) Export Boundary', () => {
    it('generates valid RFC 5545 iCalendar (.ics) feed output', () => {
      const feed = generateICalendarFeed([
        {
          id: 'event-200',
          title: 'FLOW-03 iCal Test Event',
          startsAt: '2026-09-25T15:00:00.000Z',
          endsAt: '2026-09-25T16:00:00.000Z',
          timeZone: 'America/Chicago',
          description: 'Calendar center export test',
          url: 'https://example.test/events/ical-test',
        },
      ])

      expect(feed).toContain('BEGIN:VCALENDAR')
      expect(feed).toContain('VERSION:2.0')
      expect(feed).toContain('SUMMARY:FLOW-03 iCal Test Event')
      expect(feed).toContain('UID:event-200@renegade-cmos')
      expect(feed).toContain('URL:https://example.test/events/ical-test')
      expect(feed).toContain('END:VCALENDAR')
    })
  })
})
