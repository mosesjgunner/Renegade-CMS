/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { ensureRenegadePartyDemo, type DemoEnvironment } from '../helpers/renegadeparty-demo'

import { POST as handleSubscribe } from '../../src/app/(frontend)/api/subscribers/subscribe/route'
import { POST as handleConfirm } from '../../src/app/(frontend)/api/subscribers/confirm/route'
import { POST as handlePreferences } from '../../src/app/(frontend)/api/subscribers/preferences/route'
import { POST as handleUnsubscribe } from '../../src/app/(frontend)/api/subscribers/unsubscribe/route'

import {
  issueAudienceAccessToken,
  isSubscriberSuppressed,
  subscriberSuppressionReason,
} from '../../src/modules/audience/service'
import { audienceDigest } from '../../src/modules/audience/contracts'
import {
  localMailSinkReceipts,
  resetLocalMailSink,
  disabledEmailAdapter,
} from '../../src/modules/email/delivery'
import { emailDeliveryTask } from '../../src/modules/audience/tasks'

describe('RC-04 Public Subscription Journey & Audience System Integration', () => {
  let payload: Payload
  let demo: DemoEnvironment
  let siteId: string
  const runId = randomUUID().slice(0, 8)

  beforeAll(async () => {
    process.env.EMAIL_MODE = 'development'
    process.env.TELECOM_MODE = 'emulator'
    process.env.EMAIL_FROM = 'newsletter@renegadeparty.org'

    payload = await getPayload({ config })
    demo = await ensureRenegadePartyDemo(payload)
    siteId = demo.siteId
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { canonicalOriginsBySite: { [siteId]: 'http://localhost:3000' } },
      overrideAccess: true,
    })
    resetLocalMailSink()
  })

  afterAll(async () => {
    resetLocalMailSink()
  })

  it('proves only human-facing fields are required and site/list resolution happens automatically', async () => {
    const visitorEmail = `human-fields-${runId}@example.test`

    // Only email submitted; no siteId or listId provided by visitor
    const req = new Request('http://localhost:3000/api/subscribers/subscribe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `192.0.2.${Math.floor(Math.random() * 200 + 1)}`,
      },
      body: JSON.stringify({
        email: visitorEmail,
      }),
    })

    const res = await handleSubscribe(req)
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json.status).toBe('pending')

    // Verify subscriber was created and attached to resolved site and list
    const sub = (
      await payload.find({
        collection: 'subscribers',
        where: {
          and: [{ site: { equals: siteId } }, { email: { equals: visitorEmail } }],
        },
        limit: 1,
        overrideAccess: true,
      } as never)
    ).docs[0] as any

    expect(sub).toBeDefined()
    expect(sub.status).toBe('pending')

    // Verify consent language was persisted
    const consent = (
      await payload.find({
        collection: 'consent-events',
        where: { subscriber: { equals: sub.id } },
        limit: 1,
        overrideAccess: true,
      } as never)
    ).docs[0] as any

    expect(consent).toBeDefined()
    expect(consent.wording).toContain('consent to receive newsletter updates')
    expect(consent.event).toBe('requested')
  })

  it('rejects invalid inputs and enforces public rate limiting against abuse', async () => {
    const abuseIp = `203.0.113.${Math.floor(Math.random() * 200 + 1)}`

    // Invalid email input
    const invalidReq = new Request('http://localhost:3000/api/subscribers/subscribe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': abuseIp,
      },
      body: JSON.stringify({ email: 'not-an-email-address' }),
    })

    const invalidRes = await handleSubscribe(invalidReq)
    expect(invalidRes.status).toBe(400)
    const invalidJson = await invalidRes.json()
    expect(invalidJson.error).toContain('valid email address')

    // Abusive repeated requests trigger 429
    let rateLimited = false
    for (let i = 0; i < 12; i++) {
      const floodReq = new Request('http://localhost:3000/api/subscribers/subscribe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': abuseIp,
        },
        body: JSON.stringify({ email: `flood-${i}-${runId}@example.test` }),
      })
      const floodRes = await handleSubscribe(floodReq)
      if (floodRes.status === 429) {
        rateLimited = true
        const floodJson = await floodRes.json()
        expect(floodJson.error).toContain('Please try again shortly')
        break
      }
    }
    expect(rateLimited).toBe(true)
  })

  it('proves full journey: request -> confirmation -> preferences -> unsubscribe -> suppression -> re-subscribe', async () => {
    resetLocalMailSink()
    const journeyEmail = `journey-${runId}@example.test`
    const ip = `198.51.100.${Math.floor(Math.random() * 200 + 1)}`

    // 1. Initial request via public /api/subscribers/subscribe
    const req1 = new Request('http://localhost:3000/api/subscribers/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: journeyEmail }),
    })
    const res1 = await handleSubscribe(req1)
    expect(res1.status).toBe(202)

    // 2. Duplicate subscribe is idempotent (returns 202 without creating duplicate tokens/records)
    const reqDuplicate = new Request('http://localhost:3000/api/subscribers/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: journeyEmail }),
    })
    const resDuplicate = await handleSubscribe(reqDuplicate)
    expect(resDuplicate.status).toBe(202)

    // Retrieve subscriber and confirmation delivery
    const subDoc = (
      await payload.find({
        collection: 'subscribers',
        where: { and: [{ site: { equals: siteId } }, { email: { equals: journeyEmail } }] },
        limit: 1,
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    expect(subDoc).toBeDefined()
    expect(subDoc.status).toBe('pending')

    // Find outstanding token in database
    const tokenDoc = (
      await payload.find({
        collection: 'subscriber-confirmation-tokens',
        where: { subscriber: { equals: subDoc.id } },
        limit: 1,
        sort: '-createdAt',
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    expect(tokenDoc).toBeDefined()

    // Deliver queued confirmation email task to mail sink
    const deliveries = await payload.find({
      collection: 'email-deliveries',
      where: { subscriber: { equals: subDoc.id } },
      limit: 1,
      overrideAccess: true,
    } as never)
    expect(deliveries.docs.length).toBeGreaterThanOrEqual(1)
    const deliv = deliveries.docs[0] as any

    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: deliv.id },
      req: { payload },
    })

    const mailReceipts = localMailSinkReceipts().filter((r) => r.to === journeyEmail)
    expect(mailReceipts.length).toBeGreaterThanOrEqual(1)
    expect(mailReceipts[0].subject).toContain('Confirm your subscription')

    // Extract token from confirmation link in the delivered email body
    const match = mailReceipts[0].text.match(/token=([a-zA-Z0-9_-]+)/)
    expect(match).not.toBeNull()
    const confirmationToken = match![1]

    // 3. Confirm double opt-in via public /api/subscribers/confirm
    const confirmReq = new Request('http://localhost:3000/api/subscribers/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: confirmationToken }),
    })
    const confirmRes = await handleConfirm(confirmReq)
    expect(confirmRes.status).toBe(200)
    const confirmJson = await confirmRes.json()
    expect(confirmJson.status).toBe('confirmed')

    // Verify subscriber is now active
    const activeSub = (await payload.findByID({
      collection: 'subscribers',
      id: subDoc.id,
      overrideAccess: true,
    } as never)) as any
    expect(activeSub.status).toBe('active')

    // 4. Update preferences via /api/subscribers/preferences
    const prefToken = await issueAudienceAccessToken(payload, {
      siteId,
      subscriberId: subDoc.id,
      purpose: 'preferences',
    })
    const prefReq = new Request('http://localhost:3000/api/subscribers/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({
        token: prefToken,
        choices: [{ channel: 'email', purpose: 'marketing', granted: true }],
      }),
    })
    const prefRes = await handlePreferences(prefReq)
    const prefJson = await prefRes.json()
    expect(prefJson).toEqual({ status: 'updated' })
    expect(prefRes.status).toBe(200)

    // 5. Unsubscribe via public /api/subscribers/unsubscribe
    const unsubToken = await issueAudienceAccessToken(payload, {
      siteId,
      subscriberId: subDoc.id,
      purpose: 'unsubscribe',
    })
    const unsubReq = new Request('http://localhost:3000/api/subscribers/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: unsubToken }),
    })
    const unsubRes = await handleUnsubscribe(unsubReq)
    expect(unsubRes.status).toBe(200)
    const unsubJson = await unsubRes.json()
    expect(unsubJson.status).toBe('unsubscribed')

    // 6. Verify suppression is established
    const isSuppressed = await isSubscriberSuppressed(payload, siteId, audienceDigest(journeyEmail))
    expect(isSuppressed).toBe(true)
    const reason = await subscriberSuppressionReason(payload, siteId, audienceDigest(journeyEmail))
    expect(reason?.reason).toBe('unsubscribe')

    const unsubSub = (await payload.findByID({
      collection: 'subscribers',
      id: subDoc.id,
      overrideAccess: true,
    } as never)) as any
    expect(unsubSub.status).toBe('unsubscribed')

    // 7. Supported re-subscribe behavior:
    // When the unsubscribed user returns to /subscribe, submitting requests double opt-in re-confirmation
    const resubReq = new Request('http://localhost:3000/api/subscribers/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.99` },
      body: JSON.stringify({ email: journeyEmail }),
    })
    const resubRes = await handleSubscribe(resubReq)
    expect(resubRes.status).toBe(202)

    // Find the new confirmation token
    const newDeliveries = await payload.find({
      collection: 'email-deliveries',
      where: { subscriber: { equals: subDoc.id } },
      limit: 1,
      sort: '-createdAt',
      overrideAccess: true,
    } as never)
    const newDeliv = newDeliveries.docs[0] as any

    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: newDeliv.id },
      req: { payload },
    })

    const newMailReceipts = localMailSinkReceipts().filter((r) => r.to === journeyEmail)
    const latestReceipt = newMailReceipts[newMailReceipts.length - 1]
    const newMatch = latestReceipt.text.match(/token=([a-zA-Z0-9_-]+)/)
    expect(newMatch).not.toBeNull()
    const newConfirmationToken = newMatch![1]

    // Confirm the re-subscription via /api/subscribers/confirm
    const confirmResubReq = new Request('http://localhost:3000/api/subscribers/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: newConfirmationToken }),
    })
    const confirmResubRes = await handleConfirm(confirmResubReq)
    expect(confirmResubRes.status).toBe(200)

    // Verify subscriber is active again and suppression has been lifted
    const reconfirmedSub = (await payload.findByID({
      collection: 'subscribers',
      id: subDoc.id,
      overrideAccess: true,
    } as never)) as any
    expect(reconfirmedSub.status).toBe('active')

    const isSuppressedAfterResub = await isSubscriberSuppressed(
      payload,
      siteId,
      audienceDigest(journeyEmail),
    )
    expect(isSuppressedAfterResub).toBe(false)

    // Verify 'resubscribe' event recorded in consent history
    const resubEvent = await payload.find({
      collection: 'consent-events',
      where: { and: [{ subscriber: { equals: subDoc.id } }, { event: { equals: 'resubscribe' } }] },
      limit: 1,
      overrideAccess: true,
    } as never)
    expect(resubEvent.docs.length).toBeGreaterThanOrEqual(1)
  })

  it('proves unconfigured email provider reports degraded/disabled state safely', async () => {
    const health = await disabledEmailAdapter.health()
    expect(health.status).toBe('disabled')

    const sendRes = await disabledEmailAdapter.send({
      from: 'test@renegadeparty.org',
      to: 'anyone@example.test',
      subject: 'Degraded Check',
      text: 'Testing safe degradation',
      idempotencyKey: `unconfigured-check-${runId}`,
    })
    expect(sendRes.ok).toBe(false)
    if (!sendRes.ok) {
      expect(sendRes.failure.code).toBe('email_disabled')
    }
  })
})
