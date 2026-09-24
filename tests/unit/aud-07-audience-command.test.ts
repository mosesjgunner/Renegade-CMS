import { describe, expect, it } from 'vitest'
import {
  AUDIENCE_METRIC_DICTIONARY,
  PRIVACY_MASKED_VALUE,
  PRIVACY_MIN_COHORT_SIZE,
  applyPrivacyThreshold,
  isPrivacyMasked,
  type AudienceExperiment,
} from '../../src/modules/audience/command-center-contracts'
import {
  assignRecipientToVariant,
  buildCampaignTrackingUrl,
  classifyClickAgent,
  computeExperimentAllocationsHash,
  evaluateAudienceHealth,
  evaluateExperimentGuardrails,
  exportAudienceSummaryReport,
  projectCampaignFunnel,
  projectUnifiedAudienceCalendar,
  recordExperimentWinnerDecision,
} from '../../src/modules/audience/command-center-service'

describe('AUD-07 Audience Command Center, Metrics & Bounded Experiments', () => {
  // =========================================================================
  // 1. Metric Dictionary & Source-Labeled Event Model
  // =========================================================================
  describe('Metric Dictionary & Invariants', () => {
    it('defines formal source-labeled entries with non-empty formulas and categories', () => {
      expect(AUDIENCE_METRIC_DICTIONARY.length).toBeGreaterThanOrEqual(14)

      for (const entry of AUDIENCE_METRIC_DICTIONARY) {
        expect(entry.key).toBeTruthy()
        expect(entry.label).toBeTruthy()
        expect(entry.formula).toBeTruthy()
        expect(entry.numerator).toBeTruthy()
        expect(entry.definition).toBeTruthy()
        expect(entry.source).toBeTruthy()
        expect(Array.isArray(entry.caveats)).toBe(true)
        expect(entry.caveats.length).toBeGreaterThan(0)
      }
    })

    it('distinguishes provider_accepted from carrier_delivered and marks accepted as transport handoff', () => {
      const accepted = AUDIENCE_METRIC_DICTIONARY.find((e) => e.key === 'provider_accepted')
      const delivered = AUDIENCE_METRIC_DICTIONARY.find((e) => e.key === 'carrier_delivered')

      expect(accepted).toBeDefined()
      expect(delivered).toBeDefined()

      // Provider accepted must carry explicit uncertainty label that it is not inbox delivery
      expect(accepted?.uncertaintyLabel).toMatch(/transport handoff/i)
      expect(accepted?.definition).toMatch(/not proof of recipient inbox placement/i)

      // Delivered must reference verified carrier DLR or DSN
      expect(delivered?.definition).toMatch(/delivery receipt|DLR|DSN/i)
    })

    it('labels observed_opens with proxy cache uncertainty (Apple MPP / bot prefetch)', () => {
      const opens = AUDIENCE_METRIC_DICTIONARY.find((e) => e.key === 'observed_opens')
      expect(opens).toBeDefined()
      expect(opens?.uncertaintyLabel).toMatch(/proxy cache|prefetch/i)
      expect(opens?.caveats.some((c) => c.includes('Apple Mail Privacy Protection'))).toBe(true)
    })

    it('labels observed_clicks with human bot-filtering caveats', () => {
      const clicks = AUDIENCE_METRIC_DICTIONARY.find((e) => e.key === 'observed_clicks')
      expect(clicks).toBeDefined()
      expect(clicks?.definition).toMatch(/bot/i)
      expect(clicks?.caveats.some((c) => /scanner|crawler/i.test(c))).toBe(true)
    })
  })

  // =========================================================================
  // 2. Privacy Threshold & Masking Guardrails
  // =========================================================================
  describe('Privacy Threshold & K-Anonymity (N >= 5)', () => {
    it('preserves 0 count as 0', () => {
      expect(applyPrivacyThreshold(0)).toBe(0)
    })

    it('masks counts from 1 to 4 with < 5 value', () => {
      expect(applyPrivacyThreshold(1)).toBe(PRIVACY_MASKED_VALUE)
      expect(applyPrivacyThreshold(2)).toBe(PRIVACY_MASKED_VALUE)
      expect(applyPrivacyThreshold(3)).toBe(PRIVACY_MASKED_VALUE)
      expect(applyPrivacyThreshold(4)).toBe(PRIVACY_MASKED_VALUE)
    })

    it('displays counts >= 5 as raw numerical values', () => {
      expect(applyPrivacyThreshold(5)).toBe(5)
      expect(applyPrivacyThreshold(42)).toBe(42)
      expect(applyPrivacyThreshold(1000)).toBe(1000)
    })

    it('identifies masked values using isPrivacyMasked', () => {
      expect(isPrivacyMasked(PRIVACY_MASKED_VALUE)).toBe(true)
      expect(isPrivacyMasked(5)).toBe(false)
      expect(isPrivacyMasked(0)).toBe(false)
    })
  })

  // =========================================================================
  // 3. Deterministic Recipient Allocation for Experiments
  // =========================================================================
  describe('Deterministic Recipient Allocation', () => {
    const variants = [
      { id: 'var-a', allocationPercent: 50 },
      { id: 'var-b', allocationPercent: 50 },
    ]

    it('consistently produces the exact same variant for the same recipient and experiment across multiple calls', () => {
      const expId = 'exp-reproducibility-test'
      const subId = 'sub-9481'

      const first = assignRecipientToVariant(expId, subId, variants)
      const second = assignRecipientToVariant(expId, subId, variants)
      const third = assignRecipientToVariant(expId, subId, variants)

      expect(first).toBe(second)
      expect(second).toBe(third)
      expect(['var-a', 'var-b']).toContain(first)
    })

    it('distributes a cohort of recipients evenly across 50/50 variants', () => {
      const expId = 'exp-distribution-test'
      let countA = 0
      let countB = 0

      for (let i = 0; i < 1000; i++) {
        const assigned = assignRecipientToVariant(expId, `recipient-id-${i}`, variants)
        if (assigned === 'var-a') countA++
        else if (assigned === 'var-b') countB++
      }

      // Expected ~500 each, within reasonable statistical tolerance (420 - 580)
      expect(countA).toBeGreaterThan(420)
      expect(countA).toBeLessThan(580)
      expect(countB).toBeGreaterThan(420)
      expect(countB).toBeLessThan(580)
      expect(countA + countB).toBe(1000)
    })

    it('rejects variant allocations that do not sum to 100%', () => {
      const invalidVariants = [
        { id: 'var-a', allocationPercent: 40 },
        { id: 'var-b', allocationPercent: 40 },
      ]
      expect(() => assignRecipientToVariant('exp-1', 'sub-1', invalidVariants)).toThrow(/100%/)
    })

    it('computes deterministic allocations fingerprint hash', () => {
      const recipients = ['sub-1', 'sub-2', 'sub-3', 'sub-4', 'sub-5']
      const hash1 = computeExperimentAllocationsHash('exp-hash', recipients, variants)
      const hash2 = computeExperimentAllocationsHash('exp-hash', recipients, variants)

      expect(hash1).toBe(hash2)
      expect(typeof hash1).toBe('string')
      expect(hash1.length).toBe(64) // SHA-256 hex
    })
  })

  // =========================================================================
  // 4. Bounded Experiment Guardrails & Manual Winner Decision
  // =========================================================================
  describe('Experiment Guardrails & Winner Decision', () => {
    const baseExperiment: AudienceExperiment = {
      id: 'exp-guardrail-test',
      siteId: 'site-1',
      title: 'Subject Line Test',
      hypothesis: 'Direct subject lines yield higher engagement',
      channel: 'email',
      metric: 'conversion_rate',
      windowHours: 24,
      status: 'running',
      variants: [
        {
          id: 'v-1',
          label: 'Control',
          allocationPercent: 50,
          sampleSize: 500,
          observedOpens: 150,
          observedClicks: 40,
          conversions: 10,
          bounces: 5, // 1% (safe)
          complaints: 0,
          contentPreview: 'Control preview',
        },
        {
          id: 'v-2',
          label: 'Challenger',
          allocationPercent: 50,
          sampleSize: 500,
          observedOpens: 180,
          observedClicks: 55,
          conversions: 15,
          bounces: 6, // 1.2% (safe)
          complaints: 0,
          contentPreview: 'Challenger preview',
        },
      ],
      guardrails: {
        maxBounceRatePercent: 4.0,
        maxComplaintRatePercent: 0.15,
        minSampleSize: 200,
      },
      totalAllocated: 1000,
      startedAt: '2026-09-19T10:00:00Z',
      concludedAt: null,
      allocationsHash: 'abc123hash',
      winnerDecision: {
        winningVariantId: null,
        decidedBy: null,
        decidedAt: null,
        decisionRationale: null,
        manualConfirmation: false,
        autoDeployed: false,
      },
      warnings: [],
    }

    it('passes guardrails when sample size, bounce rate, and complaints are within bounds', () => {
      const result = evaluateExperimentGuardrails(baseExperiment)
      expect(result.breached).toBe(false)
      expect(result.autoPaused).toBe(false)
      expect(result.warnings.length).toBe(0)
    })

    it('warns when total sample size is below required minimum', () => {
      const underpowered: AudienceExperiment = {
        ...baseExperiment,
        totalAllocated: 150, // Below 200 * 2 = 400
      }
      const result = evaluateExperimentGuardrails(underpowered)
      expect(result.warnings.some((w) => w.includes('Sample size warning'))).toBe(true)
    })

    it('flags breach and auto-pause when bounce rate exceeds maximum limit', () => {
      const highBounceExp: AudienceExperiment = {
        ...baseExperiment,
        variants: [
          baseExperiment.variants[0],
          {
            ...baseExperiment.variants[1],
            bounces: 30, // 30 / 500 = 6% (exceeds 4.0%)
          },
        ],
      }
      const result = evaluateExperimentGuardrails(highBounceExp)
      expect(result.breached).toBe(true)
      expect(result.autoPaused).toBe(true)
      expect(result.warnings.some((w) => w.includes('Bounce rate'))).toBe(true)
    })

    it('flags critical breach when complaint rate exceeds limit', () => {
      const highComplaintExp: AudienceExperiment = {
        ...baseExperiment,
        variants: [
          baseExperiment.variants[0],
          {
            ...baseExperiment.variants[1],
            complaints: 3, // 3 / 500 = 0.6% (exceeds 0.15%)
          },
        ],
      }
      const result = evaluateExperimentGuardrails(highComplaintExp)
      expect(result.breached).toBe(true)
      expect(result.autoPaused).toBe(true)
      expect(result.warnings.some((w) => w.includes('Complaint rate'))).toBe(true)
    })

    it('records manual winner decision with audit trail and asserts autoDeployed is false', () => {
      const concluded = recordExperimentWinnerDecision(baseExperiment, {
        winningVariantId: 'v-2',
        decidedBy: 'Editor Alice',
        rationale: 'Variant 2 produced 50% more conversions with identical deliverability.',
        manualConfirmation: true,
      })

      expect(concluded.status).toBe('concluded')
      expect(concluded.concludedAt).toBeTruthy()
      expect(concluded.winnerDecision.winningVariantId).toBe('v-2')
      expect(concluded.winnerDecision.decidedBy).toBe('Editor Alice')
      expect(concluded.winnerDecision.decisionRationale).toMatch(/50% more conversions/)
      expect(concluded.winnerDecision.manualConfirmation).toBe(true)
      expect(concluded.winnerDecision.autoDeployed).toBe(false) // Strict invariant!
    })

    it('rejects winner decision without explicit manual confirmation or missing rationale', () => {
      expect(() =>
        recordExperimentWinnerDecision(baseExperiment, {
          winningVariantId: 'v-2',
          decidedBy: 'Editor Alice',
          rationale: 'Looks good',
          manualConfirmation: false,
        }),
      ).toThrow(/manual confirmation/i)

      expect(() =>
        recordExperimentWinnerDecision(baseExperiment, {
          winningVariantId: 'v-2',
          decidedBy: 'Editor Alice',
          rationale: '',
          manualConfirmation: true,
        }),
      ).toThrow(/rationale is required/i)
    })
  })

  // =========================================================================
  // 5. Bot Click Filtering & Classification
  // =========================================================================
  describe('Bot Click Filtering', () => {
    it('detects corporate email security scanner bots', () => {
      const barracuda = classifyClickAgent(
        'Mozilla/5.0 (compatible; Barracuda-Sentinel/1.0; +http://barracuda.com)',
      )
      expect(barracuda.isBot).toBe(true)
      expect(barracuda.botType).toBe('security_scanner')

      const proofpoint = classifyClickAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Proofpoint-URL-Defense/2.0',
      )
      expect(proofpoint.isBot).toBe(true)
      expect(proofpoint.botType).toBe('security_scanner')

      const mimecast = classifyClickAgent('Mimecast-Targeted-Threat-Protection')
      expect(mimecast.isBot).toBe(true)
      expect(mimecast.botType).toBe('security_scanner')
    })

    it('detects HTTP Purpose: prefetch / preview headers', () => {
      const prefetch = classifyClickAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)', {
        purpose: 'prefetch',
      })
      expect(prefetch.isBot).toBe(true)
      expect(prefetch.botType).toBe('prefetch_engine')

      const secPrefetch = classifyClickAgent('Mozilla/5.0 (iPhone; CPU iPhone OS)', {
        'sec-purpose': 'preview',
      })
      expect(secPrefetch.isBot).toBe(true)
      expect(secPrefetch.botType).toBe('prefetch_engine')
    })

    it('detects web search crawlers and social link preview scrapers', () => {
      const googlebot = classifyClickAgent('Googlebot/2.1 (+http://www.google.com/bot.html)')
      expect(googlebot.isBot).toBe(true)
      expect(googlebot.botType).toBe('search_crawler')

      const twitterbot = classifyClickAgent('Twitterbot/1.0')
      expect(twitterbot.isBot).toBe(true)
      expect(twitterbot.botType).toBe('search_crawler')
    })

    it('detects headless tools and automated HTTP libraries', () => {
      const curl = classifyClickAgent('curl/7.88.1')
      expect(curl.isBot).toBe(true)
      expect(curl.botType).toBe('headless')

      const headlessChrome = classifyClickAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/118.0.0.0 Safari/537.36',
      )
      expect(headlessChrome.isBot).toBe(true)
      expect(headlessChrome.botType).toBe('headless')
    })

    it('classifies normal consumer browser requests as human', () => {
      const chrome = classifyClickAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      )
      expect(chrome.isBot).toBe(false)
      expect(chrome.botType).toBe('human')
    })
  })

  // =========================================================================
  // 6. Privacy-Aware Link & Conversion Attribution
  // =========================================================================
  describe('Privacy-Aware Link Attribution', () => {
    it('builds clean first-party tracking URLs with rcid, rcch, and rcvar', () => {
      const url = buildCampaignTrackingUrl('https://renegade.media/article/sovereignty', {
        campaignId: 'camp-autumn',
        channel: 'email',
        variantId: 'var-b',
      })
      expect(url).toContain('rcid=camp-autumn')
      expect(url).toContain('rcch=email')
      expect(url).toContain('rcvar=var-b')
      expect(url).not.toContain('fbclid')
      expect(url).not.toContain('gclid')
    })

    it('returns clean URL without any parameters when directLinkOnly is true (privacy opt-out)', () => {
      const raw = 'https://renegade.media/article/sovereignty'
      const url = buildCampaignTrackingUrl(raw, {
        campaignId: 'camp-autumn',
        channel: 'email',
        variantId: 'var-b',
        directLinkOnly: true,
      })
      expect(url).toBe(raw)
      expect(url).not.toContain('rcid')
      expect(url).not.toContain('rcch')
    })

    it('handles relative URLs seamlessly', () => {
      const relative = buildCampaignTrackingUrl('/articles/first-post', {
        campaignId: 'camp-123',
        channel: 'sms',
      })
      expect(relative).toContain('/articles/first-post?')
      expect(relative).toContain('rcid=camp-123')
      expect(relative).toContain('rcch=sms')
    })
  })

  // =========================================================================
  // 7. Deliverability & System Health Evaluator
  // =========================================================================
  describe('Deliverability & System Health Evaluator', () => {
    it('evaluates healthy system when metrics are under warning thresholds', () => {
      const health = evaluateAudienceHealth({
        siteId: 'site-1',
        emailProviderStatus: 'healthy',
        emailProviderName: 'SMTP',
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        tlsVerified: true,
        telecomProviderStatus: 'healthy',
        telecomProviderName: 'Twilio',
        telecomOutboundAllowed: true,
        totalSentRecently: 10000,
        hardBouncesRecently: 80, // 0.8%
        complaintsRecently: 5, // 0.05%
        queueAgeMinutesMax: 10,
        webhookLagSecondsMax: 30,
        staleSegmentCount: 0,
        invalidFormCount: 0,
        failingAutomationsCount: 0,
      })

      expect(health.metrics.hardBounceRate.severity).toBe('normal')
      expect(health.metrics.complaintRate.severity).toBe('normal')
      expect(health.providers.email.readiness).toBe('ready')
      expect(health.remediationsAvailable.length).toBe(0)
    })

    it('surfaces warning alerts and remediation when bounce rate exceeds 2.0%', () => {
      const health = evaluateAudienceHealth({
        siteId: 'site-1',
        emailProviderStatus: 'healthy',
        emailProviderName: 'SMTP',
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        tlsVerified: true,
        telecomProviderStatus: 'healthy',
        telecomProviderName: 'Twilio',
        telecomOutboundAllowed: true,
        totalSentRecently: 10000,
        hardBouncesRecently: 250, // 2.5%
        complaintsRecently: 4,
        queueAgeMinutesMax: 10,
        webhookLagSecondsMax: 30,
        staleSegmentCount: 0,
        invalidFormCount: 0,
        failingAutomationsCount: 0,
      })

      expect(health.metrics.hardBounceRate.severity).toBe('warning')
      expect(
        health.remediationsAvailable.some((r) => r.actionKey === 'review_bounce_suppressions'),
      ).toBe(true)
    })

    it('surfaces critical alert and immediate pause remediation when complaint rate exceeds 0.10%', () => {
      const health = evaluateAudienceHealth({
        siteId: 'site-1',
        emailProviderStatus: 'healthy',
        emailProviderName: 'SMTP',
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        tlsVerified: true,
        telecomProviderStatus: 'healthy',
        telecomProviderName: 'Twilio',
        telecomOutboundAllowed: true,
        totalSentRecently: 10000,
        hardBouncesRecently: 50,
        complaintsRecently: 15, // 0.15% (Google/Yahoo threshold is 0.10%)
        queueAgeMinutesMax: 10,
        webhookLagSecondsMax: 30,
        staleSegmentCount: 0,
        invalidFormCount: 0,
        failingAutomationsCount: 0,
      })

      expect(health.metrics.complaintRate.severity).toBe('warning')
      expect(
        health.remediationsAvailable.some((r) => r.actionKey === 'pause_marketing_campaigns'),
      ).toBe(true)
    })

    it('detects invalid forms and stale segments', () => {
      const health = evaluateAudienceHealth({
        siteId: 'site-1',
        emailProviderStatus: 'healthy',
        emailProviderName: 'SMTP',
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        tlsVerified: true,
        telecomProviderStatus: 'healthy',
        telecomProviderName: 'Twilio',
        telecomOutboundAllowed: true,
        totalSentRecently: 5000,
        hardBouncesRecently: 20,
        complaintsRecently: 1,
        queueAgeMinutesMax: 10,
        webhookLagSecondsMax: 30,
        staleSegmentCount: 2,
        invalidFormCount: 1,
        failingAutomationsCount: 1,
      })

      expect(health.metrics.invalidFormCount.currentValue).toBe(1)
      expect(health.metrics.staleSegmentCount.currentValue).toBe(2)
      expect(
        health.remediationsAvailable.some((r) => r.actionKey === 'quarantine_invalid_forms'),
      ).toBe(true)
      expect(
        health.remediationsAvailable.some((r) => r.actionKey === 'refresh_stale_segments'),
      ).toBe(true)
    })
  })

  // =========================================================================
  // 8. Campaign Funnel Projection & Cohort Masking
  // =========================================================================
  describe('Campaign Funnel Projections', () => {
    it('projects complete factual funnel stages and calculates Apple MPP uncertainty range', () => {
      const funnel = projectCampaignFunnel({
        campaignId: 'camp-funnel-1',
        campaignTitle: 'September Dispatch',
        channel: 'email',
        provider: 'SMTP',
        windowStart: '2026-09-18T00:00:00Z',
        windowEnd: '2026-09-20T00:00:00Z',
        counts: {
          eligible: 5000,
          attempted: 5000,
          accepted: 4980,
          delivered: 4950,
          observedOpensConfirmed: 1500,
          observedOpensProxyCached: 1100,
          observedClicksHuman: 420,
          observedClicksBot: 180,
          conversions: 85,
        },
        cohorts: [
          {
            dimension: 'source',
            key: 'web-forms',
            label: 'Web Forms',
            eligible: 3000,
            delivered: 2970,
            observedOpens: 1500,
            observedClicks: 260,
            conversions: 55,
          },
          {
            dimension: 'source',
            key: 'partner-small',
            label: 'Micro Partner',
            eligible: 3, // < 5 (Must be masked!)
            delivered: 3,
            observedOpens: 2,
            observedClicks: 1,
            conversions: 1,
          },
        ],
      })

      expect(funnel.stages.length).toBe(7)
      expect(funnel.openUncertaintyRange.minimumConfirmed).toBe(1500)
      expect(funnel.openUncertaintyRange.maximumPossible).toBe(2600) // 1500 + 1100
      expect(funnel.openUncertaintyRange.proxyCachedCount).toBe(1100)

      // Micro cohort must be masked
      const microCohort = funnel.cohortBreakdown.find((c) => c.key === 'partner-small')
      expect(microCohort).toBeDefined()
      expect(microCohort?.isMasked).toBe(true)
      expect(microCohort?.eligible).toBe(PRIVACY_MASKED_VALUE)
      expect(microCohort?.delivered).toBe(PRIVACY_MASKED_VALUE)
      expect(microCohort?.conversions).toBe(PRIVACY_MASKED_VALUE)

      // Web forms cohort must be clear
      const webCohort = funnel.cohortBreakdown.find((c) => c.key === 'web-forms')
      expect(webCohort?.isMasked).toBe(false)
      expect(webCohort?.eligible).toBe(3000)
    })
  })

  // =========================================================================
  // 9. Unified Calendar Projector & Conflict Warnings
  // =========================================================================
  describe('Unified Calendar & Conflict Detection', () => {
    it('detects frequency conflict when two campaigns target the same segment on the same date', () => {
      const items = projectUnifiedAudienceCalendar([
        {
          id: 'camp-1',
          siteId: 'site-1',
          title: 'Morning Newsletter',
          channel: 'email',
          itemType: 'campaign',
          status: 'scheduled',
          scheduledFor: '2026-09-22T09:00:00Z',
          completedAt: null,
          timeZone: 'UTC',
          targetAudienceLabel: 'All Subscribers',
          estimatedRecipients: 5000,
          targetSegmentId: 'seg-general',
        },
        {
          id: 'camp-2',
          siteId: 'site-1',
          title: 'Afternoon Promo',
          channel: 'email',
          itemType: 'campaign',
          status: 'scheduled',
          scheduledFor: '2026-09-22T15:00:00Z',
          completedAt: null,
          timeZone: 'UTC',
          targetAudienceLabel: 'All Subscribers',
          estimatedRecipients: 5000,
          targetSegmentId: 'seg-general', // Overlap on same date
        },
      ])

      expect(items[0].hasFrequencyConflict).toBe(true)
      expect(items[1].hasFrequencyConflict).toBe(true)
      expect(items[0].warnings.some((w) => w.includes('Frequency Conflict'))).toBe(true)
    })

    it('detects quiet hours violations for telecom SMS/RCS sends outside 8am-9pm local window', () => {
      const items = projectUnifiedAudienceCalendar([
        {
          id: 'camp-sms-late',
          siteId: 'site-1',
          title: 'Midnight Flash Alert',
          channel: 'sms',
          itemType: 'campaign',
          status: 'draft',
          scheduledFor: '2026-09-22T04:00:00Z', // 4:00 AM UTC
          completedAt: null,
          timeZone: 'UTC',
          targetAudienceLabel: 'SMS Network',
          estimatedRecipients: 1000,
        },
      ])

      expect(items[0].isWithinQuietHours).toBe(true)
      expect(items[0].warnings.some((w) => w.includes('Quiet Hours Warning'))).toBe(true)
    })
  })

  // =========================================================================
  // 10. Privacy-Preserving CSV & Report Export
  // =========================================================================
  describe('Privacy-Safe CSV & Report Export', () => {
    const reportInput = {
      siteId: 'site-1',
      userRole: 'administrator',
      windowLabel: 'LAST 7 DAYS',
      metrics: [
        {
          key: 'form_submissions',
          label: 'Form Submissions',
          channel: 'web',
          count: 420,
          definition: 'Total validated submissions',
          caveats: 'Honeypot excluded',
        },
        {
          key: 'rare_event',
          label: 'Rare Micro Action',
          channel: 'email',
          count: 2, // < 5 (Must be masked!)
          definition: 'Special RSVP',
          caveats: 'Few respondents',
        },
      ],
      cohorts: [
        {
          dimension: 'source',
          label: 'Public Web',
          eligible: 1200,
          delivered: 1190,
          observedClicks: 340,
          conversions: 62,
        },
        {
          dimension: 'source',
          label: 'Secret VIP Link',
          eligible: 4, // < 5 (Must be masked!)
          delivered: 4,
          observedClicks: 2,
          conversions: 1,
        },
      ],
    }

    it('generates valid CSV and masks any cells with count < 5', () => {
      const result = exportAudienceSummaryReport(reportInput)

      expect(result.filename).toMatch(/audience-report-site-1/i)
      expect(result.csv).toContain('# Renegade CMoS Audience Operational Summary')
      expect(result.csv).toContain('# Privacy Assertion')

      // Large count is unmasked
      expect(result.csv).toContain('form_submissions,"Form Submissions",web,420')

      // Small count is masked
      expect(result.csv).toContain(`rare_event,"Rare Micro Action",email,${PRIVACY_MASKED_VALUE}`)

      // Cohort with N < 5 is masked
      expect(result.csv).toContain(
        `"source","Secret VIP Link",${PRIVACY_MASKED_VALUE},${PRIVACY_MASKED_VALUE},${PRIVACY_MASKED_VALUE},${PRIVACY_MASKED_VALUE}`,
      )
    })

    it('denies export to unauthorized roles', () => {
      expect(() =>
        exportAudienceSummaryReport({
          ...reportInput,
          userRole: 'anonymous_visitor',
        }),
      ).toThrow(/Unauthorized/i)

      expect(() =>
        exportAudienceSummaryReport({
          ...reportInput,
          userRole: 'subscriber',
        }),
      ).toThrow(/Unauthorized/i)
    })
  })
})
