/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { ensureRenegadePartyDemo, type DemoEnvironment } from '../helpers/renegadeparty-demo'

import { POST as handleSubscribe } from '../../src/app/(frontend)/api/subscribers/subscribe/route'
import { POST as handleConfirm } from '../../src/app/(frontend)/api/subscribers/confirm/route'

import {
  createRecipientSnapshot,
  evaluateSegmentRecipients,
  queueNewsletterDeliveries,
  requestDoubleOptIn,
  confirmDoubleOptIn,
  submitPublicForm,
  suppressSubscriber,
} from '../../src/modules/audience/service'
import { loadPublicForm } from '../../src/modules/audience/form-runtime'
import { segmentVersion, type SegmentNode } from '../../src/modules/audience/engine'
import { audienceDigest } from '../../src/modules/audience/contracts'
import { localMailSinkReceipts, resetLocalMailSink } from '../../src/modules/email/delivery'
import { emailDeliveryTask, newsletterDispatchTask } from '../../src/modules/audience/tasks'
import { formIntakeTask } from '../../src/modules/audience/form-tasks'

/**
 * 09D closure — event-driven automation + the complete visitor journey.
 *
 * Automation: the product's supported event-driven automation is the form
 * intake pipeline (submission event -> journaled create-contact /
 * create-task effects, resumed by the audience-form-intake worker task).
 * General automation definitions are review records — the UI and the form
 * runtime both label general execution unavailable — so this file also
 * proves the boundary: an unsupported action makes a form unavailable and
 * nothing fires.
 *
 * Journey: public subscribe -> confirmation -> segment membership (via the
 * reconciled locale/sourceCampaign projections) -> campaign snapshot ->
 * dispatch -> delivery observed in the local mail sink only. A control
 * subscriber who unsubscribes after the snapshot is taken must receive no
 * delivery: the dispatch automation re-checks suppression at queue time.
 */
describe('09D closure — automation execution and visitor/UI/local-sink journey', () => {
  let payload: Payload
  let demo: DemoEnvironment
  let siteId: string
  let otherSiteId: string
  let savedOrigins: unknown
  const suffix = randomUUID().slice(0, 8)

  beforeAll(async () => {
    process.env.EMAIL_MODE = 'development'
    process.env.TELECOM_MODE = 'emulator'
    process.env.EMAIL_FROM = 'newsletter@renegadeparty.org'

    payload = await getPayload({ config })
    demo = await ensureRenegadePartyDemo(payload)
    siteId = demo.siteId

    const other = (await payload.create({
      collection: 'sites',
      data: {
        name: `09D closure other ${suffix}`,
        slug: `closure-other-${suffix}`,
        domain: `closure-other-${suffix}.example.test`,
        status: 'published',
      },
      overrideAccess: true,
    } as never)) as any
    otherSiteId = String(other.id)

    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
    } as never)) as any
    savedOrigins = settings?.canonicalOriginsBySite
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOriginsBySite: {
          ...((savedOrigins as Record<string, string>) ?? {}),
          [siteId]: 'http://localhost:3000',
        },
      },
      overrideAccess: true,
    })
    resetLocalMailSink()
  })

  afterAll(async () => {
    // Restore the shared site-settings global exactly as found so this
    // file cannot poison sibling suites (disc-00 isolation lesson).
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { canonicalOriginsBySite: savedOrigins ?? {} },
      overrideAccess: true,
    })
    resetLocalMailSink()
  })

  it('automation: a form submission fires create-contact and create-task through the worker task, exactly once', async () => {
    const schemaBody = {
      version: 1,
      locale: 'en',
      consentRevision: 'closure-auto-v1',
      consentText: 'I consent to contact about my request.',
      fields: [
        { key: 'email', type: 'email', label: 'Email', required: true },
        { key: 'name', type: 'text', label: 'Name', required: false },
        { key: 'consent', type: 'checkbox', label: 'Contact consent', required: true },
      ],
    }
    const form = (await payload.create({
      collection: 'form-definitions',
      data: {
        site: siteId,
        name: `Closure intake ${suffix}`,
        publicPath: `/forms/closure-intake-${suffix}`,
        actions: [
          { type: 'create-contact' },
          { type: 'create-task', title: `Closure intake ${suffix}` },
        ],
      },
      overrideAccess: true,
    } as never)) as any
    const savedSchema = (await payload.create({
      collection: 'form-schemas',
      data: {
        form: form.id,
        version: 1,
        state: 'published',
        locale: 'en',
        consentText: schemaBody.consentText,
        consentRevision: schemaBody.consentRevision,
        schema: schemaBody,
      },
      overrideAccess: true,
    } as never)) as any
    await payload.update({
      collection: 'form-definitions',
      id: form.id,
      data: { activeSchema: savedSchema.id },
      overrideAccess: true,
    } as never)

    const loaded = await loadPublicForm(payload, String(form.id), siteId)
    expect(loaded).not.toBeNull()
    // The same form is not a public form of another site.
    expect(await loadPublicForm(payload, String(form.id), otherSiteId)).toBeNull()

    const intakeEmail = `intake-${suffix}@example.test`
    const input = {
      formId: String(form.id),
      siteId,
      schema: loaded!.snapshot,
      values: { email: intakeEmail, name: 'Closure Visitor', consent: true },
      ipDigest: 'digest',
      idempotencyKey: `closure-intake-${suffix}`,
    }
    const [first, second] = await Promise.all([
      submitPublicForm(payload, input),
      submitPublicForm(payload, input),
    ])
    expect(first.submission.id).toBe(second.submission.id)
    expect([first, second].filter((r) => r.replay)).toHaveLength(1)

    // The triggering event alone has not yet produced effects: the worker
    // task is the executor.
    const contactsBefore = await payload.find({
      collection: 'contacts',
      where: {
        and: [{ site: { equals: siteId } }, { emailHash: { equals: audienceDigest(intakeEmail) } }],
      },
      overrideAccess: true,
    } as never)
    expect(contactsBefore.docs).toHaveLength(0)

    await (formIntakeTask.handler as any)({ req: { payload } })

    const contacts = await payload.find({
      collection: 'contacts',
      where: {
        and: [{ site: { equals: siteId } }, { emailHash: { equals: audienceDigest(intakeEmail) } }],
      },
      overrideAccess: true,
    } as never)
    expect(contacts.docs).toHaveLength(1)
    expect((contacts.docs[0] as any).status).toBe('lead')

    const tasks = await payload.find({
      collection: 'workflow-items',
      where: { title: { equals: `Closure intake ${suffix}` } },
      overrideAccess: true,
    } as never)
    expect(tasks.docs).toHaveLength(1)
    expect((tasks.docs[0] as any).sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: 'form-submissions',
          id: String(first.submission.id),
        }),
      ]),
    )

    const submission = (await payload.findByID({
      collection: 'form-submissions',
      id: first.submission.id,
      overrideAccess: true,
    } as never)) as any
    expect(submission.status).toBe('triaged')
    expect(submission.actionState.map((a: any) => a.status)).toEqual(['completed', 'completed'])
    expect(submission.actionState.map((a: any) => a.resultId)).toEqual([
      String((contacts.docs[0] as any).id),
      String((tasks.docs[0] as any).id),
    ])

    // Re-running the worker does not fire the automation twice.
    await (formIntakeTask.handler as any)({ req: { payload } })
    const contactsAfter = await payload.find({
      collection: 'contacts',
      where: {
        and: [{ site: { equals: siteId } }, { emailHash: { equals: audienceDigest(intakeEmail) } }],
      },
      overrideAccess: true,
    } as never)
    expect(contactsAfter.docs).toHaveLength(1)
    const tasksAfter = await payload.find({
      collection: 'workflow-items',
      where: { title: { equals: `Closure intake ${suffix}` } },
      overrideAccess: true,
    } as never)
    expect(tasksAfter.docs).toHaveLength(1)
  })

  it('automation negatives: cross-site submission is rejected, and an unsupported action makes a form unavailable so nothing fires', async () => {
    const schemaBody = {
      version: 1,
      locale: 'en',
      consentRevision: 'closure-auto-v1',
      consentText: 'I consent to contact about my request.',
      fields: [
        { key: 'email', type: 'email', label: 'Email', required: true },
        { key: 'consent', type: 'checkbox', label: 'Contact consent', required: true },
      ],
    }
    const makeLoadedForm = async (actions: unknown[], slug: string) => {
      const formDoc = (await payload.create({
        collection: 'form-definitions',
        data: {
          site: siteId,
          name: `Closure ${slug} ${suffix}`,
          publicPath: `/forms/closure-${slug}-${suffix}`,
          actions,
        },
        overrideAccess: true,
      } as never)) as any
      const schemaDoc = (await payload.create({
        collection: 'form-schemas',
        data: {
          form: formDoc.id,
          version: 1,
          state: 'published',
          locale: 'en',
          consentText: schemaBody.consentText,
          consentRevision: schemaBody.consentRevision,
          schema: schemaBody,
        },
        overrideAccess: true,
      } as never)) as any
      await payload.update({
        collection: 'form-definitions',
        id: formDoc.id,
        data: { activeSchema: schemaDoc.id },
        overrideAccess: true,
      } as never)
      return formDoc
    }

    // (a) A submission addressed to another site for this site's form is
    // rejected before any record or effect exists.
    const foreignForm = await makeLoadedForm([{ type: 'create-contact' }], 'foreign')
    const loadedForeign = await loadPublicForm(payload, String(foreignForm.id), siteId)
    expect(loadedForeign).not.toBeNull()
    const foreignEmail = `intake-foreign-${suffix}@example.test`
    await expect(
      submitPublicForm(payload, {
        formId: String(foreignForm.id),
        siteId: otherSiteId,
        schema: loadedForeign!.snapshot,
        values: { email: foreignEmail, consent: true },
        ipDigest: 'digest',
        idempotencyKey: `closure-foreign-${suffix}`,
      }),
    ).rejects.toThrow('Form site mismatch')
    const foreignContacts = await payload.find({
      collection: 'contacts',
      where: { emailHash: { equals: audienceDigest(foreignEmail) } },
      overrideAccess: true,
    } as never)
    expect(foreignContacts.docs).toHaveLength(0)

    // (b) General automation actions are not executable intake actions:
    // the form can be defined, but it never becomes a public form, so no
    // submission — and no effect — can occur through it.
    const generalForm = await makeLoadedForm(
      [{ type: 'send-approved-message', templateId: 'welcome' }],
      'general',
    )
    expect(await loadPublicForm(payload, String(generalForm.id), siteId)).toBeNull()
  })

  it('journey: subscribe -> confirm -> segment -> campaign -> local-sink delivery; a post-snapshot unsubscribe receives nothing', async () => {
    resetLocalMailSink()
    // The journey runs on its own fresh site so its segment universe is
    // exactly the subscribers this test creates — no residue from other
    // suites or earlier runs can enter the snapshot.
    const journeySite = (await payload.create({
      collection: 'sites',
      data: {
        name: `09D closure journey ${suffix}`,
        slug: `closure-journey-${suffix}`,
        domain: `closure-journey-${suffix}.example.test`,
        status: 'published',
      },
      overrideAccess: true,
    } as never)) as any
    const journeySiteId = String(journeySite.id)
    const list = (await payload.create({
      collection: 'audience-lists',
      data: {
        site: journeySiteId,
        name: `Closure list ${suffix}`,
        status: 'active',
        doubleOptIn: true,
      },
      overrideAccess: true,
    } as never)) as any
    const listId = String(list.id)

    // Public routes resolve the site from the request host via the
    // site-settings canonical-origin map: pin a unique origin for the
    // journey site (the file's afterAll restores the global as found).
    const journeyHost = `journey-${suffix}.example.test`
    const currentSettings = (await payload.findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
    } as never)) as any
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOriginsBySite: {
          ...((currentSettings?.canonicalOriginsBySite as Record<string, string>) ?? {}),
          [journeySiteId]: `http://${journeyHost}`,
        },
      },
      overrideAccess: true,
    })

    // 1. Visitor subscribes through the public route, choosing locale es.
    const journeyEmail = `journey-${suffix}@example.test`
    const subscribeRes = await handleSubscribe(
      new Request(`http://${journeyHost}/api/subscribers/subscribe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200 + 1)}`,
        },
        body: JSON.stringify({
          email: journeyEmail,
          locale: 'es',
          siteId: journeySiteId,
          listId,
        }),
      }),
    )
    expect(subscribeRes.status).toBe(202)

    const journeySub = (
      await payload.find({
        collection: 'subscribers',
        where: { and: [{ site: { equals: journeySiteId } }, { email: { equals: journeyEmail } }] },
        limit: 1,
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    expect(journeySub).toBeDefined()
    expect(journeySub.status).toBe('pending')

    // 2. Confirmation delivery is executed to the local sink; the visitor
    // confirms through the public route with the delivered token.
    const confirmationDeliveries = await payload.find({
      collection: 'email-deliveries',
      where: { subscriber: { equals: journeySub.id } },
      limit: 1,
      sort: '-createdAt',
      overrideAccess: true,
    } as never)
    expect(confirmationDeliveries.docs.length).toBeGreaterThanOrEqual(1)
    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: (confirmationDeliveries.docs[0] as any).id },
      req: { payload },
    })
    const confirmationMail = localMailSinkReceipts().filter((r) => r.to === journeyEmail)
    expect(confirmationMail.length).toBeGreaterThanOrEqual(1)
    const tokenMatch = confirmationMail[0].text.match(/token=([a-zA-Z0-9_-]+)/)
    expect(tokenMatch).not.toBeNull()
    const confirmRes = await handleConfirm(
      new Request('http://localhost:3000/api/subscribers/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tokenMatch![1] }),
      }),
    )
    expect(confirmRes.status).toBe(200)
    const activeJourneySub = (await payload.findByID({
      collection: 'subscribers',
      id: journeySub.id,
      overrideAccess: true,
    } as never)) as any
    expect(activeJourneySub.status).toBe('active')

    // Control subscriber through the canonical service with the same
    // locale/source facts, so the segment snapshot holds both.
    const controlEmail = `journey-control-${suffix}@example.test`
    const controlOptIn = await requestDoubleOptIn(payload, {
      siteId: journeySiteId,
      listId,
      email: controlEmail,
      locale: 'es',
      consentWording: 'I consent to receive newsletter updates from this publication.',
      source: 'public-subscribe',
    })
    const controlSub = (await confirmDoubleOptIn(payload, controlOptIn.token!)) as any
    expect(controlSub.status).toBe('active')

    // 3. Segment membership through the reconciled projections: the
    // visitor's persisted locale and acquisition source select them.
    const makeSegment = async (definition: SegmentNode, name: string) => {
      const segment = (await payload.create({
        collection: 'audience-segments',
        data: {
          site: journeySiteId,
          name: `${name} ${suffix}`,
          definition,
          version: segmentVersion(definition),
          status: 'active',
        },
        overrideAccess: true,
      } as never)) as any
      return String(segment.id)
    }
    const localeSegmentId = await makeSegment(
      { predicate: { field: 'locale', op: 'is', value: 'es' } },
      'Closure locale es',
    )
    const localeEvaluation = await evaluateSegmentRecipients(payload, {
      siteId: journeySiteId,
      segmentId: localeSegmentId,
    })
    const localeIds = localeEvaluation.eligibleRecipients.map((r) => r.subscriberId)
    expect(localeIds).toContain(String(journeySub.id))
    expect(localeIds).toContain(String(controlSub.id))

    const sourceSegmentId = await makeSegment(
      { predicate: { field: 'sourceCampaign', op: 'in', value: ['public-subscribe'] } },
      'Closure source public-subscribe',
    )
    const sourceEvaluation = await evaluateSegmentRecipients(payload, {
      siteId: journeySiteId,
      segmentId: sourceSegmentId,
    })
    expect(sourceEvaluation.eligibleRecipients.map((r) => r.subscriberId)).toContain(
      String(journeySub.id),
    )

    // 4. Campaign: snapshot the locale segment, schedule the message.
    const message = (await payload.create({
      collection: 'email-messages',
      data: {
        site: journeySiteId,
        subject: `Closure campaign ${suffix}`,
        purpose: 'newsletter',
        channel: 'email',
        language: 'es',
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Closure campaign body' }],
      },
      overrideAccess: true,
    } as never)) as any
    // The operator lifecycle is draft -> review -> scheduled (the Email
    // Messages hook refuses a direct draft -> scheduled transition).
    await payload.update({
      collection: 'email-messages',
      id: message.id,
      data: { status: 'review' },
      overrideAccess: true,
    } as never)
    const snapshot = (await createRecipientSnapshot(payload, {
      siteId: journeySiteId,
      messageId: String(message.id),
      segmentId: localeSegmentId,
      actorUserId: String(demo.userId),
    })) as any
    const snapshotIds = (snapshot.recipients as any[]).map((r) => r.subscriberId).sort()
    expect(snapshotIds).toEqual([String(controlSub.id), String(journeySub.id)].sort())
    await payload.update({
      collection: 'email-messages',
      id: message.id,
      data: {
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - 60000).toISOString(),
        recipientSnapshot: snapshot.id,
      },
      overrideAccess: true,
    } as never)

    // 5. The control unsubscribes after the snapshot. The dispatch
    // automation must not act on them.
    await suppressSubscriber(payload, {
      siteId: journeySiteId,
      email: controlEmail,
      reason: 'unsubscribe',
    })

    resetLocalMailSink()
    await (newsletterDispatchTask.handler as any)({ req: { payload } })

    const campaignDeliveries = await payload.find({
      collection: 'email-deliveries',
      where: { message: { equals: message.id } },
      limit: 0,
      pagination: false,
      overrideAccess: true,
    } as never)
    expect(campaignDeliveries.docs).toHaveLength(1)
    const delivery = campaignDeliveries.docs[0] as any
    const deliverySubscriberId =
      typeof delivery.subscriber === 'object' && delivery.subscriber
        ? String(delivery.subscriber.id)
        : String(delivery.subscriber)
    expect(deliverySubscriberId).toBe(String(journeySub.id))

    // Dispatch is idempotent: a second run queues nothing new.
    await (newsletterDispatchTask.handler as any)({ req: { payload } })
    const afterSecondDispatch = await payload.find({
      collection: 'email-deliveries',
      where: { message: { equals: message.id } },
      limit: 0,
      pagination: false,
      overrideAccess: true,
    } as never)
    expect(afterSecondDispatch.docs).toHaveLength(1)

    // 6. Delivery executes to the local sink — and only there.
    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: delivery.id },
      req: { payload },
    })
    const campaignMail = localMailSinkReceipts().filter(
      (r) => r.subject === `Closure campaign ${suffix}`,
    )
    expect(campaignMail).toHaveLength(1)
    expect(campaignMail[0].to).toBe(journeyEmail)
    expect(localMailSinkReceipts().filter((r) => r.to === controlEmail)).toHaveLength(0)
    // The dispatch path is the queue function itself as well.
    expect(await queueNewsletterDeliveries(payload, String(message.id))).toBe(0)
  })
})
