/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-19 — Audience growth and measured optimization: ONE campaign
 * fixture proving the full journey on real Postgres across areas
 * #29–#36 (with #27 re-evidenced by the RC3-16 suites in the same
 * gauntlet):
 *
 *   permissioned signup form → confirm → automation → landing
 *   conversion → segment → analytics readback → unsubscribe
 *
 * plus privacy-aware personalization fed by real segment membership
 * (#35), an experiment assigned and measured on synthetic visits
 * (#36), a cross-site attribution negative (#34), and the SMS
 * consent → emulator handoff → STOP opt-out chain (#31).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { POST as handleConsent } from '../../src/app/(frontend)/api/analytics/consent/route'
import { POST as handleCollect } from '../../src/app/(frontend)/api/analytics/collect/route'
import { POST as handleForm } from '../../src/app/(frontend)/api/forms/[formId]/route'
import { POST as handleSubscribe } from '../../src/app/(frontend)/api/subscribers/subscribe/route'
import { POST as handleConfirm } from '../../src/app/(frontend)/api/subscribers/confirm/route'
import { POST as handleUnsubscribe } from '../../src/app/(frontend)/api/subscribers/unsubscribe/route'
import {
  createRecipientSnapshot,
  evaluateSegmentRecipients,
  isSubscriberSuppressed,
  issueAudienceAccessToken,
  queueNewsletterDeliveries,
} from '../../src/modules/audience/service'
import { audienceDigest } from '../../src/modules/audience/contracts'
import { segmentVersion, type SegmentNode } from '../../src/modules/audience/engine'
import {
  resumeDueAutomationRuns,
  triggerAutomations,
} from '../../src/modules/audience/automation-executor'
import { emailDeliveryTask } from '../../src/modules/audience/tasks'
import { formIntakeTask } from '../../src/modules/audience/form-tasks'
import { localMailSinkReceipts, resetLocalMailSink } from '../../src/modules/email/delivery'
import { loadOperatorReport, reportWindow } from '../../src/modules/analytics/operator-report'
import {
  createExperiencesRuntimeService,
  type ExperienceDefinition,
} from '../../src/modules/experiences/service'
import { resolveSegmentExperience } from '../../src/modules/experiences/segment-personalization'
import {
  hasTelecomConsent,
  processInboundTelecomMessage,
  queueTelecomCampaignDeliveries,
} from '../../src/modules/telecom/service'
import { telecomDigest } from '../../src/modules/telecom/contracts'
import { getTelecomEmulatorReceipts } from '../../src/modules/telecom/emulator'
import { telecomDeliveryTask } from '../../src/modules/telecom/tasks'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'

type Doc = Record<string, any>

process.env.EMAIL_MODE = 'development'
process.env.TELECOM_MODE = 'emulator'

const suffix = Math.random().toString(36).slice(2, 8)
const HOST_A = `a-${suffix}.rc319.test`
const HOST_B = `b-${suffix}.rc319.test`
const ORIGIN_A = `http://${HOST_A}`
const ORIGIN_B = `http://${HOST_B}`
const CAMPAIGN = `rc319-launch-${suffix}`
const LANDING_PATH = '/join-rc319'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)'

const subEmail = `campaign-sub-${suffix}@example.test`
const leadEmail = `campaign-lead-${suffix}@example.test`
const otherEmail = `campaign-other-${suffix}@example.test`
// Run-unique line: a STOP suppression is keyed by phone hash and would
// otherwise leak into the next run's consent check.
const PHONE = `+1212555${String(Math.floor(1000 + Math.random() * 9000))}`

let payload: Payload
let siteA = ''
let siteB = ''
let publicationA = ''
let listA = ''
let formA = ''
let formB = ''
let welcomeMessageId = ''
let welcomeDefId = ''
let delayedDefId = ''
let unapprovedDefId = ''
let foreignDefId = ''
let segmentId = ''
let subscriberId = ''
let contactId = ''
let actorUserId = ''
let otherSubscriberId = ''
let otherContactId = ''
let savedOrigins: unknown
let savedPrivacy: unknown
let cookieA1 = ''
let cookieA2 = ''

const relId = (value: any): string =>
  value && typeof value === 'object' ? String(value.id) : String(value)

async function grantConsent(host: string, siteId: string): Promise<string> {
  const res = await handleConsent(
    new Request(`http://${host}/api/analytics/consent`, {
      method: 'POST',
      headers: {
        host,
        origin: `http://${host}`,
        'content-type': 'application/json',
        'user-agent': UA,
      },
      body: JSON.stringify({ siteId, choices: { analytics: true, personalization: true } }),
    }),
  )
  const cookie = res.headers.get('set-cookie') ?? ''
  expect(cookie).toContain('renegade-consent=')
  return cookie.split(';')[0]
}

async function collectView(host: string, siteId: string, cookie: string, id: string) {
  return handleCollect(
    new Request(`http://${host}/api/analytics/collect`, {
      method: 'POST',
      headers: {
        host,
        origin: `http://${host}`,
        cookie,
        'content-type': 'application/json',
        'user-agent': UA,
      },
      body: JSON.stringify({
        id,
        siteId,
        eventType: 'page_view',
        path: `${LANDING_PATH}?utm_campaign=${CAMPAIGN}&utm_medium=email`,
        occurredAt: new Date().toISOString(),
      }),
    }),
  )
}

async function submitForm(
  host: string,
  formId: string,
  cookie: string,
  email: string,
  keyLabel: string,
) {
  return handleForm(
    new Request(`http://${host}/api/forms/${formId}`, {
      method: 'POST',
      headers: {
        host,
        origin: `http://${host}`,
        cookie,
        'content-type': 'application/json',
        'user-agent': UA,
      },
      body: JSON.stringify({
        values: { email, full_name: 'Campaign Person', consent: true },
        idempotencyKey: `rc319-form-${keyLabel}-${suffix}-submission`,
      }),
    }),
    { params: Promise.resolve({ formId }) },
  )
}

async function runEmailDelivery(deliveryId: string) {
  await (emailDeliveryTask.handler as any)({ input: { deliveryId }, req: { payload } })
}

async function findOne(collection: string, where: any) {
  const found = await payload.find({
    collection: collection as never,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return (found as any).docs[0] as any
}

async function makeForm(siteId: string, label: string): Promise<string> {
  const definition = (await payload.create({
    collection: 'form-definitions',
    data: {
      site: siteId,
      name: `RC319 signup ${label} ${suffix}`,
      title: 'Join the campaign',
      template: 'newsletter-signup',
      publicPath: `/forms/rc319-${label}-${suffix}`,
      visibility: 'public',
      settings: { allowedEmbedOrigins: [ORIGIN_A, ORIGIN_B] },
      actions: [
        { type: 'create-contact', emailField: 'email', nameField: 'full_name' },
        { type: 'create-task', title: 'RC319 lead follow-up', priority: 'normal' },
      ],
    },
    overrideAccess: true,
  } as never)) as any
  const snapshot = {
    version: 1,
    locale: 'en',
    consentText: 'I consent to receive campaign updates.',
    consentRevision: '2026.1',
    fields: [
      {
        key: 'email',
        type: 'email',
        label: 'Email Address',
        required: true,
        validation: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
      },
      { key: 'full_name', type: 'text', label: 'Full Name', required: false },
      { key: 'consent', type: 'checkbox', label: 'Consent', required: true },
    ],
  }
  const schema = (await payload.create({
    collection: 'form-schemas',
    data: {
      site: siteId,
      form: definition.id,
      version: 1,
      state: 'published',
      locale: 'en',
      consentText: snapshot.consentText,
      consentRevision: snapshot.consentRevision,
      schema: snapshot,
    },
    overrideAccess: true,
  } as never)) as any
  await payload.update({
    collection: 'form-definitions',
    id: definition.id,
    data: { activeSchema: schema.id },
    overrideAccess: true,
  } as never)
  return String(definition.id)
}

async function subscribeAndConfirm(email: string): Promise<string> {
  const res = await handleSubscribe(
    new Request(`${ORIGIN_A}/api/subscribers/subscribe`, {
      method: 'POST',
      headers: { host: HOST_A, 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ email, siteId: siteA, listId: listA }),
    }),
  )
  expect(res.status).toBe(202)
  const subscriber = await findOne('subscribers', {
    and: [{ site: { equals: siteA } }, { email: { equals: email } }],
  })
  expect(subscriber).toBeTruthy()
  const delivery = await findOne('email-deliveries', {
    subscriber: { equals: subscriber.id },
  })
  expect(delivery).toBeTruthy()
  await runEmailDelivery(String(delivery.id))
  const receipt = localMailSinkReceipts().find(
    (entry) => entry.to === email && entry.subject.includes('Confirm'),
  )
  expect(receipt).toBeTruthy()
  const token = receipt!.text.match(/token=([a-zA-Z0-9_-]+)/)![1]
  const confirmRes = await handleConfirm(
    new Request(`${ORIGIN_A}/api/subscribers/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  )
  expect(confirmRes.status).toBe(200)
  return String(subscriber.id)
}

beforeAll(async () => {
  payload = await getPayload({ config })
  const demo = await ensureRenegadePartyDemo(payload)
  siteA = demo.siteId
  actorUserId = demo.userId
  publicationA = demo.publicationId

  const siteBDoc = (await payload.create({
    collection: 'sites',
    data: {
      name: `RC319 other ${suffix}`,
      slug: `rc319-other-${suffix}`,
      domain: HOST_B,
      status: 'published',
    },
    overrideAccess: true,
  } as never)) as any
  siteB = String(siteBDoc.id)

  const settings = (await payload.findGlobal({
    slug: 'site-settings',
    overrideAccess: true,
  })) as any
  savedOrigins = settings.canonicalOriginsBySite
  savedPrivacy = settings.privacy
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOriginsBySite: {
        ...((savedOrigins as Record<string, string>) ?? {}),
        [siteA]: ORIGIN_A,
        [siteB]: ORIGIN_B,
      },
      // The operator switch for first-party analytics: collection is
      // disabled by default policy, a measured campaign turns it on.
      privacy: { ...((savedPrivacy as Record<string, unknown>) ?? {}), analyticsEnabled: true },
    },
    overrideAccess: true,
  } as never)

  resetLocalMailSink()

  const list = (await payload.create({
    collection: 'audience-lists',
    data: { site: siteA, name: `RC319 campaign ${suffix}`, status: 'active', doubleOptIn: true },
    overrideAccess: true,
  } as never)) as any
  listA = String(list.id)

  // The published landing page the campaign points at (#33 surface).
  const author = await findOne('authors', { slug: { equals: 'renegade-founder' } })
  const landing = (await payload.create({
    collection: 'content',
    data: {
      site: siteA,
      publication: publicationA,
      authors: [{ author: author.id, displayOrder: 0, role: 'Author' }],
      title: 'Join the RC319 campaign',
      slug: `join-rc319-${suffix}`,
      contentType: 'page',
      pageTemplate: 'landing',
      status: 'published',
      excerpt: 'The RC3-19 campaign landing page.',
      body: [{ type: 'paragraph', text: 'One campaign, measured end to end.' }],
    },
    overrideAccess: true,
  } as never)) as any
  expect(landing.id).toBeTruthy()

  formA = await makeForm(siteA, 'a')
  formB = await makeForm(siteB, 'b')

  // The approved welcome message the automation sends (#30 vocabulary).
  const welcome = (await payload.create({
    collection: 'email-messages',
    data: {
      site: siteA,
      subject: 'Welcome to the RC319 campaign',
      purpose: 'newsletter',
      channel: 'email',
      language: 'en',
      kind: 'bulk',
      status: 'draft',
      blocks: [{ type: 'text', text: 'Welcome aboard.' }],
      audience: { lists: [listA] },
    },
    overrideAccess: true,
  } as never)) as any
  welcomeMessageId = String(welcome.id)
  // Canonical review flow: draft → review → scheduled (the collection
  // hook stamps reviewedAt on the scheduling transition).
  await payload.update({
    collection: 'email-messages',
    id: welcome.id,
    data: { status: 'review' },
    overrideAccess: true,
  } as never)
  await payload.update({
    collection: 'email-messages',
    id: welcome.id,
    data: { status: 'scheduled', scheduledFor: new Date(Date.now() - 1000).toISOString() },
    overrideAccess: true,
  } as never)

  const definition = async (data: Record<string, unknown>) =>
    (await payload.create({
      collection: 'automation-definitions',
      data: { version: '1', reentryPolicy: 'never', ...data },
      overrideAccess: true,
    } as never)) as any
  const now = new Date().toISOString()
  // D1: the welcome automation — tag, approved send, follow-up task.
  welcomeDefId = String(
    (
      await definition({
        site: siteA,
        name: `RC319 welcome ${suffix}`,
        status: 'active',
        approvedAt: now,
        trigger: { type: 'confirmed-subscription' },
        actions: [
          { type: 'add-tag', tag: `rc319-welcomed-${suffix}` },
          { type: 'send-approved-message', messageId: welcomeMessageId },
          { type: 'create-task', title: 'RC319 welcome follow-up', priority: 'normal' },
        ],
      })
    ).id,
  )
  // D2: a zero-second delay parks the run for the resume sweep.
  delayedDefId = String(
    (
      await definition({
        site: siteA,
        name: `RC319 delayed tag ${suffix}`,
        status: 'active',
        approvedAt: now,
        trigger: { type: 'confirmed-subscription' },
        actions: [
          { type: 'delay', minutes: 0 },
          { type: 'add-tag', tag: `rc319-delayed-${suffix}` },
        ],
      })
    ).id,
  )
  // D3: never approved — must never execute.
  unapprovedDefId = String(
    (
      await definition({
        site: siteA,
        name: `RC319 unapproved ${suffix}`,
        status: 'review',
        trigger: { type: 'confirmed-subscription' },
        actions: [{ type: 'add-tag', tag: `rc319-never-${suffix}` }],
      })
    ).id,
  )
  // A foreign site's definition must never fire for this site's event.
  foreignDefId = String(
    (
      await definition({
        site: siteB,
        name: `RC319 foreign ${suffix}`,
        status: 'active',
        approvedAt: now,
        trigger: { type: 'confirmed-subscription' },
        actions: [{ type: 'add-tag', tag: `rc319-foreign-${suffix}` }],
      })
    ).id,
  )
}, 180_000)

afterAll(async () => {
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOriginsBySite: savedOrigins ?? {},
      privacy: (savedPrivacy as Record<string, unknown>) ?? {},
    },
    overrideAccess: true,
  } as never)
})

describe('RC3-19 campaign journey', () => {
  it('runs signup form → confirm → automation on real Postgres (#29/#30/#32)', async () => {
    // Two consented visitors land on the campaign page (#33/#34 touches).
    cookieA1 = await grantConsent(HOST_A, siteA)
    cookieA2 = await grantConsent(HOST_A, siteA)
    const view1 = await collectView(HOST_A, siteA, cookieA1, `rc319-view-1-${suffix}`)
    expect(view1.status).toBe(201)
    expect((await view1.json()).accepted).toBe(true)
    const view2 = await collectView(HOST_A, siteA, cookieA2, `rc319-view-2-${suffix}`)
    expect(view2.status).toBe(201)

    // The permissioned signup form converts visitor 1 (#32 + #34 event).
    const formRes = await submitForm(HOST_A, formA, cookieA1, leadEmail, 'a')
    expect(formRes.status).toBe(201)
    const submission = await findOne('form-submissions', {
      and: [{ site: { equals: siteA } }, { form: { equals: formA } }],
    })
    expect(submission).toBeTruthy()
    await (formIntakeTask.handler as any)({
      input: { submissionId: String(submission.id) },
      req: { payload },
    })
    const triaged = await payload.findByID({
      collection: 'form-submissions',
      id: submission.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect((triaged as any).status).toBe('triaged')
    const leadContact = await findOne('contacts', {
      and: [{ site: { equals: siteA } }, { emailHash: { equals: audienceDigest(leadEmail) } }],
    })
    expect(leadContact).toBeTruthy()
    const leadTask = await findOne('workflow-items', {
      and: [{ site: { equals: siteA } }, { title: { equals: 'RC319 lead follow-up' } }],
    })
    expect(leadTask).toBeTruthy()

    // Subscribe → confirmation email in the local sink → confirm route.
    subscriberId = await subscribeAndConfirm(subEmail)
    const subscriber = (await payload.findByID({
      collection: 'subscribers',
      id: subscriberId,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(subscriber.status).toBe('active')
    contactId = relId(subscriber.contact)
    expect(contactId).toBeTruthy()

    // #30: the welcome automation executed end to end.
    const runs = await payload.find({
      collection: 'automation-runs',
      where: { definition: { in: [welcomeDefId, delayedDefId, unapprovedDefId] } },
      limit: 20,
      depth: 1,
      overrideAccess: true,
    } as never)
    const byName = new Map<string, any>(
      (runs as any).docs.map((run: any) => [String(run.definition?.name ?? ''), run]),
    )
    const welcome = byName.get(`RC319 welcome ${suffix}`)
    expect(welcome?.status).toBe('completed')
    expect(welcome.outcome.steps.map((step: any) => step.result)).toEqual([
      'added',
      'queued',
      'created',
    ])
    // The delayed automation parked on its delay step, then the resume
    // sweep (the mounted scheduled task's handler core) finished it.
    const delayed = byName.get(`RC319 delayed tag ${suffix}`)
    expect(delayed?.status).toBe('paused')
    await resumeDueAutomationRuns(payload)
    const delayedAfter = (await payload.findByID({
      collection: 'automation-runs',
      id: delayed.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(delayedAfter.status).toBe('completed')
    // The unapproved definition and the foreign site's definition ran never.
    expect(byName.has(`RC319 unapproved ${suffix}`)).toBe(false)
    const foreignRuns = await payload.find({
      collection: 'automation-runs',
      where: { definition: { equals: foreignDefId } },
      limit: 5,
      overrideAccess: true,
    } as never)
    expect((foreignRuns as any).docs).toHaveLength(0)

    // Tags landed on the subscriber's contact; the welcome message was
    // delivered through the real delivery task into the local sink.
    const tagNames = async () => {
      const taggings = await payload.find({
        collection: 'contact-taggings',
        where: { contact: { equals: contactId } },
        limit: 20,
        depth: 1,
        overrideAccess: true,
      } as never)
      return (taggings as any).docs.map((tagging: any) => String(tagging.tag?.name))
    }
    expect(await tagNames()).toEqual(
      expect.arrayContaining([`rc319-welcomed-${suffix}`, `rc319-delayed-${suffix}`]),
    )
    expect(await tagNames()).not.toContain(`rc319-never-${suffix}`)
    expect(await tagNames()).not.toContain(`rc319-foreign-${suffix}`)
    const welcomeDelivery = await findOne('email-deliveries', {
      and: [{ message: { equals: welcomeMessageId } }, { subscriber: { equals: subscriberId } }],
    })
    expect(welcomeDelivery).toBeTruthy()
    await runEmailDelivery(String(welcomeDelivery.id))
    expect(
      localMailSinkReceipts().some(
        (entry) => entry.to === subEmail && entry.subject === 'Welcome to the RC319 campaign',
      ),
    ).toBe(true)
    const followUp = await findOne('workflow-items', {
      and: [{ site: { equals: siteA } }, { title: { equals: 'RC319 welcome follow-up' } }],
    })
    expect(followUp).toBeTruthy()

    // Re-firing the same confirmation event never duplicates the run.
    const before = (runs as any).docs.length
    await triggerAutomations(payload, {
      siteId: siteA,
      triggerType: 'confirmed-subscription',
      subscriberId,
      sourceEventId: `subscriber:${subscriberId}`,
    })
    const after = await payload.find({
      collection: 'automation-runs',
      where: { definition: { in: [welcomeDefId, delayedDefId, unapprovedDefId] } },
      limit: 20,
      overrideAccess: true,
    } as never)
    expect((after as any).docs.length).toBe(before)
  }, 120_000)

  it('segments the automated audience and reads the campaign back (#29/#33/#34)', async () => {
    // Segment on the tag the automation itself applied (#34 audience).
    const tag = await findOne('contact-tags', {
      and: [{ site: { equals: siteA } }, { name: { equals: `rc319-welcomed-${suffix}` } }],
    })
    const rules: SegmentNode = { predicate: { field: 'tag', op: 'is', value: String(tag.id) } }
    const segment = (await payload.create({
      collection: 'audience-segments',
      data: {
        site: siteA,
        name: `RC319 welcomed ${suffix}`,
        definition: rules,
        version: segmentVersion(rules),
        status: 'active',
      },
      overrideAccess: true,
    } as never)) as any
    segmentId = String(segment.id)

    const evaluation = await evaluateSegmentRecipients(payload, {
      siteId: siteA,
      segmentId,
    })
    expect(evaluation.eligibleRecipients.map((r) => r.subscriberId)).toContain(subscriberId)

    // The segment campaign sends through the canonical review flow and
    // lands in the local mail sink (#29 held at E2: local sink only).
    const campaign = (await payload.create({
      collection: 'email-messages',
      data: {
        site: siteA,
        subject: 'RC319 segment campaign',
        purpose: 'newsletter',
        channel: 'email',
        language: 'en',
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'For welcomed readers.' }],
      },
      overrideAccess: true,
    } as never)) as any
    await payload.update({
      collection: 'email-messages',
      id: campaign.id,
      data: { status: 'review', audience: { segments: [segmentId] } },
      overrideAccess: true,
    } as never)
    const snapshot = await createRecipientSnapshot(payload, {
      siteId: siteA,
      messageId: String(campaign.id),
      segmentId,
      actorUserId,
    })
    expect((snapshot as any).recipients.map((r: any) => r.subscriberId)).toEqual([subscriberId])
    await payload.update({
      collection: 'email-messages',
      id: campaign.id,
      data: {
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - 2000).toISOString(),
        cancelCutoffAt: new Date(Date.now() - 1000).toISOString(),
        recipientSnapshot: (snapshot as any).id,
      },
      overrideAccess: true,
    } as never)
    expect(await queueNewsletterDeliveries(payload, String(campaign.id))).toBe(1)
    const delivery = await findOne('email-deliveries', {
      and: [{ message: { equals: campaign.id } }, { subscriber: { equals: subscriberId } }],
    })
    await runEmailDelivery(String(delivery.id))
    expect(
      localMailSinkReceipts().some(
        (entry) => entry.to === subEmail && entry.subject === 'RC319 segment campaign',
      ),
    ).toBe(true)

    // Analytics readback: the operator report attributes the form
    // conversion to the campaign the same subject touched (#33/#34).
    // A fresh window per read: the window's end is fixed at creation,
    // and later activity must fall inside it.
    const funnelOf = (report: any) =>
      report.campaignFunnels.find((funnel: any) => funnel.campaign === CAMPAIGN)
    const reportA1 = await loadOperatorReport(payload, siteA, reportWindow(new URLSearchParams()))
    expect(funnelOf(reportA1)).toMatchObject({ landings: 2, conversions: 1, convertedSubjects: 1 })

    // Cross-site negative: identical campaign activity on site B moves
    // site B's funnel only — site A's numbers do not change (#34).
    const cookieB = await grantConsent(HOST_B, siteB)
    const viewB = await collectView(HOST_B, siteB, cookieB, `rc319-view-b-${suffix}`)
    expect(viewB.status).toBe(201)
    const formResB = await submitForm(HOST_B, formB, cookieB, `lead-b-${suffix}@example.test`, 'b')
    expect(formResB.status).toBe(201)
    const reportB = await loadOperatorReport(payload, siteB, reportWindow(new URLSearchParams()))
    expect(funnelOf(reportB)).toMatchObject({ landings: 1, conversions: 1 })
    const reportA2 = await loadOperatorReport(payload, siteA, reportWindow(new URLSearchParams()))
    expect(funnelOf(reportA2)).toMatchObject({ landings: 2, conversions: 1, convertedSubjects: 1 })

    // Unconsented collection is refused and persists nothing.
    const eventsBefore = await payload.find({
      collection: 'analytics-events',
      where: { site: { equals: siteA } },
      limit: 500,
      overrideAccess: true,
    } as never)
    const refused = await handleCollect(
      new Request(`${ORIGIN_A}/api/analytics/collect`, {
        method: 'POST',
        headers: {
          host: HOST_A,
          origin: ORIGIN_A,
          'content-type': 'application/json',
          'user-agent': UA,
        },
        body: JSON.stringify({
          id: `rc319-view-refused-${suffix}`,
          siteId: siteA,
          eventType: 'page_view',
          path: `${LANDING_PATH}?utm_campaign=${CAMPAIGN}`,
          occurredAt: new Date().toISOString(),
        }),
      }),
    )
    expect(refused.status).toBe(202)
    expect((await refused.json()).accepted).toBe(false)
    const eventsAfter = await payload.find({
      collection: 'analytics-events',
      where: { site: { equals: siteA } },
      limit: 500,
      overrideAccess: true,
    } as never)
    expect((eventsAfter as any).docs.length).toBe((eventsBefore as any).docs.length)
  }, 120_000)

  it('personalizes from real segment membership and stops at opt-out (#35)', async () => {
    const runtime = createExperiencesRuntimeService(payload)
    const experiment: ExperienceDefinition = {
      id: `rc319-pers-${suffix}`,
      siteId: siteA,
      state: 'running',
      assignmentSalt: 'rc319-pers',
      collectionEnabled: true,
      conditions: [{ input: 'consented-segment', equals: segmentId }],
      variants: [
        {
          id: 'control',
          allocation: 0,
          isControl: true,
          registeredComponent: 'publisher.newsletter-cta',
        },
        { id: 'treatment', allocation: 100, registeredComponent: 'publisher.cta' },
      ],
    }
    const privacy = {
      analyticsConsent: true,
      personalizationConsent: true,
      capabilityEnabled: true,
    }
    // Member → the treatment component.
    const member = await resolveSegmentExperience(payload, runtime, {
      siteId: siteA,
      segmentId,
      subscriberId,
      experiment,
      privacy,
    })
    expect(member.membership.member).toBe(true)
    expect(member.resolution.eligible).toBe(true)
    expect(member.resolution.component).toBe('publisher.cta')

    // A confirmed subscriber outside the segment → default resolution.
    const otherId = await subscribeAndConfirm(otherEmail)
    otherSubscriberId = otherId
    {
      const welcomedTag = await findOne('contact-tags', {
        and: [{ site: { equals: siteA } }, { name: { equals: `rc319-welcomed-${suffix}` } }],
      })
      const otherDocPre = (await payload.findByID({
        collection: 'subscribers',
        id: otherId,
        depth: 0,
        overrideAccess: true,
      } as never)) as any
      const stray = await payload.find({
        collection: 'contact-taggings',
        where: {
          and: [
            { contact: { equals: relId(otherDocPre.contact) } },
            { tag: { equals: welcomedTag.id } },
          ],
        },
        limit: 5,
        overrideAccess: true,
      } as never)
      for (const tagging of (stray as any).docs)
        await payload.delete({
          collection: 'contact-taggings',
          id: tagging.id,
          overrideAccess: true,
        } as never)
    }
    const otherDoc = (await payload.findByID({
      collection: 'subscribers',
      id: otherId,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    otherContactId = relId(otherDoc.contact)
    const outsider = await resolveSegmentExperience(payload, runtime, {
      siteId: siteA,
      segmentId,
      subscriberId: otherId,
      experiment,
      privacy,
    })
    expect(outsider.membership).toMatchObject({ member: false, reason: 'not-eligible' })
    expect(outsider.resolution.eligible).toBe(false)
    expect(outsider.resolution.reason).toBe('audience-mismatch')
    expect(outsider.resolution.component).toBe('publisher.newsletter-cta')

    // Another site's segment can never personalize this site.
    const foreignRules: SegmentNode = { predicate: { field: 'locale', op: 'is', value: 'en' } }
    const foreignSegment = (await payload.create({
      collection: 'audience-segments',
      data: {
        site: siteB,
        name: `RC319 foreign segment ${suffix}`,
        definition: foreignRules,
        version: segmentVersion(foreignRules),
        status: 'active',
      },
      overrideAccess: true,
    } as never)) as any
    const foreign = await resolveSegmentExperience(payload, runtime, {
      siteId: siteA,
      segmentId: String(foreignSegment.id),
      subscriberId,
      experiment,
      privacy,
    })
    expect(foreign.membership).toMatchObject({ member: false, reason: 'segment-site-mismatch' })
    expect(foreign.resolution.component).toBe('publisher.newsletter-cta')

    // Without personalization consent the runtime's privacy gate wins.
    const noConsent = await resolveSegmentExperience(payload, runtime, {
      siteId: siteA,
      segmentId,
      subscriberId,
      experiment,
      privacy: { ...privacy, personalizationConsent: false },
    })
    expect(noConsent.resolution.reason).toBe('privacy-control')
    expect(noConsent.resolution.component).toBe('publisher.newsletter-cta')

    // Unsubscribe: suppression ends eligibility, so personalization
    // stops with no separate opt-out plumbing (#35 + journey close).
    const token = await issueAudienceAccessToken(payload, {
      siteId: siteA,
      subscriberId,
      purpose: 'unsubscribe',
    })
    const unsubRes = await handleUnsubscribe(
      new Request(`${ORIGIN_A}/api/subscribers/unsubscribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    )
    expect(unsubRes.status).toBe(200)
    expect(await isSubscriberSuppressed(payload, siteA, audienceDigest(subEmail))).toBe(true)
    const afterOptOut = await resolveSegmentExperience(payload, runtime, {
      siteId: siteA,
      segmentId,
      subscriberId,
      experiment,
      privacy,
    })
    expect(afterOptOut.membership.member).toBe(false)
    expect(afterOptOut.resolution.component).toBe('publisher.newsletter-cta')

    // And the next segment send produces no delivery for them (#29).
    const second = (await payload.create({
      collection: 'email-messages',
      data: {
        site: siteA,
        subject: 'RC319 post-unsubscribe campaign',
        purpose: 'newsletter',
        channel: 'email',
        language: 'en',
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Should not arrive.' }],
      },
      overrideAccess: true,
    } as never)) as any
    await payload.update({
      collection: 'email-messages',
      id: second.id,
      data: { status: 'review', audience: { segments: [segmentId] } },
      overrideAccess: true,
    } as never)
    const secondSnapshot = await createRecipientSnapshot(payload, {
      siteId: siteA,
      messageId: String(second.id),
      segmentId,
      actorUserId,
    })
    expect((secondSnapshot as any).recipients).toEqual([])
    await payload.update({
      collection: 'email-messages',
      id: second.id,
      data: {
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - 2000).toISOString(),
        cancelCutoffAt: new Date(Date.now() - 1000).toISOString(),
        recipientSnapshot: (secondSnapshot as any).id,
      },
      overrideAccess: true,
    } as never)
    expect(await queueNewsletterDeliveries(payload, String(second.id))).toBe(0)
  }, 120_000)

  it('assigns and measures an experiment on synthetic visits (#36)', async () => {
    const runtime = createExperiencesRuntimeService(payload)
    const experiment: ExperienceDefinition = {
      id: `rc319-exp-${suffix}`,
      siteId: siteA,
      state: 'running',
      assignmentSalt: 'rc319-exp',
      collectionEnabled: true,
      conditions: [],
      variants: [
        {
          id: 'control',
          allocation: 50,
          isControl: true,
          registeredComponent: 'publisher.newsletter-cta',
        },
        { id: 'treatment', allocation: 50, registeredComponent: 'publisher.cta' },
      ],
    }
    const privacy = {
      analyticsConsent: true,
      personalizationConsent: true,
      capabilityEnabled: true,
    }
    const nowIso = () => new Date().toISOString()
    const assigned = new Map<string, string>()
    for (let index = 0; index < 40; index += 1) {
      const subject = `visitor-${index}`
      const resolution = runtime.resolve(experiment, {
        subject: { kind: 'first-party-cookie', value: subject },
        privacy,
      })
      expect(resolution.eligible).toBe(true)
      assigned.set(subject, resolution.assignment.variantId)
      await runtime.recordExposure({ experiment, resolution, privacy, occurredAt: nowIso() })
      // Deterministic: the same subject always lands in the same variant.
      expect(
        runtime.resolve(experiment, {
          subject: { kind: 'first-party-cookie', value: subject },
          privacy,
        }).assignment.variantId,
      ).toBe(resolution.assignment.variantId)
    }
    const counts = { control: 0, treatment: 0 }
    for (const variant of assigned.values()) counts[variant as 'control' | 'treatment'] += 1
    expect(counts.control).toBeGreaterThanOrEqual(5)
    expect(counts.treatment).toBeGreaterThanOrEqual(5)

    const converters = [...assigned.entries()].filter(([, variant]) => variant === 'treatment')
    for (const [subject] of converters.slice(0, 3)) {
      const resolution = runtime.resolve(experiment, {
        subject: { kind: 'first-party-cookie', value: subject },
        privacy,
      })
      await runtime.recordConversion({
        experiment,
        resolution,
        privacy,
        goalKey: 'lead-contact-volunteer',
        occurredAt: nowIso(),
      })
    }
    // Readback comes from the persisted analytics events, not memory.
    const stored = await payload.find({
      collection: 'analytics-events',
      where: {
        and: [
          { site: { equals: siteA } },
          { eventType: { in: ['experiment_exposure', 'experiment_conversion'] } },
        ],
      },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    } as never)
    const events = (stored as any).docs
      .filter((row: any) => row.properties?.experimentId === experiment.id)
      .map((row: any) => ({
        eventType: row.eventType,
        context: { siteId: siteA },
        properties: row.properties,
      }))
    expect(events.length).toBe(43)
    const analysis = runtime.analyze(experiment, events as never)
    const treatment = analysis.results.find((variant) => variant.id === 'treatment')
    expect(treatment?.exposures).toBe(counts.treatment)
    expect(treatment?.conversions).toBe(3)
    const control = analysis.results.find((variant) => variant.id === 'control')
    expect(control?.exposures).toBe(counts.control)
    expect(control?.conversions).toBe(0)
  }, 120_000)

  it('proves SMS consent, emulator handoff and STOP opt-out (#31)', async () => {
    // Runs against the still-active second subscriber: the journey's
    // primary subscriber has already unsubscribed by this point.
    expect(otherSubscriberId).toBeTruthy()
    expect(otherContactId).toBeTruthy()
    // The recipient carries a timezone that is currently midday
    // somewhere on the globe: telecom quiet hours (21:00-08:00
    // recipient-local) would otherwise delay the delivery past the
    // end of this test at some times of day — the delay is the
    // product working as designed, so the fixture places the
    // recipient outside it deterministically.
    const middayZone = [
      'Pacific/Kiritimati',
      'Pacific/Auckland',
      'Australia/Sydney',
      'Asia/Tokyo',
      'Asia/Karachi',
      'Europe/London',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
    ].find((zone) => {
      const hour = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: zone,
          hour: 'numeric',
          hourCycle: 'h23',
        }).format(new Date()),
      )
      return hour >= 10 && hour <= 14
    })
    expect(middayZone).toBeTruthy()
    // Quiet hours resolve through the recipient's member profile
    // timeZone (subscribers carry no timezone of their own), so the
    // fixture gives the recipient a member + profile in that zone.
    const member = await payload.create({
      collection: 'members',
      data: {
        displayName: 'RC3-19 Telecom Recipient',
        email: `rc319-telecom-member-${suffix}@example.test`,
        status: 'active',
      },
      overrideAccess: true,
    } as never)
    await payload.create({
      collection: 'profiles',
      data: {
        member: (member as Doc).id,
        displayName: 'RC3-19 Telecom Recipient',
        handle: `rc319telecom${suffix.replace(/[^a-z0-9]/g, '')}`,
        timeZone: middayZone,
      },
      overrideAccess: true,
    } as never)
    await payload.update({
      collection: 'subscribers',
      id: otherSubscriberId,
      data: { member: (member as Doc).id },
      overrideAccess: true,
    } as never)
    await payload.update({
      collection: 'contacts',
      id: otherContactId,
      data: { phoneE164: PHONE },
      overrideAccess: true,
    } as never)
    await payload.create({
      collection: 'consent-events',
      data: {
        site: siteA,
        subscriber: otherSubscriberId,
        contact: otherContactId,
        channel: 'sms',
        purpose: 'marketing',
        event: 'preference-granted',
        basis: 'explicit-consent',
        occurredAt: new Date().toISOString(),
        evidence: { form: 'campaign-signup' },
      },
      overrideAccess: true,
    } as never)
    const consentInput = {
      siteId: siteA,
      subscriberId: otherSubscriberId,
      phoneHash: telecomDigest(PHONE),
      purpose: 'marketing',
    }
    expect(await hasTelecomConsent(payload, consentInput)).toBe(true)

    const message = (await payload.create({
      collection: 'telecom-messages',
      data: {
        site: siteA,
        title: `RC319 SMS ${suffix}`,
        body: 'RC319 campaign text',
        channel: 'sms',
        purpose: 'marketing',
        status: 'scheduled',
        audience: { lists: [listA] },
      },
      overrideAccess: true,
    } as never)) as any
    const queued = await queueTelecomCampaignDeliveries(payload, String(message.id))
    expect(queued.queuedCount).toBe(1)
    const delivery = await findOne('telecom-deliveries', {
      message: { equals: message.id },
    })
    expect(delivery).toBeTruthy()
    await (telecomDeliveryTask.handler as any)({
      input: { deliveryId: String(delivery.id) },
      req: { payload },
    })
    const delivered = (await payload.findByID({
      collection: 'telecom-deliveries',
      id: delivery.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    // The recorded provider is the emulator — simulated, never a
    // carrier — and the handoff receipt exists in the emulator.
    expect(delivered.status).toBe('accepted')
    expect(delivered.provider).toBe('telecom-emulator')
    expect(getTelecomEmulatorReceipts().some((r) => r.to === PHONE && r.channel === 'sms')).toBe(
      true,
    )

    // STOP ends consent and suppresses the number; nothing queues again.
    const stop = await processInboundTelecomMessage(payload, {
      siteId: siteA,
      fromE164: PHONE,
      toE164: '+12125550000',
      text: 'STOP',
      providerMessageId: `rc319-stop-${suffix}`,
    })
    expect(stop.action).toBe('opt-out')
    expect(stop.suppressionRecorded).toBe(true)
    expect(await hasTelecomConsent(payload, consentInput)).toBe(false)
    const requeued = await queueTelecomCampaignDeliveries(payload, String(message.id))
    expect(requeued.queuedCount).toBe(0)
  }, 120_000)
})
