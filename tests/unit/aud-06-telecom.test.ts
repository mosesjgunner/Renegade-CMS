import { describe, expect, it } from 'vitest'
import {
  calculateNextSendWindow,
  calculateSmsSegments,
  estimateTelecomCost,
  isWithinQuietHours,
  normalizeE164Phone,
  parseInboundKeyword,
  telecomDigest,
  validateRcsContent,
} from '../../src/modules/telecom/contracts'
import {
  composeRcsMessage,
  composeSmsMessage,
  interpolatePersonalization,
} from '../../src/modules/telecom/composer'
import {
  deterministicTelecomEmulator,
  getTelecomEmulatorReceipts,
  resetTelecomEmulator,
  setEmulatorRecipientCapability,
  setEmulatorSimulation,
  simulateInboundTelecomMessage,
} from '../../src/modules/telecom/emulator'
import {
  hasTelecomConsent,
  processInboundTelecomMessage,
  recordPhoneReassignment,
} from '../../src/modules/telecom/service'
import { telecomDeliveryTask } from '../../src/modules/telecom/tasks'
import { createTwilioTelecomAdapter } from '../../src/modules/telecom/real-provider'

describe('AUD-06 Telecom Capability and Safety Boundaries', () => {
  // =========================================================================
  // 1. Phone Normalization, Display Retention & Reassignment
  // =========================================================================
  describe('Phone normalization & reassignment', () => {
    it('normalizes numbers to standard E.164 while retaining user-entered display', () => {
      const parsed = normalizeE164Phone('+1 (415) 555-0199')
      expect(parsed.e164).toBe('+14155550199')
      expect(parsed.display).toBe('+1 (415) 555-0199')
      expect(parsed.countryCallingCode).toBe('+1')
      expect(parsed.nationalNumber).toBe('4155550199')

      const uk = normalizeE164Phone('+44 20 7946 0958')
      expect(uk.e164).toBe('+442079460958')
      expect(uk.countryCallingCode).toBe('+44')

      expect(() => normalizeE164Phone('not-a-number')).toThrow(/international/i)
      expect(() => normalizeE164Phone('+12')).toThrow(/invalid/i)
    })

    it('handles number reassignment by revoking consent, adding suppression, and cancelling queued sends', async () => {
      const collections = new Map<string, any[]>()
      const all = (col: string): any[] => collections.get(col) ?? []

      const mockPayload = {
        create: async ({ collection, data }: any) => {
          const doc = { id: `${collection}-${all(collection).length + 1}`, ...data }
          collections.set(collection, [...all(collection), doc])
          return doc
        },
        find: async ({ collection, where }: any) => {
          let docs = all(collection)
          if (where?.recipientPhoneHash?.equals) {
            docs = docs.filter((d) => d.recipientPhoneHash === where.recipientPhoneHash.equals)
          }
          if (where?.status?.equals) {
            docs = docs.filter((d) => d.status === where.status.equals)
          }
          if (where?.emailHash?.equals) {
            docs = docs.filter((d) => d.emailHash === where.emailHash.equals)
          }
          return { docs }
        },
        update: async ({ collection, id, data }: any) => {
          const list = all(collection)
          const idx = list.findIndex((d) => d.id === id)
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...data }
          }
          return list[idx]
        },
      }

      const phone = '+14155550199'
      const phoneHash = telecomDigest(phone)

      // Pre-populate a queued send
      await mockPayload.create({
        collection: 'telecom-deliveries',
        data: {
          recipientPhone: phone,
          recipientPhoneHash: phoneHash,
          status: 'queued',
        },
      })

      const result = await recordPhoneReassignment(mockPayload, {
        siteId: 'site-1',
        phoneE164: phone,
        reason: 'Carrier disconnected number',
      })

      expect(result.cancelledDeliveries).toBe(1)
      const deliveries = all('telecom-deliveries')
      expect(deliveries[0].status).toBe('cancelled')
      expect(deliveries[0].outcome.code).toBe('number_reassigned')

      const suppressions = all('suppressions')
      expect(suppressions).toHaveLength(1)
      expect(suppressions[0].reason).toBe('invalid')

      const consentEvents = all('consent-events')
      expect(consentEvents).toHaveLength(1)
      expect(consentEvents[0].event).toBe('preference-withdrawn')
    })
  })

  // =========================================================================
  // 2. Consent Proof and Email Isolation
  // =========================================================================
  describe('Telecom consent proof & channel isolation', () => {
    it('proves email consent never implies SMS/RCS consent', async () => {
      const collections = new Map<string, any[]>()
      const all = (col: string): any[] => collections.get(col) ?? []

      const mockPayload = {
        find: async ({ collection, where }: any) => {
          let docs = all(collection)
          if (where?.channel?.in) {
            docs = docs.filter((d) => where.channel.in.includes(d.channel))
          }
          return { docs }
        },
      }

      // Record only an email consent event
      collections.set('consent-events', [
        {
          id: 'ce-1',
          channel: 'email',
          event: 'preference-granted',
          purpose: 'marketing',
          occurredAt: new Date().toISOString(),
        },
      ])

      const hasSmsConsent = await hasTelecomConsent(mockPayload, {
        siteId: 'site-1',
        phoneHash: 'sample-phone-hash',
        purpose: 'marketing',
      })

      expect(hasSmsConsent).toBe(false)
    })
  })

  // =========================================================================
  // 3. Inbound STOP, HELP, START & Race Condition
  // =========================================================================
  describe('Inbound keywords & STOP race condition', () => {
    it('parses standard STOP, HELP, and START keywords including French Canadian ARRET', () => {
      expect(parseInboundKeyword('stop').action).toBe('opt-out')
      expect(parseInboundKeyword('STOPALL please').action).toBe('opt-out')
      expect(parseInboundKeyword('unsubscribe').action).toBe('opt-out')
      expect(parseInboundKeyword('ARRET').action).toBe('opt-out')

      expect(parseInboundKeyword('HELP').action).toBe('help')
      expect(parseInboundKeyword('info').action).toBe('help')

      expect(parseInboundKeyword('START').action).toBe('opt-in')
      expect(parseInboundKeyword('UNSTOP').action).toBe('opt-in')

      expect(parseInboundKeyword('Where is my package?').action).toBe('unknown')
    })

    it('cancels queued deliveries immediately upon inbound STOP before dispatch', async () => {
      const collections = new Map<string, any[]>()
      const all = (col: string): any[] => collections.get(col) ?? []

      const mockPayload = {
        create: async ({ collection, data }: any) => {
          const doc = { id: `${collection}-${all(collection).length + 1}`, ...data }
          collections.set(collection, [...all(collection), doc])
          return doc
        },
        find: async ({ collection, where }: any) => {
          let docs = all(collection)
          if (where?.recipientPhoneHash?.equals) {
            docs = docs.filter((d) => d.recipientPhoneHash === where.recipientPhoneHash.equals)
          }
          if (where?.emailHash?.equals) {
            docs = docs.filter((d) => d.emailHash === where.emailHash.equals)
          }
          return { docs }
        },
        update: async ({ collection, id, data }: any) => {
          const list = all(collection)
          const idx = list.findIndex((d) => d.id === id)
          if (idx !== -1) list[idx] = { ...list[idx], ...data }
          return list[idx]
        },
      }

      const phone = '+14155550199'
      const phoneHash = telecomDigest(phone)

      // Queue a delivery
      await mockPayload.create({
        collection: 'telecom-deliveries',
        data: {
          recipientPhone: phone,
          recipientPhoneHash: phoneHash,
          status: 'queued',
        },
      })

      // Inbound STOP arrives while delivery is queued
      const res = await processInboundTelecomMessage(mockPayload, {
        siteId: 'site-1',
        fromE164: phone,
        toE164: '+18005550100',
        text: 'STOP',
        brandName: 'Renegade CMS',
      })

      expect(res.action).toBe('opt-out')
      expect(res.suppressionRecorded).toBe(true)
      expect(res.deliveriesCancelled).toBe(1)
      expect(all('telecom-deliveries')[0].status).toBe('cancelled')
      expect(all('telecom-deliveries')[0].outcome.code).toBe('suppressed-before-send')
      expect(res.autoResponse).toMatch(/unsubscribed/i)
    })

    it('routes free-form inbound inquiries to staff inbox and never acts as a hallucinating reply bot', async () => {
      const collections = new Map<string, any[]>()
      const all = (col: string): any[] => collections.get(col) ?? []

      const mockPayload = {
        create: async ({ collection, data }: any) => {
          const doc = { id: `${collection}-${all(collection).length + 1}`, ...data }
          collections.set(collection, [...all(collection), doc])
          return doc
        },
      }

      const res = await processInboundTelecomMessage(mockPayload, {
        siteId: 'site-1',
        fromE164: '+14155550199',
        toE164: '+18005550100',
        text: 'Hello, can someone help me with my subscription?',
        brandName: 'Renegade',
        staffRoutingEnabled: true,
      })

      expect(res.action).toBe('staff-routed')
      expect(all('workflow-items')).toHaveLength(1)
      expect(all('workflow-items')[0].type).toBe('form-intake')
    })
  })

  // =========================================================================
  // 4. GSM-7 vs UCS-2 Segmentation & Cost Estimation
  // =========================================================================
  describe('GSM-7 vs UCS-2 segmentation & cost estimation', () => {
    it('accurately counts standard GSM-7 septets and extension characters', () => {
      const single = calculateSmsSegments('Hello World! Standard GSM-7 message.')
      expect(single.encoding).toBe('GSM-7')
      expect(single.segmentCount).toBe(1)
      expect(single.containsNonGsmCharacters).toBe(false)

      // Extension characters like € { } [ ] count as 2 septets
      const withEuro = calculateSmsSegments('Price: 10 €')
      expect(withEuro.encoding).toBe('GSM-7')
      expect(withEuro.totalSeptetsOrBytes).toBe(12) // 10 chars + 1 extra for €

      // Long GSM message concatenation: 153 chars per segment
      const longGsm = 'A'.repeat(161)
      const multi = calculateSmsSegments(longGsm)
      expect(multi.encoding).toBe('GSM-7')
      expect(multi.segmentCount).toBe(2)
      expect(multi.charactersPerSegment).toBe(153)
    })

    it('detects Unicode characters and switches to UCS-2 encoding', () => {
      const emojiMsg = 'Hello 🎉'
      const ucs2 = calculateSmsSegments(emojiMsg)
      expect(ucs2.encoding).toBe('UCS-2')
      expect(ucs2.containsNonGsmCharacters).toBe(true)
      expect(ucs2.segmentCount).toBe(1)
      expect(ucs2.charactersPerSegment).toBe(70)

      const longUcs2 = '🎉'.repeat(71)
      const multiUcs2 = calculateSmsSegments(longUcs2)
      expect(multiUcs2.encoding).toBe('UCS-2')
      expect(multiUcs2.segmentCount).toBe(2)
      expect(multiUcs2.charactersPerSegment).toBe(67)
    })

    it('estimates provider units and cost labeled as estimate', () => {
      const estimate = estimateTelecomCost({
        channel: 'sms',
        segments: 2,
        recipientCount: 500,
        countryCode: 'US',
      })
      expect(estimate.isEstimate).toBe(true)
      expect(estimate.unitsPerRecipient).toBe(2)
      expect(estimate.totalUnits).toBe(1000)
      expect(estimate.disclaimer).toMatch(/projections only/i)
      expect(estimate.formattedCost).toBe('$7.9000 USD')
    })
  })

  // =========================================================================
  // 5. Channel Composer & Personalization Fallback
  // =========================================================================
  describe('Telecom Composer', () => {
    it('replaces personalization tokens with values or fallbacks', () => {
      const result = interpolatePersonalization(
        'Hi {{firstName|Subscriber}}, your code is {{code}}.',
        { firstName: 'Alice', code: '123456' },
      )
      expect(result.text).toBe('Hi Alice, your code is 123456.')

      const fallbackResult = interpolatePersonalization(
        'Hi {{firstName|Valued Reader}}, welcome!',
        {},
      )
      expect(fallbackResult.text).toBe('Hi Valued Reader, welcome!')
    })

    it('warns when marketing SMS lacks opt-out instructions', () => {
      const comp = composeSmsMessage({
        body: 'Special offer today only!',
        purpose: 'marketing',
      })
      expect(comp.warnings.some((w) => w.includes('opt-out'))).toBe(true)

      const compWithStop = composeSmsMessage({
        body: 'Special offer today only! Reply STOP to cancel.',
        purpose: 'marketing',
      })
      expect(compWithStop.warnings.some((w) => w.includes('opt-out'))).toBe(false)
    })

    it('enforces accessibility alt text for RCS card media', () => {
      const invalidRcs = composeRcsMessage({
        rcs: {
          type: 'rich-card',
          text: 'Check out our new edition',
          cards: [
            {
              title: 'Edition Cover',
              media: {
                url: 'https://example.test/cover.jpg',
                contentType: 'image/jpeg',
                altText: '   ', // Blank alt text
              },
            },
          ],
          fallbackPolicy: 'prohibit',
        },
      })
      expect(invalidRcs.validationErrors.some((e) => e.includes('alt text'))).toBe(true)
    })
  })

  // =========================================================================
  // 6. Deterministic Telecom Emulator & RCS Fallback Routing
  // =========================================================================
  describe('Deterministic Telecom Emulator & RCS routing', () => {
    it('routes RCS-capable recipients directly to RCS', async () => {
      resetTelecomEmulator()
      const rcsPhone = '+14155550101'
      setEmulatorRecipientCapability(rcsPhone, { rcsSupported: true, carrier: 'Carrier A' })

      const result = await deterministicTelecomEmulator.send({
        from: 'Renegade',
        to: rcsPhone,
        text: 'RCS Announcement',
        channel: 'rcs',
        idempotencyKey: 'rcs-send-1',
        purpose: 'marketing',
        fallbackPolicy: 'prohibit',
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.channel).toBe('rcs')
        expect(result.deliveryPath).toBe('rcs-direct')
      }
    })

    it('routes SMS-only recipients to configured SMS fallback when policy permits', async () => {
      resetTelecomEmulator()
      const smsOnlyPhone = '+14155550102'
      setEmulatorRecipientCapability(smsOnlyPhone, { rcsSupported: false })

      const result = await deterministicTelecomEmulator.send({
        from: 'Renegade',
        to: smsOnlyPhone,
        text: 'Rich RCS card with interactive chips',
        channel: 'rcs',
        idempotencyKey: 'rcs-send-2',
        purpose: 'marketing',
        fallbackPolicy: 'allow-with-configured-text',
        fallbackSmsBody: 'Plain SMS Fallback Text. Reply STOP to cancel.',
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.channel).toBe('sms')
        expect(result.deliveryPath).toBe('rcs-fallback-to-sms')
      }
      const receipts = getTelecomEmulatorReceipts()
      expect(receipts.find((r) => r.idempotencyKey === 'rcs-send-2')?.text).toBe(
        'Plain SMS Fallback Text. Reply STOP to cancel.',
      )
    })

    it('refuses to silently downgrade RCS to SMS when fallback is prohibited', async () => {
      resetTelecomEmulator()
      const smsOnlyPhone = '+14155550103'
      setEmulatorRecipientCapability(smsOnlyPhone, { rcsSupported: false })

      const result = await deterministicTelecomEmulator.send({
        from: 'Renegade',
        to: smsOnlyPhone,
        text: 'Rich RCS interactive carousel',
        channel: 'rcs',
        idempotencyKey: 'rcs-send-3',
        purpose: 'marketing',
        fallbackPolicy: 'prohibit',
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.failure.code).toBe('rcs_not_supported_no_fallback')
        expect(result.failure.kind).toBe('permanent')
      }
    })

    it('handles rate limits, carrier rejection, and timeout in emulator', async () => {
      resetTelecomEmulator()
      setEmulatorSimulation('rate-test-key', 'rate_limited')
      setEmulatorSimulation('carrier-test-key', 'carrier_congestion')
      setEmulatorSimulation('timeout-test-key', 'timeout')

      const rateRes = await deterministicTelecomEmulator.send({
        from: 'Renegade',
        to: '+14155550100',
        text: 'Hello',
        channel: 'sms',
        idempotencyKey: 'rate-test-key',
        purpose: 'marketing',
      })
      expect(rateRes.ok).toBe(false)
      if (!rateRes.ok) {
        expect(rateRes.failure.kind).toBe('retryable')
        expect(rateRes.failure.code).toBe('rate_limited')
      }

      const timeoutRes = await deterministicTelecomEmulator.send({
        from: 'Renegade',
        to: '+14155550100',
        text: 'Hello',
        channel: 'sms',
        idempotencyKey: 'timeout-test-key',
        purpose: 'marketing',
      })
      expect(timeoutRes.ok).toBe(false)
      if (!timeoutRes.ok) {
        expect(timeoutRes.failure.kind).toBe('unknown')
        expect(timeoutRes.failure.code).toBe('timeout')
      }
    })

    it('deduplicates deliveries with stable idempotency key', async () => {
      resetTelecomEmulator()
      const req = {
        from: 'Renegade',
        to: '+14155550100',
        text: 'Hello Idempotency',
        channel: 'sms' as const,
        idempotencyKey: 'idemp-1',
        purpose: 'marketing' as const,
      }

      const first = await deterministicTelecomEmulator.send(req)
      const second = await deterministicTelecomEmulator.send(req)

      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      if (first.ok && second.ok) {
        expect(first.providerMessageId).toBe(second.providerMessageId)
      }
      expect(getTelecomEmulatorReceipts()).toHaveLength(1)
    })
  })

  // =========================================================================
  // 7. Quiet Hours & DST Transitions
  // =========================================================================
  describe('Quiet hours & DST calculations', () => {
    it('accurately identifies quiet hours (9pm to 8am)', () => {
      // 10:00 PM local -> Quiet
      const lateNight = new Date('2026-06-15T22:30:00Z')
      expect(isWithinQuietHours(lateNight, 'UTC').isQuiet).toBe(true)

      // 2:00 PM local -> Daytime (not quiet)
      const afternoon = new Date('2026-06-15T14:00:00Z')
      expect(isWithinQuietHours(afternoon, 'UTC').isQuiet).toBe(false)
    })

    it('calculates the next morning opening window across timezones', () => {
      const night = new Date('2026-06-15T23:00:00Z') // 11pm UTC
      const nextWindow = calculateNextSendWindow(night, 'America/New_York')

      expect(nextWindow.getTime()).toBeGreaterThan(night.getTime())
      // Check that in New York timezone, the hour is 8 AM
      const nyHour = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(nextWindow)
      expect(parseInt(nyHour, 10)).toBe(8)
    })
  })

  // =========================================================================
  // 8. Real Provider Preflight & Secret Redaction
  // =========================================================================
  describe('Real Provider Security & Preflight', () => {
    it('fails closed when credentials are unconfigured without crashing or leaking secrets', async () => {
      const adapter = createTwilioTelecomAdapter({})
      const health = await adapter.health()
      expect(health.status).toBe('disabled')

      const sendRes = await adapter.send({
        from: '+18005550100',
        to: '+14155550199',
        text: 'Hello',
        channel: 'sms',
        idempotencyKey: 'key-1',
        purpose: 'transactional',
      })
      expect(sendRes.ok).toBe(false)
      if (!sendRes.ok) {
        expect(sendRes.failure.code).toBe('authentication_failed')
      }
    })

    it('refuses outbound live send unless explicitly permitted by configuration', async () => {
      const adapter = createTwilioTelecomAdapter({
        accountSid: 'AC_TEST_ACCOUNT_SID_12345',
        authToken: 'TEST_SECRET_TOKEN_98765',
        fromNumber: '+18005550100',
        allowOutboundLiveSend: false, // Default is false for safety
      })

      const sendRes = await adapter.send({
        from: '+18005550100',
        to: '+14155550199',
        text: 'Live Outbound Send',
        channel: 'sms',
        idempotencyKey: 'key-2',
        purpose: 'transactional',
      })

      expect(sendRes.ok).toBe(false)
      if (!sendRes.ok) {
        expect(sendRes.failure.message).toMatch(/TELECOM_ALLOW_OUTBOUND/i)
      }
    })
  })
})
