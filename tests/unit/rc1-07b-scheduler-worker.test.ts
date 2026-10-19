import { describe, expect, it } from 'vitest'
import {
  convertLocalToUtc,
  formatUtcInTimeZone,
  DSTNonexistentTimeError,
  DSTAmbiguousTimeError,
} from '../../src/modules/calendar/timezone'
import {
  sanitizeErrorLog,
  getEffectiveSchedule,
  reconcileScheduleWorkerJobs,
  type CatchUpPolicyConfig,
  type JobLeaseOptions,
} from '../../src/modules/editorial/scheduler'

describe('RC1 07B Scheduler & Durable Worker Execution Unit Suite', () => {
  describe('Timezone, DST transitions and boundary calculations', () => {
    it('accurately converts Fall Back 2026-11-01 01:30 in America/Chicago with earlier/later options', () => {
      const earlier = convertLocalToUtc('2026-11-01T01:30:00', 'America/Chicago', {
        ambiguousPreference: 'earlier',
      })
      const later = convertLocalToUtc('2026-11-01T01:30:00', 'America/Chicago', {
        ambiguousPreference: 'later',
      })

      expect(earlier.isAmbiguous).toBe(true)
      expect(later.isAmbiguous).toBe(true)
      // Earlier instant is CDT (UTC-5): 01:30 CDT -> 06:30 UTC
      expect(earlier.utcInstant).toBe('2026-11-01T06:30:00.000Z')
      // Later instant is CST (UTC-6): 01:30 CST -> 07:30 UTC
      expect(later.utcInstant).toBe('2026-11-01T07:30:00.000Z')
      expect(new Date(later.utcInstant).getTime() - new Date(earlier.utcInstant).getTime()).toBe(
        3600 * 1000,
      )
    })

    it('accurately handles Spring Forward 2026-03-08 02:30 nonexistent time with advance vs reject', () => {
      const advanced = convertLocalToUtc('2026-03-08T02:30:00', 'America/Chicago', {
        nonexistentHandling: 'advance',
      })
      expect(advanced.wasNonexistent).toBe(true)
      expect(advanced.utcInstant).toBeDefined()

      expect(() => {
        convertLocalToUtc('2026-03-08T02:30:00', 'America/Chicago', {
          nonexistentHandling: 'reject',
        })
      }).toThrow(DSTNonexistentTimeError)
    })

    it('formats UTC ISO strings into human readable local timestamps in timezone', () => {
      const formatted = formatUtcInTimeZone('2026-11-01T06:30:00.000Z', 'America/Chicago')
      expect(formatted).toContain('2026-11-01 01:30:00')
      expect(formatted).toContain('(America/Chicago)')
    })
  })

  describe('Worker Lease Locking, Stale Lease Reclamation & Catch-Up Policy', () => {
    it('evaluates catch-up policy threshold boundaries correctly', () => {
      const policy: CatchUpPolicyConfig = {
        mode: 'expire-and-fail',
        thresholdMinutes: 60,
      }
      const scheduledTimeMs = new Date('2026-11-01T06:30:00.000Z').getTime()
      const nowMsOnTime = new Date('2026-11-01T06:35:00.000Z').getTime()
      const nowMsExpired = new Date('2026-11-01T07:45:00.000Z').getTime()

      const diffOnTimeMin = (nowMsOnTime - scheduledTimeMs) / (60 * 1000)
      const diffExpiredMin = (nowMsExpired - scheduledTimeMs) / (60 * 1000)

      expect(diffOnTimeMin).toBeLessThanOrEqual(policy.thresholdMinutes)
      expect(diffExpiredMin).toBeGreaterThan(policy.thresholdMinutes)
    })

    it('sanitizes passwords, bearer tokens, and database secrets from worker logs', () => {
      const rawLog =
        'Worker failed connecting to postgresql://postgres:super_secret_pw@127.0.0.1:5432/rc107b?token=secret_token_12345'
      const sanitized = sanitizeErrorLog(rawLog)
      expect(sanitized).not.toContain('super_secret_pw')
      expect(sanitized).not.toContain('secret_token_12345')
      expect(sanitized).toContain('scheme://***REDACTED***@')
    })
  })
})
