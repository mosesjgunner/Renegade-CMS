import { describe, expect, it } from 'vitest'
import {
  AUDIENCE_METRIC_DICTIONARY,
  PRIVACY_MASKED_VALUE,
  PRIVACY_MIN_COHORT_SIZE,
  applyPrivacyThreshold,
  isPrivacyMasked,
} from '../../src/modules/audience/command-center-contracts'
import {
  evaluateAudienceHealth,
  exportAudienceSummaryReport,
  projectUnifiedAudienceCalendar,
} from '../../src/modules/audience/command-center-service'
import { normalizeEmailAddress } from '../../src/modules/audience/contracts'
import { normalizeE164Phone } from '../../src/modules/telecom/contracts'

describe('RC1 Subpass 09D: CRM Views, Metrics and Audience Acceptance Unit Tests', () => {
  // =========================================================================
  // 1. CRM Search & Filtering Invariants
  // =========================================================================
  describe('CRM Search, Normalization and Status Classification', () => {
    it('normalizes email addresses consistently for lookup and deduplication', () => {
      const email1 = '  Test.User+Promo@Example.COM  '
      const normalized = normalizeEmailAddress(email1)
      expect(normalized).toBe('test.user+promo@example.com')
    })

    it('rejects invalid email addresses cleanly without throwing uncaught exceptions', () => {
      expect(() => normalizeEmailAddress('not-an-email')).toThrow(/email/i)
      expect(() => normalizeEmailAddress('@missing-local.com')).toThrow(/email/i)
    })

    it('normalizes E.164 phone numbers with country code verification', () => {
      const phone = '+1 (555) 234-5678'
      const normalized = normalizeE164Phone(phone)
      expect(normalized.e164).toBe('+15552345678')
      expect(normalized.countryCallingCode).toBe('+1')
      expect(normalized.nationalNumber).toBe('5552345678')
    })

    it('classifies CRM contact statuses across the approved domain', () => {
      const approvedStatuses = ['lead', 'active', 'inactive', 'blocked', 'archived']
      const testContacts = [
        { id: 'c1', displayName: 'Lead User', status: 'lead' },
        { id: 'c2', displayName: 'Active Member', status: 'active' },
        { id: 'c3', displayName: 'Dormant User', status: 'inactive' },
        { id: 'c4', displayName: 'Spammer', status: 'blocked' },
        { id: 'c5', displayName: 'Old Record', status: 'archived' },
      ]

      for (const contact of testContacts) {
        expect(approvedStatuses).toContain(contact.status)
      }

      // Filter by status
      const activeContacts = testContacts.filter((c) => c.status === 'active')
      expect(activeContacts).toHaveLength(1)
      expect(activeContacts[0].id).toBe('c2')
    })

    it('filters contacts matching search query across name, email, or phone', () => {
      const contacts = [
        { id: 'c1', displayName: 'Alice Green', email: 'alice@example.com', phoneE164: '+15551112222' },
        { id: 'c2', displayName: 'Bob Smith', email: 'bob@work.org', phoneE164: '+15553334444' },
        { id: 'c3', displayName: 'Charlie Davis', email: 'cdavis@sample.net', phoneE164: '+15555556666' },
      ]

      const filterByQuery = (q: string) => {
        const lower = q.toLowerCase()
        return contacts.filter(
          (c) =>
            c.displayName.toLowerCase().includes(lower) ||
            c.email.toLowerCase().includes(lower) ||
            c.phoneE164.includes(lower),
        )
      }

      expect(filterByQuery('alice')).toHaveLength(1)
      expect(filterByQuery('work.org')).toHaveLength(1)
      expect(filterByQuery('555555')).toHaveLength(1)
      expect(filterByQuery('nonexistent')).toHaveLength(0)
    })
  })

  // =========================================================================
  // 2. Metrics & Advertised vs Actual Transport Reconciliation
  // =========================================================================
  describe('Audience Metrics & Delivery Reconciliation', () => {
    it('enforces that provider_accepted is distinct from carrier_delivered', () => {
      const acceptedMetric = AUDIENCE_METRIC_DICTIONARY.find((m) => m.key === 'provider_accepted')
      const deliveredMetric = AUDIENCE_METRIC_DICTIONARY.find((m) => m.key === 'carrier_delivered')

      expect(acceptedMetric).toBeDefined()
      expect(deliveredMetric).toBeDefined()

      // Provider accepted MUST state transport handoff uncertainty
      expect(acceptedMetric?.uncertaintyLabel).toMatch(/transport handoff/i)
      expect(acceptedMetric?.definition).toMatch(/not proof of recipient inbox/i)

      // Delivered metric requires carrier DLR
      expect(deliveredMetric?.definition).toMatch(/delivery receipt|DLR|DSN/i)
    })

    it('labels observed opens with explicit proxy cache and bot prefetch caveats', () => {
      const openMetric = AUDIENCE_METRIC_DICTIONARY.find((m) => m.key === 'observed_opens')
      expect(openMetric).toBeDefined()
      expect(openMetric?.caveats.some((c) => c.includes('Apple Mail Privacy Protection'))).toBe(true)
      expect(openMetric?.uncertaintyLabel).toMatch(/proxy cache/i)
    })

    it('filters corporate email bot scanners from observed clicks', () => {
      const clickMetric = AUDIENCE_METRIC_DICTIONARY.find((m) => m.key === 'observed_clicks')
      expect(clickMetric).toBeDefined()
      expect(clickMetric?.formula).toContain('NOT is_bot')
      expect(clickMetric?.caveats.some((c) => c.includes('Barracuda') || c.includes('scanners'))).toBe(true)
    })

    it('evaluates deliverability health thresholds with accurate severity alerts', () => {
      // Normal health
      const normalHealth = evaluateAudienceHealth({
        siteId: 'site-1',
        totalSentRecently: 1000,
        hardBouncesRecently: 5, // 0.5% - below 2%
        complaintsRecently: 0,
        queueAgeMinutesMax: 10,
        webhookLagSecondsMax: 30,
        staleSegmentCount: 0,
        invalidFormCount: 0,
        failingAutomationsCount: 0,
        emailProviderName: 'resend',
        emailProviderStatus: 'healthy',
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        tlsVerified: true,
        telecomProviderName: 'telnyx',
        telecomProviderStatus: 'healthy',
        telecomOutboundAllowed: true,
      })

      expect(normalHealth.metrics.hardBounceRate.severity).toBe('normal')
      expect(normalHealth.metrics.complaintRate.severity).toBe('normal')

      // Critical bounce rate (> 4%) and complaint rate (> 0.2%)
      const degradedHealth = evaluateAudienceHealth({
        siteId: 'site-1',
        totalSentRecently: 1000,
        hardBouncesRecently: 65, // 6.5% - critical (thresholdCritical is 4.0%)
        complaintsRecently: 3, // 0.30% - critical (thresholdCritical is 0.2%)
        queueAgeMinutesMax: 120, // warning (thresholdWarning is 60)
        webhookLagSecondsMax: 4000, // critical (thresholdCritical is 3600)
        staleSegmentCount: 2,
        invalidFormCount: 1,
        failingAutomationsCount: 1,
        emailProviderName: 'smtp',
        emailProviderStatus: 'degraded',
        spfVerified: true,
        dkimVerified: false,
        dmarcVerified: false,
        tlsVerified: true,
        telecomProviderName: 'telnyx',
        telecomProviderStatus: 'healthy',
        telecomOutboundAllowed: true,
      })

      expect(degradedHealth.metrics.hardBounceRate.severity).toBe('critical')
      expect(degradedHealth.metrics.complaintRate.severity).toBe('critical')
      expect(degradedHealth.metrics.queueAgeMinutes.severity).toBe('warning')
      expect(degradedHealth.metrics.webhookLagSeconds.severity).toBe('critical')
    })
  })

  // =========================================================================
  // 3. Privacy-Preserving Export & K-Anonymity Policy (N ≥ 5)
  // =========================================================================
  describe('Privacy Preserving Export & K-Anonymity', () => {
    it('masks any cohort count below 5 (non-zero) with standard privacy value, leaving 0 as 0', () => {
      expect(applyPrivacyThreshold(0)).toBe(0)
      expect(applyPrivacyThreshold(1)).toBe(PRIVACY_MASKED_VALUE)
      expect(applyPrivacyThreshold(4)).toBe(PRIVACY_MASKED_VALUE)
      expect(isPrivacyMasked(PRIVACY_MASKED_VALUE)).toBe(true)

      // Counts >= 5 are preserved
      expect(applyPrivacyThreshold(5)).toBe(5)
      expect(applyPrivacyThreshold(42)).toBe(42)
      expect(isPrivacyMasked(42)).toBe(false)
    })

    it('exports aggregate operational report with masked micro-cohorts and metadata header', () => {
      const report = exportAudienceSummaryReport({
        siteId: 'test-site-09d',
        userRole: 'administrator',
        windowLabel: 'Last 30 Days',
        metrics: [
          {
            key: 'active_subscribers',
            label: 'Active Subscribers',
            channel: 'multi',
            count: 3, // < 5: must be masked
            definition: 'Active opt-in recipients',
            caveats: 'Subject to unsubs',
          },
          {
            key: 'total_deliveries',
            label: 'Total Deliveries',
            channel: 'email',
            count: 150, // >= 5: preserved
            definition: 'MTA accepted dispatches',
            caveats: 'Transport handoff only',
          },
        ],
        cohorts: [
          {
            dimension: 'Tier',
            label: 'VIP',
            eligible: 2, // masked (< 5)
            delivered: 2, // masked (< 5)
            observedClicks: 1, // masked (< 5)
            conversions: 1, // masked (< 5)
          },
          {
            dimension: 'Tier',
            label: 'Standard',
            eligible: 200,
            delivered: 195,
            observedClicks: 25,
            conversions: 10,
          },
        ],
      })

      expect(report.csv).toContain('# Site ID: test-site-09d')
      expect(report.csv).toContain(`# Role: administrator`)
      expect(report.csv).toContain(`All cohorts with < ${PRIVACY_MIN_COHORT_SIZE} subjects are masked`)

      // Active subscribers count was 3, should appear as < 5 in CSV
      expect(report.csv).toContain(`active_subscribers,"Active Subscribers",multi,< 5`)
      // Total deliveries count was 150, should appear unmasked
      expect(report.csv).toContain(`total_deliveries,"Total Deliveries",email,150`)

      // VIP cohort counts should all be masked
      expect(report.csv).toContain(`"Tier","VIP",< 5,< 5,< 5,< 5`)
      // Standard cohort should have exact counts
      expect(report.csv).toContain(`"Tier","Standard",200,195,25,10`)
    })

    it('rejects unauthorized export requests from roles without staff or admin privilege', () => {
      expect(() =>
        exportAudienceSummaryReport({
          siteId: 'test-site-09d',
          userRole: 'subscriber',
          windowLabel: 'All time',
          metrics: [],
          cohorts: [],
        }),
      ).toThrow(/unauthorized/i)
    })
  })

  // =========================================================================
  // 4. Unified Calendar & Quiet Hours Scheduling
  // =========================================================================
  describe('Unified Dispatch Schedule & Quiet Hours', () => {
    it('detects quiet hours violations for telecom dispatches outside 8 AM - 9 PM', () => {
      const items = [
        {
          id: 'camp-night',
          siteId: 'site-1',
          title: 'Midnight Flash Promo',
          channel: 'sms' as const,
          itemType: 'campaign' as const,
          status: 'scheduled' as const,
          scheduledFor: '2026-10-21T03:00:00Z', // 3:00 AM UTC
          completedAt: null,
          timeZone: 'UTC',
          targetAudienceLabel: 'All SMS Subscribers',
          estimatedRecipients: 50,
        },
        {
          id: 'camp-day',
          siteId: 'site-1',
          title: 'Noon Weekly Update',
          channel: 'sms' as const,
          itemType: 'campaign' as const,
          status: 'scheduled' as const,
          scheduledFor: '2026-10-21T14:00:00Z', // 2:00 PM UTC
          completedAt: null,
          timeZone: 'UTC',
          targetAudienceLabel: 'All SMS Subscribers',
          estimatedRecipients: 50,
        },
      ]

      const calendar = projectUnifiedAudienceCalendar(items)
      const night = calendar.find((c) => c.id === 'camp-night')
      const day = calendar.find((c) => c.id === 'camp-day')

      expect(night?.isWithinQuietHours).toBe(true)
      expect(night?.warnings.some((w) => w.includes('Quiet Hours'))).toBe(true)

      expect(day?.isWithinQuietHours).toBe(false)
      expect(day?.warnings).toHaveLength(0)
    })

    it('detects frequency conflicts when multiple campaigns target the same segment on the same day', () => {
      const items = [
        {
          id: 'camp-1',
          siteId: 'site-1',
          title: 'Morning Blast',
          channel: 'email' as const,
          itemType: 'campaign' as const,
          status: 'scheduled' as const,
          scheduledFor: '2026-10-25T09:00:00Z',
          completedAt: null,
          timeZone: 'UTC',
          targetAudienceLabel: 'VIP Segment',
          targetSegmentId: 'seg-vip',
          estimatedRecipients: 100,
        },
        {
          id: 'camp-2',
          siteId: 'site-1',
          title: 'Evening Blast',
          channel: 'email' as const,
          itemType: 'campaign' as const,
          status: 'scheduled' as const,
          scheduledFor: '2026-10-25T18:00:00Z',
          completedAt: null,
          timeZone: 'UTC',
          targetAudienceLabel: 'VIP Segment',
          targetSegmentId: 'seg-vip',
          estimatedRecipients: 100,
        },
      ]

      const calendar = projectUnifiedAudienceCalendar(items)
      expect(calendar[0].hasFrequencyConflict).toBe(true)
      expect(calendar[0].warnings.some((w) => w.includes('Frequency Conflict'))).toBe(true)
      expect(calendar[1].hasFrequencyConflict).toBe(true)
    })
  })
})
