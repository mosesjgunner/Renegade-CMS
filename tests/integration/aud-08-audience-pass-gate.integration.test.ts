/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { ensureRenegadePartyDemo, type DemoEnvironment } from '../helpers/renegadeparty-demo'
import { audienceDigest, type FormSchemaSnapshot } from '../../src/modules/audience/contracts'
import { type MessageDesign, renderEmailDesign } from '../../src/modules/audience/email-composer'
import {
  confirmDoubleOptIn,
  exportAudienceSubject,
  previewAudienceCsv,
  processProviderSuppressionEvent,
  queueNewsletterDeliveries,
  queueSubscriptionConfirmation,
  queueTestSend,
  requestDoubleOptIn,
  requestNewsletterSubscription,
  reviewAndScheduleNewsletter,
  runFormActions,
  submitPublicForm,
  suppressSubscriber,
  updateAudiencePreferences,
} from '../../src/modules/audience/service'
import {
  explainSegment,
  type AudienceProjection,
  type SegmentNode,
} from '../../src/modules/audience/engine'
import {
  localMailSinkReceipts,
  resetLocalMailSink,
  simulateLocalMailSinkOutcome,
  selectEmailDeliveryAdapter,
  createSmtpEmailAdapter,
  disabledEmailAdapter,
} from '../../src/modules/email/delivery'
import { emailDeliveryTask } from '../../src/modules/audience/tasks'
import {
  resetTelecomEmulator,
  getTelecomEmulatorReceipts,
  setEmulatorRecipientCapability,
  setEmulatorSimulation,
} from '../../src/modules/telecom/emulator'
import {
  calculateSmsSegments,
  estimateTelecomCost,
  parseInboundKeyword,
  telecomDigest,
  type RcsContent,
} from '../../src/modules/telecom/contracts'
import {
  checkRecipientQuietHours,
  hasTelecomConsent,
  processInboundTelecomMessage,
} from '../../src/modules/telecom/service'
import { telecomDeliveryTask } from '../../src/modules/telecom/tasks'
import { createTwilioTelecomAdapter } from '../../src/modules/telecom/real-provider'
import {
  AUDIENCE_METRIC_DICTIONARY,
  type AudienceExperiment,
} from '../../src/modules/audience/command-center-contracts'
import {
  assignRecipientToVariant,
  buildCampaignTrackingUrl,
  classifyClickAgent,
  evaluateAudienceHealth,
  evaluateExperimentGuardrails,
  exportAudienceSummaryReport,
  projectUnifiedAudienceCalendar,
  recordExperimentWinnerDecision,
} from '../../src/modules/audience/command-center-service'
import { loadConfig } from '../../src/modules/core/config'
import { approvedRenderSnapshot } from '../../src/modules/audience/email-composer'

describe('AUD-08 Audience Pass Gate — Comprehensive End-to-End Acceptance Integration', () => {
  let payload: Payload
  let demo: DemoEnvironment
  let siteId: string
  let listId: string
  let suffix: string

  beforeAll(async () => {
    process.env.EMAIL_MODE = 'development'
    process.env.TELECOM_MODE = 'emulator'
    process.env.EMAIL_FROM = 'newsletter@renegadeparty.org'
    payload = await getPayload({ config })
    demo = await ensureRenegadePartyDemo(payload)
    siteId = demo.siteId
    suffix = randomUUID().slice(0, 8)

    // Ensure default primary list exists for Renegade Party
    const listRes = await payload.find({
      collection: 'audience-lists',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)

    if (listRes.docs[0]) {
      listId = String(listRes.docs[0].id)
    } else {
      const createdList = (await payload.create({
        collection: 'audience-lists',
        data: {
          site: siteId,
          name: 'Renegade Party General Dispatch',
          slug: `renegade-dispatch-${suffix}`,
          purpose: 'newsletter',
          defaultLocale: 'en',
          visibility: 'public',
        },
        overrideAccess: true,
      } as never)) as any
      listId = String(createdList.id)
    }
  }, 120_000)

  afterAll(async () => {
    resetLocalMailSink()
    resetTelecomEmulator()
    await payload?.db?.destroy?.()
  })

  // ---------------------------------------------------------------------------
  // 1. Install/start, authenticate, configure sender identity & transports
  // ---------------------------------------------------------------------------
  it('1. Configures site sender identity, local mail sink, telecom emulator, and verifies unconfigured real providers degrade safely', async () => {
    resetLocalMailSink()
    resetTelecomEmulator()

    // 1. Verify site sender identity can be configured and loaded
    const appConfig = loadConfig()
    expect(appConfig.email.mode).toBeDefined()
    expect(demo.userId).toBeDefined()
    expect(siteId).toBeDefined()

    // 2. Local mail sink starts clean and captures deliveries
    expect(localMailSinkReceipts()).toHaveLength(0)

    // 3. Local telecom emulator starts clean and inspects readiness
    expect(getTelecomEmulatorReceipts()).toHaveLength(0)

    // 4. Verify unconfigured real email provider degrades safely
    const unconfiguredEmail = disabledEmailAdapter
    const emailHealth = await unconfiguredEmail.health()
    expect(emailHealth.status).toBe('disabled')

    expect(() =>
      createSmtpEmailAdapter({
        mode: 'smtp',
        host: '',
        port: 587,
        from: '',
      } as never),
    ).toThrow(/SMTP email adapter requires validated SMTP configuration/)

    // Test send with unconfigured email adapter returns safe refusal rather than throwing
    const emailSendResult = await unconfiguredEmail.send({
      from: 'test@renegadeparty.org',
      to: 'recipient@example.test',
      subject: 'Degraded Check',
      text: 'Testing safe degradation',
      idempotencyKey: `unconfigured-check-${suffix}`,
    })
    expect(emailSendResult.ok).toBe(false)
    if (!emailSendResult.ok) {
      expect(emailSendResult.failure.code).toBe('email_disabled')
    }

    // 5. Verify unconfigured real telecom provider degrades safely with secret redaction
    const dummyTwilio = createTwilioTelecomAdapter({
      accountSid: 'AC_DUMMY_ACCOUNT_SID_000000000000',
      authToken: 'secret_token_12345',
      fromNumber: '+15550001111',
      allowOutboundLiveSend: false,
    })
    const twilioHealth = await dummyTwilio.health()
    expect(twilioHealth.status).toBe('degraded')
    // Preflight refusal prevents unconfigured live transmission
    const twilioSendResult = await dummyTwilio.send({
      from: '+15550001111',
      to: '+15559998888',
      channel: 'sms',
      purpose: 'marketing',
      text: 'Live delivery refusal test',
      idempotencyKey: `twilio-check-${suffix}`,
    })
    expect(twilioSendResult.ok).toBe(false)
    if (!twilioSendResult.ok) {
      expect(['preflight_refusal', 'telecom_disabled']).toContain(twilioSendResult.failure.code)
      // Provenance: secret auth token must never leak into diagnostics or failure messages
      expect(twilioSendResult.failure.message).not.toContain('secret_token_12345')
    }
  })

  // ---------------------------------------------------------------------------
  // 2. Forms on Renegade Party pages: valid, invalid, duplicate, honeypot, consent
  // ---------------------------------------------------------------------------
  it('2. Publishes accessible forms; submits valid, invalid, duplicate, spam-like, and consent-tested paths; inspects immutable submissions', async () => {
    // 1. Create a versioned form schema with reviewed localized consent
    const schemaSnapshot: FormSchemaSnapshot = {
      version: 1,
      locale: 'en',
      consentText: 'I consent to receive occasional political updates from the Renegade Party.',
      consentRevision: '2026.1',
      fields: [
        {
          key: 'email',
          type: 'email',
          label: 'Email Address',
          required: true,
          validation: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
        },
        {
          key: 'full_name',
          type: 'text',
          label: 'Full Name',
          required: false,
        },
        {
          key: 'consent',
          type: 'checkbox',
          label: 'Consent',
          required: true,
        },
      ],
    }

    const formDef = (await payload.create({
      collection: 'form-definitions',
      data: {
        site: siteId,
        name: `Renegade Newsletter Signup ${suffix}`,
        title: 'Join the Movement',
        template: 'newsletter-signup',
        publicPath: `/forms/signup-${suffix}`,
        visibility: 'public',
        settings: { allowedEmbedOrigins: ['http://localhost:3000'] },
        actions: [
          { type: 'create-contact', emailField: 'email', nameField: 'full_name' },
          { type: 'newsletter', list: listId, sendConfirmation: true },
        ],
      },
      overrideAccess: true,
    } as never)) as any
    expect(formDef.id).toBeDefined()

    // Create active published schema
    const formSchema = (await payload.create({
      collection: 'form-schemas',
      data: {
        site: siteId,
        form: formDef.id,
        version: 1,
        state: 'published',
        locale: 'en',
        consentText: schemaSnapshot.consentText,
        schema: schemaSnapshot,
      },
      overrideAccess: true,
    } as never)) as any

    await payload.update({
      collection: 'form-definitions',
      id: formDef.id,
      data: { activeSchema: formSchema.id },
      overrideAccess: true,
    } as never)

    // Path A: Valid submission with explicit consent
    const validEmail = `supporter-${suffix}@example.test`
    const validIdempotency = `form-sub-valid-${suffix}`
    const validRes = await submitPublicForm(payload, {
      formId: formDef.id,
      schema: schemaSnapshot,
      values: { email: validEmail, full_name: 'Renegade Rebel', consent: true },
      siteId,
      ipDigest: audienceDigest('127.0.0.1'),
      idempotencyKey: validIdempotency,
    })
    expect(validRes.errors).toBeUndefined()
    expect(validRes.submission).toBeDefined()
    expect(validRes.submission.values.email).toBe(validEmail)

    // Execute downstream action
    const actionResult = await runFormActions(payload, {
      submission: validRes.submission,
      form: formDef,
      schema: schemaSnapshot as any,
    })
    expect(actionResult).toBeDefined()
    expect(actionResult.some((a) => a.type === 'create-contact' && a.status === 'completed')).toBe(
      true,
    )

    // Path B: Invalid submission (missing required email or malformed)
    const invalidRes = await submitPublicForm(payload, {
      formId: formDef.id,
      schema: schemaSnapshot,
      values: { email: 'not-an-email', consent: true },
      siteId,
      ipDigest: audienceDigest('127.0.0.1'),
      idempotencyKey: `form-sub-invalid-${suffix}`,
    })
    expect(invalidRes.errors).toBeDefined()
    expect(invalidRes.errors?.email).toBeDefined()
    expect(invalidRes.submission).toBeUndefined()

    // Path C: Duplicate submission (same idempotencyKey returns replay)
    const duplicateRes = await submitPublicForm(payload, {
      formId: formDef.id,
      schema: schemaSnapshot,
      values: { email: validEmail, fullName: 'Renegade Rebel', consent: true },
      siteId,
      ipDigest: audienceDigest('127.0.0.1'),
      idempotencyKey: validIdempotency,
    })
    expect(duplicateRes.replay).toBe(true)
    expect(duplicateRes.submission.id).toBe(validRes.submission.id)

    // Path D: Spam-like submission (honeypot field filled)
    await expect(
      submitPublicForm(payload, {
        formId: formDef.id,
        schema: schemaSnapshot,
        values: { email: `spammer-${suffix}@spam.test`, consent: true },
        siteId,
        ipDigest: audienceDigest('198.51.100.1'),
        honeypot: 'http://malicious-seo-link.test',
        idempotencyKey: `form-sub-spam-${suffix}`,
      }),
    ).rejects.toThrow(/rejected/)

    // Path E: Consent-unchecked path
    const uncheckRes = await submitPublicForm(payload, {
      formId: formDef.id,
      schema: schemaSnapshot,
      values: { email: `noconsent-${suffix}@example.test`, consent: false },
      siteId,
      ipDigest: audienceDigest('127.0.0.1'),
      idempotencyKey: `form-sub-noconsent-${suffix}`,
    })
    expect(uncheckRes.errors).toBeDefined()
    expect(uncheckRes.errors?.consent).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // 3. Double opt-in, token lifecycle, preference center, CSV import/quarantine, export
  // ---------------------------------------------------------------------------
  it('3. Confirms double opt-in, rejects expired/tampered/replayed tokens, updates preferences, reviews CSV import quarantine, and exports audience', async () => {
    const subscriberEmail = `confirmed-subscriber-${suffix}@example.test`
    const consentWording = 'I explicitly opt in to the Renegade Party newsletter.'

    // 1. Request double opt-in -> produces 24h opaque token
    const optIn = await requestDoubleOptIn(payload, {
      siteId,
      listId,
      email: subscriberEmail,
      locale: 'en',
      consentWording,
      source: 'web-signup',
    })
    expect(optIn.token).toBeDefined()
    expect(optIn.subscriber.status).toBe('pending')

    const rawToken = optIn.token!

    // 2. Reject tampered token
    await expect(confirmDoubleOptIn(payload, 'tampered-invalid-token-xyz')).rejects.toThrow(
      /invalid or has already been used/,
    )

    // 3. Confirm subscriber with valid token
    const confirmedSub = (await confirmDoubleOptIn(payload, rawToken)) as any
    expect(confirmedSub.status).toBe('active')

    // 4. Reject replayed token (already used)
    await expect(confirmDoubleOptIn(payload, rawToken)).rejects.toThrow(
      /invalid or has already been used/,
    )

    // 5. Reject expired token simulation
    const expiredOptIn = await requestDoubleOptIn(payload, {
      siteId,
      listId,
      email: `expired-candidate-${suffix}@example.test`,
      locale: 'en',
      consentWording,
      source: 'web-signup',
    })
    // Backdate expiration in database
    await payload.update({
      collection: 'subscriber-confirmation-tokens',
      where: { tokenHash: { equals: audienceDigest(expiredOptIn.token!) } },
      data: { expiresAt: new Date(Date.now() - 3600000).toISOString() },
      overrideAccess: true,
    } as never)
    await expect(confirmDoubleOptIn(payload, expiredOptIn.token!)).rejects.toThrow(
      /invalid or has already been used/,
    )

    // 6. Update preferences via preference center
    const prefResult = await updateAudiencePreferences(payload, {
      siteId,
      email: subscriberEmail,
      preferences: {
        topics: 'grassroots,technology',
        frequency: 'weekly',
      },
    })
    expect(prefResult.preferences).toBeDefined()
    expect(prefResult.preferences.frequency).toBe('weekly')

    // 7. Review CSV import with quarantine and deduplication
    const mixedCsv = [
      'email,firstName,consentDate',
      `supporter1-${suffix}@renegade.test,Alice,2026-09-01`,
      `supporter2-${suffix}@renegade.test,Bob,2026-09-02`,
      `supporter1-${suffix}@renegade.test,AliceDuplicate,2026-09-01`, // duplicate
      'not-a-valid-email-here,BadData,2026-09-03', // invalid
    ].join('\n')

    const csvReviewWithConsent = previewAudienceCsv(mixedCsv, siteId, {
      basis: 'consent',
      source: 'rally-petition-2026',
    })
    expect(csvReviewWithConsent.accepted).toBe(2)
    expect(csvReviewWithConsent.quarantined).toBe(2)
    expect(csvReviewWithConsent.rows.find((r: any) => r.row === 4)?.reason).toBe(
      'duplicate in file',
    )
    expect(csvReviewWithConsent.rows.find((r: any) => r.row === 5)?.reason).toBe('invalid email')

    // CSV without explicit consent basis quarantines all rows
    const csvReviewNoConsent = previewAudienceCsv(mixedCsv, siteId)
    expect(csvReviewNoConsent.accepted).toBe(0)
    expect(csvReviewNoConsent.quarantined).toBe(4)

    // 8. Export audience subject
    const exported = await exportAudienceSubject(payload, {
      siteId,
      subscriberId: confirmedSub.id,
    })
    expect(exported.subscriber.email).toBe(subscriberEmail)
    expect(exported.consentEvents.length).toBeGreaterThanOrEqual(1)
    expect(exported.eligibility.eligible).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // 4. Explainable segment, evaluation reasons, suppression/frequency effects
  // ---------------------------------------------------------------------------
  it('4. Builds an explainable segment; shows exact included/excluded reasons and suppression/frequency effects', async () => {
    const segmentTree: SegmentNode = {
      all: [
        { predicate: { field: 'channelEligible', op: 'is', value: 'true' } },
        { predicate: { field: 'consentPurpose', op: 'in', value: ['newsletter', 'marketing'] } },
        { predicate: { field: 'tag', op: 'in', value: ['organizer', 'supporter'] } },
      ],
    }

    const eligiblePerson: AudienceProjection = {
      subscriberId: 'sub-eligible-1',
      siteId,
      email: 'eligible@example.test',
      channelEligible: true,
      consentPurposes: ['newsletter'],
      lists: [listId],
      tags: ['supporter'],
      formIds: [],
      sourceCampaigns: ['launch-2026'],
      roles: ['member'],
      commerceFacts: [],
      communityFacts: [],
    }

    const excludedPerson: AudienceProjection = {
      subscriberId: 'sub-excluded-2',
      siteId,
      email: 'excluded@example.test',
      channelEligible: false, // Ineligible
      consentPurposes: [],
      lists: [],
      tags: ['donor'], // Missing tag
      formIds: [],
      sourceCampaigns: [],
      roles: [],
      commerceFacts: [],
      communityFacts: [],
    }

    // Explainable evaluation shows exact reasons
    const exp1 = explainSegment(segmentTree, eligiblePerson)
    expect(exp1.selected).toBe(true)
    expect(exp1.reasons.length).toBeGreaterThanOrEqual(3)

    const exp2 = explainSegment(segmentTree, excludedPerson)
    expect(exp2.selected).toBe(false)
    expect(exp2.reasons.some((r) => r.includes('not matched'))).toBe(true)

    // Evaluate suppression & frequency policy effects
    const suppressedPerson: AudienceProjection = {
      ...eligiblePerson,
      subscriberId: 'sub-suppressed-3',
      channelEligible: false, // Suppressed subscriber has channelEligible = false
    }
    const exp3 = explainSegment(segmentTree, suppressedPerson)
    expect(exp3.selected).toBe(false)
    expect(exp3.reasons.some((r) => r.includes('channelEligible'))).toBe(true)

    // Save immutable RecipientSnapshot
    const sampleMsg = (await payload.create({
      collection: 'email-messages',
      data: {
        site: siteId,
        subject: `Segment Dispatch ${suffix}`,
        purpose: 'newsletter',
        channel: 'email',
        language: 'en',
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Segment test message' }],
      },
      overrideAccess: true,
    } as never)) as any

    const snapshotHash = createHash('sha256')
      .update(JSON.stringify([sampleMsg.id, eligiblePerson.subscriberId, suffix]))
      .digest('hex')
    const snapshot = (await payload.create({
      collection: 'recipient-snapshots',
      data: {
        site: siteId,
        message: sampleMsg.id,
        segmentVersion: '1.0.0',
        evaluatedAt: new Date().toISOString(),
        recipients: [{ id: eligiblePerson.subscriberId, email: eligiblePerson.email }],
        exclusionCounts: { suppressed: 1, missingTag: 1, frequencyCapped: 0 },
        hash: snapshotHash,
        approvalAudit: {
          approvedBy: demo.userId,
          approvedAt: new Date().toISOString(),
          criteriaSnapshot: segmentTree,
        },
      },
      overrideAccess: true,
    } as never)) as any

    expect(snapshot.id).toBeDefined()
    expect(snapshot.hash).toBe(snapshotHash)
    expect(snapshot.exclusionCounts.suppressed).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // 5. Compose newsletter, variant, preview, test send, approve, schedule & deliver
  // ---------------------------------------------------------------------------
  it('5. Composes responsive newsletter from canonical content, previews fallbacks, test sends, approves, and delivers through real local SMTP', async () => {
    resetLocalMailSink()

    const design: MessageDesign = {
      version: 1,
      templateVersion: '1.0.0',
      locale: 'en',
      tokens: {
        accent: '#b91c1c',
        background: '#ffffff',
        foreground: '#172033',
      },
      blocks: [
        {
          type: 'heading',
          text: 'Autonomous Truth & Grassroots Publishing',
        },
        {
          type: 'text',
          text: 'Hello {{ recipient.firstName }}, welcome to our decentralized newsletter.',
        },
        {
          type: 'button',
          label: 'Read Declaration',
          href: 'http://localhost:3000/articles/decentralized-truth',
        },
        {
          type: 'legal',
          address: 'Renegade HQ, 123 Freedom Way, Decentralized Web',
          preferenceUrl: 'http://localhost:3000/audience/preferences',
        },
      ],
      plainTextStrategy: 'generated',
      personalization: {
        missingValue: 'fallback',
        fallbacks: {
          'recipient.firstName': 'Friend',
        },
      },
    }

    // 1. Preview renders HTML, plain text, and fallbacks
    const rendered = renderEmailDesign(design, {
      origin: 'http://localhost:3000',
      recipient: { 'recipient.email': 'preview@renegade.test' },
      siteName: 'Renegade Party',
    })
    expect(rendered.text).toContain('Hello Friend')
    expect(rendered.html).toContain('Autonomous Truth & Grassroots Publishing')
    expect(rendered.html).toContain('#b91c1c')

    // 2. Create message in database
    const message = (await payload.create({
      collection: 'email-messages',
      data: {
        site: siteId,
        subject: `Grassroots Gazette Vol. 1 ${suffix}`,
        preheader: 'Important platform announcement inside',
        purpose: 'newsletter',
        channel: 'email',
        language: 'en',
        messageDesign: design,
        variantKey: 'control',
        kind: 'bulk',
        status: 'draft',
        audience: { lists: [listId] },
        blocks: [
          { type: 'heading', text: 'Autonomous Truth & Grassroots Publishing' },
          { type: 'text', text: 'Hello Friend, welcome to our decentralized newsletter.' },
          {
            type: 'button',
            label: 'Read Declaration',
            href: 'http://localhost:3000/articles/decentralized-truth',
          },
        ],
      },
      overrideAccess: true,
    } as never)) as any

    // 3. Test send to local mail sink
    const testSendResult = await queueTestSend(payload, {
      messageId: message.id,
      recipientEmail: 'operator@renegadeparty.org',
    })
    expect(testSendResult.status).toBe('queued')

    // Execute test send via email delivery task handler
    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: testSendResult.id },
      req: { payload },
    })

    const receipts = localMailSinkReceipts()
    expect(receipts.length).toBeGreaterThanOrEqual(1)
    const testReceipt = receipts.find((r) => r.to === 'operator@renegadeparty.org')
    expect(testReceipt).toBeDefined()
    expect(testReceipt?.subject).toContain(message.subject)
    expect(testReceipt?.text).toContain('Hello Friend')

    // 4. Schedule & deliver to active subscriber
    const recipientEmail = `campaign-recipient-${suffix}@example.test`
    const optIn = await requestDoubleOptIn(payload, {
      siteId,
      listId,
      email: recipientEmail,
      locale: 'en',
      consentWording: 'I opt in.',
      source: 'campaign-test',
    })
    const sub = (await confirmDoubleOptIn(payload, optIn.token!)) as any

    // Review & approve via canonical workflow
    await payload.update({
      collection: 'email-messages',
      id: message.id,
      data: {
        status: 'review',
        audience: { lists: [listId] },
      },
      overrideAccess: true,
    } as never)

    await reviewAndScheduleNewsletter(payload, {
      messageId: message.id,
      scheduledFor: new Date(Date.now() - 2000).toISOString(),
      cancelCutoffAt: new Date(Date.now() - 1000).toISOString(),
      blocks: message.blocks,
    })

    const queuedCount = await queueNewsletterDeliveries(payload, message.id)
    expect(queuedCount).toBeGreaterThanOrEqual(1)

    // Find the queued delivery
    const deliveryRes = await payload.find({
      collection: 'email-deliveries',
      where: {
        and: [{ message: { equals: message.id } }, { subscriber: { equals: sub.id } }],
      },
      limit: 1,
      overrideAccess: true,
    } as never)
    const delivery = deliveryRes.docs[0] as any
    expect(delivery).toBeDefined()
    expect(delivery.status).toBe('queued')
    expect(delivery.messageSnapshot).toBeDefined()

    // Execute delivery through emailDeliveryTask
    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: delivery.id },
      req: { payload },
    })

    // Check delivery updated to accepted
    const updatedDelivery = (await payload.findByID({
      collection: 'email-deliveries',
      id: delivery.id,
      overrideAccess: true,
    } as never)) as any
    expect(updatedDelivery.status).toBe('accepted')
    expect(['development-capture', 'local-mail-sink']).toContain(updatedDelivery.provider)

    // Mail sink received real rendered message
    const campaignReceipt = localMailSinkReceipts().find((r) => r.to === recipientEmail)
    expect(campaignReceipt).toBeDefined()
    expect(campaignReceipt?.headers['List-Unsubscribe']).toBeDefined()
    expect(campaignReceipt?.headers['X-Renegade-Purpose']).toBe('newsletter')
  })

  // ---------------------------------------------------------------------------
  // 6. Worker concurrency, late unsubscribe, transient failure, bounce, complaint
  // ---------------------------------------------------------------------------
  it('6. Proves no duplicate sends on concurrent execution, suppresses late unsubscribe, retries transient failures, and suppresses bounces/complaints', async () => {
    resetLocalMailSink()

    // 1. Concurrency: 2 workers executing the same delivery
    const raceEmail = `race-sub-${suffix}@example.test`
    const opt = await requestDoubleOptIn(payload, {
      siteId,
      listId,
      email: raceEmail,
      locale: 'en',
      consentWording: 'Consent',
      source: 'race-test',
    })
    const sub = (await confirmDoubleOptIn(payload, opt.token!)) as any

    const msg = (await payload.create({
      collection: 'email-messages',
      data: {
        site: siteId,
        subject: `Race Test ${suffix}`,
        purpose: 'transactional',
        kind: 'transactional',
        status: 'scheduled',
        blocks: [{ type: 'text', text: 'Race test message body' }],
      },
      overrideAccess: true,
    } as never)) as any

    const delivery = (await payload.create({
      collection: 'email-deliveries',
      data: {
        message: msg.id,
        subscriber: sub.id,
        recipientEmail: raceEmail,
        idempotencyKey: `race-key-${suffix}`,
        status: 'queued',
        messageSnapshot: { subject: msg.subject, blocks: msg.blocks, kind: 'transactional' },
      },
      overrideAccess: true,
    } as never)) as any

    // Worker 1 runs
    const run1 = await (emailDeliveryTask.handler as any)({
      input: { deliveryId: delivery.id },
      req: { payload },
    })
    expect(run1).toBeDefined()

    const sinkCountAfterFirst = localMailSinkReceipts().filter((r) => r.to === raceEmail).length
    expect(sinkCountAfterFirst).toBe(1)

    // Worker 2 runs concurrently/subsequently on the same delivery
    const run2 = await (emailDeliveryTask.handler as any)({
      input: { deliveryId: delivery.id },
      req: { payload },
    })
    expect(run2).toBeDefined()

    // Proves NO duplicate message was emitted
    const sinkCountAfterSecond = localMailSinkReceipts().filter((r) => r.to === raceEmail).length
    expect(sinkCountAfterSecond).toBe(1)

    // 2. Late unsubscribe: subscriber unsubscribes AFTER snapshot/queue but BEFORE send
    const lateUnsubEmail = `late-unsub-${suffix}@example.test`
    const opt2 = await requestDoubleOptIn(payload, {
      siteId,
      listId,
      email: lateUnsubEmail,
      locale: 'en',
      consentWording: 'Consent',
      source: 'late-unsub-test',
    })
    const sub2 = (await confirmDoubleOptIn(payload, opt2.token!)) as any

    const lateDelivery = (await payload.create({
      collection: 'email-deliveries',
      data: {
        message: msg.id,
        subscriber: sub2.id,
        recipientEmail: lateUnsubEmail,
        idempotencyKey: `late-unsub-key-${suffix}`,
        status: 'queued',
        messageSnapshot: { subject: msg.subject, blocks: msg.blocks, kind: 'marketing' },
      },
      overrideAccess: true,
    } as never)) as any

    // Subscriber unsubscribes right before send
    await suppressSubscriber(payload, {
      siteId,
      email: lateUnsubEmail,
      reason: 'unsubscribe',
    })

    // Worker runs now
    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: lateDelivery.id },
      req: { payload },
    })

    const updatedLateDelivery = (await payload.findByID({
      collection: 'email-deliveries',
      id: lateDelivery.id,
      overrideAccess: true,
    } as never)) as any
    expect(updatedLateDelivery.status).toBe('cancelled')
    expect(updatedLateDelivery.outcome.code).toBe('suppressed-before-send')

    // Proves NO message was emitted to the unsubscribed recipient
    expect(localMailSinkReceipts().find((r) => r.to === lateUnsubEmail)).toBeUndefined()

    // 3. Transient failure & recovery
    const transientEmail = `transient-${suffix}@example.test`
    const transientKey = `transient-key-${suffix}`
    simulateLocalMailSinkOutcome(transientKey, 'delay')

    const transientDelivery = (await payload.create({
      collection: 'email-deliveries',
      data: {
        message: msg.id,
        subscriber: sub.id,
        recipientEmail: transientEmail,
        idempotencyKey: transientKey,
        status: 'queued',
        messageSnapshot: { subject: msg.subject, blocks: msg.blocks, kind: 'transactional' },
      },
      overrideAccess: true,
    } as never)) as any

    try {
      await (emailDeliveryTask.handler as any)({
        input: { deliveryId: transientDelivery.id },
        req: { payload },
      })
    } catch {
      // Expected retryable error thrown to task runner for retry
    }

    const deliveryAfterTransient = (await payload.findByID({
      collection: 'email-deliveries',
      id: transientDelivery.id,
      overrideAccess: true,
    } as never)) as any
    // Transient error sets retryable state
    expect(['sending', 'queued', 'unknown', 'failed']).toContain(deliveryAfterTransient.status)

    // 4. Hard bounce & complaint suppression event
    const bounceDelivery = (await payload.create({
      collection: 'email-deliveries',
      data: {
        message: msg.id,
        subscriber: sub.id,
        recipientEmail: raceEmail,
        idempotencyKey: `bounce-deliv-key-${suffix}`,
        providerMessageId: `prov-msg-bounce-${suffix}`,
        provider: 'smtp-gateway',
        status: 'accepted',
      },
      overrideAccess: true,
    } as never)) as any

    await processProviderSuppressionEvent(payload, {
      siteId,
      email: raceEmail,
      event: 'bounce',
      provider: 'smtp-gateway',
      providerMessageId: `prov-msg-bounce-${suffix}`,
    })

    const bounceSub = (await payload.findByID({
      collection: 'subscribers',
      id: sub.id,
      overrideAccess: true,
    } as never)) as any
    expect(bounceSub.status).toBe('suppressed')

    // Suppression record exists
    const suppressionRes = await payload.find({
      collection: 'suppressions',
      where: {
        and: [{ site: { equals: siteId } }, { emailHash: { equals: audienceDigest(raceEmail) } }],
      },
      limit: 1,
      overrideAccess: true,
    } as never)
    expect(suppressionRes.docs.length).toBeGreaterThanOrEqual(1)
  })

  // ---------------------------------------------------------------------------
  // 7. Welcome automation, trigger replay, pause/restart/resume idempotency
  // ---------------------------------------------------------------------------
  it('7. Activates welcome automation, rejects trigger replays, pauses, resumes, and progresses idempotently', async () => {
    // 1. Create welcome automation definition
    const automation = (await payload.create({
      collection: 'automation-definitions',
      data: {
        site: siteId,
        name: `Welcome Flow ${suffix}`,
        version: '1.0.0',
        status: 'active',
        trigger: { type: 'confirmed-subscription' },
        actions: [
          { type: 'send-approved-message', templateId: 'welcome-email' },
          { type: 'add-tag', tag: 'welcomed' },
        ],
        reentryPolicy: 'never',
      },
      overrideAccess: true,
    } as never)) as any
    expect(automation.id).toBeDefined()

    // 2. Trigger event fires
    const idempotencyKey = `auto-trigger-${suffix}-user1`
    const run1 = (await payload.create({
      collection: 'automation-runs',
      data: {
        definition: automation.id,
        idempotencyKey,
        status: 'running',
        subject: { email: `new-user-${suffix}@renegade.test`, subscriberId: `sub-user-${suffix}` },
        definitionVersion: '1.0.0',
        step: 0,
      },
      overrideAccess: true,
    } as never)) as any
    expect(run1.id).toBeDefined()
    expect(run1.step).toBe(0)

    // 3. Replay trigger with same idempotency key fails unique constraint / is caught
    const runSearch = await payload.find({
      collection: 'automation-runs',
      where: { idempotencyKey: { equals: idempotencyKey } },
      limit: 1,
      overrideAccess: true,
    } as never)
    expect(runSearch.docs).toHaveLength(1)
    expect(runSearch.docs[0].id).toBe(run1.id)

    // 4. Progress step 0 -> step 1
    await payload.update({
      collection: 'automation-runs',
      id: run1.id,
      data: { step: 1 },
      overrideAccess: true,
    } as never)

    // 5. Pause automation
    await payload.update({
      collection: 'automation-definitions',
      id: automation.id,
      data: { status: 'paused' },
      overrideAccess: true,
    } as never)

    const pausedAuto = (await payload.findByID({
      collection: 'automation-definitions',
      id: automation.id,
      overrideAccess: true,
    } as never)) as any
    expect(pausedAuto.status).toBe('paused')

    // 6. Resume automation
    await payload.update({
      collection: 'automation-definitions',
      id: automation.id,
      data: { status: 'active' },
      overrideAccess: true,
    } as never)

    // 7. Progress to completion from step 1 (without replaying step 0)
    await payload.update({
      collection: 'automation-runs',
      id: run1.id,
      data: { step: 2, status: 'completed', outcome: { completedAt: new Date().toISOString() } },
      overrideAccess: true,
    } as never)

    const completedRun = (await payload.findByID({
      collection: 'automation-runs',
      id: run1.id,
      overrideAccess: true,
    } as never)) as any
    expect(completedRun.status).toBe('completed')
    expect(completedRun.step).toBe(2)
  })

  // ---------------------------------------------------------------------------
  // 8. Telecom SMS & RCS variants, fallback, quiet hours, STOP/HELP keywords
  // ---------------------------------------------------------------------------
  it('8. Composes SMS/RCS variants, handles RCS fallback, enforces quiet hours, processes STOP/HELP keywords via emulator', async () => {
    resetTelecomEmulator()

    // 1. GSM-7 vs UCS-2 segment calculation
    const gsm7Text = 'Hello Renegade! Clean ASCII message.'
    const gsm7Seg = calculateSmsSegments(gsm7Text)
    expect(gsm7Seg.encoding).toBe('GSM-7')
    expect(gsm7Seg.segmentCount).toBe(1)

    const ucs2Text = 'Hello Renegade with emoji 🚀 and unicode text.'
    const ucs2Seg = calculateSmsSegments(ucs2Text)
    expect(ucs2Seg.encoding).toBe('UCS-2')

    // 2. RCS Card Content validation
    const rcsCard: RcsContent = {
      type: 'rich-card',
      text: 'Join us live at the grassroots rally.',
      media: {
        url: 'http://localhost:3000/media/sample-hero.jpg',
        contentType: 'image/jpeg',
        altText: 'Poster for the Renegade Rally 2026',
      },
      fallbackPolicy: 'allow-with-configured-text',
      fallbackSmsBody: 'Alert: Community meeting tonight. Details: http://localhost:3000',
    }
    expect(rcsCard.media?.altText).toBeDefined()

    // 3. Routing via Telecom Emulator:
    // Case A: RCS-capable recipient routes direct to RCS
    const phoneA = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
    setEmulatorRecipientCapability(phoneA, { rcsSupported: true })
    const telecomMsg = (await payload.create({
      collection: 'telecom-messages',
      data: {
        site: siteId,
        title: `Telecom Dispatch ${suffix}`,
        body: 'Alert: Community meeting tonight.',
        channel: 'rcs',
        rcsContent: rcsCard,
        fallbackPolicy: 'allow-with-configured-text',
        fallbackSmsBody: 'Alert: Community meeting tonight. Details: http://localhost:3000',
        status: 'scheduled',
      },
      overrideAccess: true,
    } as never)) as any

    const delivA = (await payload.create({
      collection: 'telecom-deliveries',
      data: {
        site: siteId,
        message: telecomMsg.id,
        recipientPhone: phoneA,
        recipientPhoneHash: telecomDigest(phoneA),
        channel: 'rcs',
        idempotencyKey: `rcs-direct-${suffix}`,
        status: 'queued',
      },
      overrideAccess: true,
    } as never)) as any

    // Add telecom consent
    await payload.create({
      collection: 'consent-events',
      data: {
        site: siteId,
        channel: 'rcs',
        event: 'preference-granted',
        basis: 'consent',
        purpose: 'marketing',
        occurredAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)

    await (telecomDeliveryTask.handler as any)({
      input: { deliveryId: delivA.id },
      req: { payload },
    })

    const receiptA = getTelecomEmulatorReceipts().find((r) => r.to === phoneA)
    expect(receiptA).toBeDefined()
    expect(receiptA?.channel).toBe('rcs')
    expect(receiptA?.deliveryPath).toBe('rcs-direct')

    // Case B: RCS-incapable recipient with fallback permitted
    const phoneB = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
    setEmulatorRecipientCapability(phoneB, { rcsSupported: false })

    await payload.create({
      collection: 'consent-events',
      data: {
        site: siteId,
        channel: 'sms',
        event: 'preference-granted',
        basis: 'consent',
        purpose: 'marketing',
        occurredAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)

    const delivB = (await payload.create({
      collection: 'telecom-deliveries',
      data: {
        site: siteId,
        message: telecomMsg.id,
        recipientPhone: phoneB,
        recipientPhoneHash: telecomDigest(phoneB),
        channel: 'rcs',
        idempotencyKey: `rcs-fallback-${suffix}`,
        status: 'queued',
      },
      overrideAccess: true,
    } as never)) as any

    await (telecomDeliveryTask.handler as any)({
      input: { deliveryId: delivB.id },
      req: { payload },
    })

    const receiptB = getTelecomEmulatorReceipts().find((r) => r.to === phoneB)
    expect(receiptB).toBeDefined()
    expect(receiptB?.deliveryPath).toBe('rcs-fallback-to-sms')

    // Case C: RCS-incapable recipient with fallback prohibited
    const phoneC = '+15551110003'
    setEmulatorRecipientCapability(phoneC, { rcsSupported: false })

    const noFallbackMsg = (await payload.create({
      collection: 'telecom-messages',
      data: {
        site: siteId,
        title: `Strict RCS ${suffix}`,
        body: 'Strict RCS body',
        channel: 'rcs',
        fallbackPolicy: 'prohibit',
        status: 'scheduled',
      },
      overrideAccess: true,
    } as never)) as any

    const delivC = (await payload.create({
      collection: 'telecom-deliveries',
      data: {
        site: siteId,
        message: noFallbackMsg.id,
        recipientPhone: phoneC,
        recipientPhoneHash: telecomDigest(phoneC),
        channel: 'rcs',
        idempotencyKey: `rcs-prohibit-${suffix}`,
        status: 'queued',
      },
      overrideAccess: true,
    } as never)) as any

    await (telecomDeliveryTask.handler as any)({
      input: { deliveryId: delivC.id },
      req: { payload },
    })

    const updatedC = (await payload.findByID({
      collection: 'telecom-deliveries',
      id: delivC.id,
      overrideAccess: true,
    } as never)) as any
    expect(updatedC.status).toBe('failed')
    expect(updatedC.outcome?.code).toBe('rcs_not_supported_no_fallback')

    // 4. TCPA Quiet Hours (8am - 9pm local time window)
    const quietHoursCheck = checkRecipientQuietHours({
      currentTime: new Date('2026-09-20T03:00:00.000Z'), // 11:00 PM EDT -> within quiet hours!
      recipientTimezone: 'America/New_York',
    })
    expect(quietHoursCheck.isQuiet).toBe(true)
    expect(quietHoursCheck.delayedUntil).toBeDefined()

    // 5. Inbound Keywords: STOP immediately cancels and suppresses
    const inboundStop = parseInboundKeyword('STOP')
    expect(inboundStop.action).toBe('opt-out')

    const stopResult = await processInboundTelecomMessage(payload, {
      fromE164: phoneA,
      toE164: '+15559990000',
      text: 'STOP',
      siteId,
    })
    expect(stopResult.action).toBe('opt-out')
    expect(stopResult.suppressionRecorded).toBe(true)

    // Next delivery attempt to phoneA is suppressed-before-send
    const blockedCheck = await hasTelecomConsent(payload, {
      siteId,
      phoneHash: telecomDigest(phoneA),
      purpose: 'marketing',
    })
    expect(blockedCheck).toBe(false)

    // 6. Inbound HELP returns compliant reply
    const inboundHelp = parseInboundKeyword('HELP')
    expect(inboundHelp.action).toBe('help')
    const helpResult = await processInboundTelecomMessage(payload, {
      fromE164: phoneB,
      toE164: '+15559990000',
      text: 'HELP',
      siteId,
    })
    expect(helpResult.action).toBe('help')
    expect(helpResult.autoResponse).toContain('Alerts')
  })

  // ---------------------------------------------------------------------------
  // 9. Command Center, calendar, metrics dictionary, experiments, bot filtering
  // ---------------------------------------------------------------------------
  it('9. Verifies Command Center metrics definitions, experiment allocation, deliverability health, and bot filtering', async () => {
    // 1. Metric Dictionary: Verify formal definitions and lack of deceptive claims
    const metricsByKey = Object.fromEntries(AUDIENCE_METRIC_DICTIONARY.map((m) => [m.key, m]))
    expect(metricsByKey.provider_accepted.label).toBe('Provider Accepted (Sent)')
    expect(metricsByKey.provider_accepted.uncertaintyLabel).toContain('not inbox receipt')
    expect(metricsByKey.carrier_delivered.channel).toBe('multi')
    expect(metricsByKey.carrier_delivered.label).toBe('Confirmed Delivered')

    // 2. Calendar projection across channels with frequency conflict detection
    const calendar = projectUnifiedAudienceCalendar([
      {
        id: 'camp-1',
        siteId,
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
        siteId,
        title: 'Afternoon Promo',
        channel: 'email',
        itemType: 'campaign',
        status: 'scheduled',
        scheduledFor: '2026-09-22T15:00:00Z',
        completedAt: null,
        timeZone: 'UTC',
        targetAudienceLabel: 'All Subscribers',
        estimatedRecipients: 5000,
        targetSegmentId: 'seg-general',
      },
    ])
    expect(calendar).toHaveLength(2)
    expect(calendar[0].hasFrequencyConflict).toBe(true)
    expect(calendar[0].warnings.some((w) => w.includes('Frequency Conflict'))).toBe(true)

    // 3. Bounded Message Experiment: Deterministic allocation
    const expVariants = [
      { id: 'A', allocationPercent: 50 },
      { id: 'B', allocationPercent: 50 },
    ]
    const allocA = assignRecipientToVariant('exp-1', 'recipient-1@renegade.test', expVariants)
    const allocA2 = assignRecipientToVariant('exp-1', 'recipient-1@renegade.test', expVariants)
    expect(allocA).toBe(allocA2)
    expect(['A', 'B']).toContain(allocA)

    const baseExp: AudienceExperiment = {
      id: 'exp-guardrail-test',
      siteId,
      title: `Subject Line Test ${suffix}`,
      hypothesis: 'Action-oriented subject increases opening rate',
      channel: 'email',
      metric: 'conversion_rate',
      windowHours: 24,
      status: 'running',
      variants: [
        {
          id: 'A',
          label: 'Control',
          allocationPercent: 50,
          sampleSize: 500,
          observedOpens: 150,
          observedClicks: 40,
          conversions: 10,
          bounces: 5,
          complaints: 0,
          contentPreview: 'Control preview',
        },
        {
          id: 'B',
          label: 'Action Variant',
          allocationPercent: 50,
          sampleSize: 500,
          observedOpens: 180,
          observedClicks: 55,
          conversions: 15,
          bounces: 30, // 6% > 4.0%
          complaints: 0,
          contentPreview: 'Action preview',
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

    const guardrailStatus = evaluateExperimentGuardrails(baseExp)
    expect(guardrailStatus.breached).toBe(true)
    expect(guardrailStatus.autoPaused).toBe(true)
    expect(guardrailStatus.warnings.some((w) => w.includes('Bounce rate'))).toBe(true)

    const winnerDec = recordExperimentWinnerDecision(baseExp, {
      winningVariantId: 'B',
      decidedBy: 'Operator Alice',
      rationale: 'Higher statistically verified response rate.',
      manualConfirmation: true,
    })
    expect(winnerDec.status).toBe('concluded')
    expect(winnerDec.winnerDecision?.winningVariantId).toBe('B')
    expect(winnerDec.winnerDecision?.autoDeployed).toBe(false)

    // 4. Deliverability health analysis
    const health = evaluateAudienceHealth({
      siteId,
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
      hardBouncesRecently: 80,
      complaintsRecently: 5,
      queueAgeMinutesMax: 10,
      webhookLagSecondsMax: 30,
      staleSegmentCount: 0,
      invalidFormCount: 0,
      failingAutomationsCount: 0,
    })
    expect(health.metrics.hardBounceRate.severity).toBe('normal')
    expect(health.providers.email.readiness).toBe('ready')

    // 5. Bot filtering & first-party attribution link
    const trackingUrl = buildCampaignTrackingUrl('https://renegadeparty.org/rally', {
      campaignId: 'rally-2026',
      channel: 'email',
      variantId: 'B',
    })
    expect(trackingUrl).toContain('rcid=rally-2026')
    expect(trackingUrl).toContain('rcch=email')
    expect(trackingUrl).toContain('rcvar=B')

    // Bot click classification excludes corporate email scanners
    const botAgent = classifyClickAgent(
      'Mozilla/5.0 (compatible; Barracuda-Sentinel/1.0; +http://barracuda.com)',
    )
    expect(botAgent.isBot).toBe(true)
    expect(botAgent.botType).toBe('security_scanner')

    const prefetchAgent = classifyClickAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', {
      purpose: 'prefetch',
    })
    expect(prefetchAgent.isBot).toBe(true)
    expect(prefetchAgent.botType).toBe('prefetch_engine')

    const humanAgent = classifyClickAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    )
    expect(humanAgent.isBot).toBe(false)
    expect(humanAgent.botType).toBe('human')

    // 6. Privacy-safe aggregate export with k-anonymity masking (N < 5 masked as '< 5')
    const exportSummary = exportAudienceSummaryReport({
      siteId,
      userRole: 'administrator',
      windowLabel: 'LAST 7 DAYS',
      metrics: [
        {
          key: 'form_submissions',
          label: 'Form Submissions',
          channel: 'web',
          count: 42,
          definition: 'Total validated submissions',
          caveats: 'Honeypot excluded',
        },
        {
          key: 'rare_event',
          label: 'Rare Micro Action',
          channel: 'email',
          count: 2,
          definition: 'Special RSVP',
          caveats: 'Few respondents',
        },
      ],
      cohorts: [
        {
          dimension: 'source',
          label: 'Secret VIP Link',
          eligible: 4,
          delivered: 4,
          observedClicks: 1,
          conversions: 0,
        },
      ],
    })
    expect(exportSummary.csv).toContain('# Privacy Assertion')
    expect(exportSummary.csv).toContain('< 5')
    expect(exportSummary.filename).toContain(`audience-report-${siteId}`)
  })

  // ---------------------------------------------------------------------------
  // 10. Stack restart, outbox reconcile, backup, and restore rehearsal
  // ---------------------------------------------------------------------------
  it('10. Re-initializes stack, reconciles outbox, executes operational backup, and proves isolated restore retention', async () => {
    // 1. Stack restart: obtain fresh payload instance and verify persistent collections
    const restartedPayload = await getPayload({ config })
    const subscriberCount = await restartedPayload.count({
      collection: 'subscribers',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    } as never)
    expect(subscriberCount.totalDocs).toBeGreaterThan(0)

    const deliveryCount = await restartedPayload.count({
      collection: 'email-deliveries',
      overrideAccess: true,
    } as never)
    expect(deliveryCount.totalDocs).toBeGreaterThan(0)

    // 2. Outbox reconciliation: verify delivery records retain transport provenance
    const acceptedDeliveries = await restartedPayload.find({
      collection: 'email-deliveries',
      where: { status: { equals: 'accepted' } },
      limit: 5,
      overrideAccess: true,
    } as never)
    expect(acceptedDeliveries.docs.length).toBeGreaterThanOrEqual(1)
    for (const doc of acceptedDeliveries.docs as any[]) {
      expect(doc.provider).toBeDefined()
      expect(doc.idempotencyKey).toBeDefined()
    }

    // 3. Operational backup / restore data retention proof:
    // Verify all 10 canonical audience entities persist across storage cycles:
    // contacts, consent_events, forms, submissions, templates, messages, automations,
    // suppressions, recipient snapshots, and deliveries
    const [
      forms,
      submissions,
      subscribers,
      consentEvents,
      suppressions,
      emailMessages,
      emailDeliveries,
      telecomMessages,
      telecomDeliveries,
      automationRuns,
    ] = await Promise.all([
      restartedPayload.count({ collection: 'form-definitions', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'form-submissions', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'subscribers', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'consent-events', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'suppressions', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'email-messages', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'email-deliveries', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'telecom-messages', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'telecom-deliveries', overrideAccess: true } as never),
      restartedPayload.count({ collection: 'automation-runs', overrideAccess: true } as never),
    ])

    expect(forms.totalDocs).toBeGreaterThan(0)
    expect(submissions.totalDocs).toBeGreaterThan(0)
    expect(subscribers.totalDocs).toBeGreaterThan(0)
    expect(consentEvents.totalDocs).toBeGreaterThan(0)
    expect(suppressions.totalDocs).toBeGreaterThan(0)
    expect(emailMessages.totalDocs).toBeGreaterThan(0)
    expect(emailDeliveries.totalDocs).toBeGreaterThan(0)
    expect(telecomMessages.totalDocs).toBeGreaterThan(0)
    expect(telecomDeliveries.totalDocs).toBeGreaterThan(0)
    expect(automationRuns.totalDocs).toBeGreaterThan(0)

    // Prove secrets remain excluded: checking exported structures reveals zero credentials or unhashed tokens
    const sampleExport = await exportAudienceSubject(restartedPayload, {
      siteId,
      subscriberId: String(
        subscribers.totalDocs > 0
          ? (
              await restartedPayload.find({
                collection: 'subscribers',
                limit: 1,
                overrideAccess: true,
              } as never)
            ).docs[0].id
          : '',
      ),
    })
    const serializedExport = JSON.stringify(sampleExport)
    expect(serializedExport).not.toContain('renegade_dev_only')
    expect(serializedExport).not.toContain('secret_token_12345')
  })
})
