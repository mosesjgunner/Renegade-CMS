import { audienceDigest } from '../../src/modules/audience/contracts'
import { setMemberRelation } from '../../src/modules/community/profile-projection'
import '../../src/scripts/rc02-network.mjs'
import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto'
import {
  resolveRemoteActor,
  verifyInboundActivity,
  recordInbound,
  queueActivityDelivery,
} from '../../src/modules/social/activitypub-runtime'
import { networkDeliveryTask } from '../../src/modules/network/tasks'
import { publicTimelineEntries } from '../../src/modules/events/timeline'
import {
  queueCommunityWindow,
  sendCommunityDelivery,
  retryCommunityDelivery,
} from '../../src/modules/community/external-notifications'
import { setMemberNotificationPreference } from '../../src/modules/community/notification-delivery'
import { executeDbQuery } from '../../src/modules/community/comment-composer'
import { localMailSinkReceipts } from '../../src/modules/email/delivery'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { findPublicEvents, findPublicEvent } from '../../src/modules/events/public'
import { submitPublicForm, runFormActions } from '../../src/modules/audience/service'
import { loadPublicForm } from '../../src/modules/audience/form-runtime'
import {
  issueMagicLink,
  consumeMagicLink,
  exportMemberData,
} from '../../src/modules/identity/member-identity'
import { eventNotificationEnabled } from '../../src/modules/community/event-notification-preferences'
import { saveMemberProfile } from '../../src/modules/community/profile-service'
import { dispatchCommunityNotification } from '../../src/modules/community/service'
import {
  getOrCreateCommentThread,
  createCanonicalComment,
} from '../../src/modules/community/comment-identity'
import {
  startDirectConversation,
  sendConversationMessage,
} from '../../src/modules/community/conversation-composer'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'dispatch.rc02.test:3129' }),
}))
let payload: Payload,
  site: any,
  other: any,
  owner: any,
  alice: string,
  bob: string,
  outsider: string
const suffix = randomUUID().slice(0, 8)
const req = () => ({ headers: new Headers({ host: 'dispatch.rc02.test:3129' }) }) as never
const schema = {
  version: 1,
  locale: 'en',
  consentRevision: 'rc08b-intake-v1',
  consentText: 'I consent to contact about my request.',
  fields: [
    { key: 'email', type: 'email', label: 'Email', required: true },
    { key: 'consent', type: 'checkbox', label: 'Contact consent', required: true },
  ],
}
beforeAll(async () => {
  if (
    !/renegade_rc08b_\d+_release_acceptance$/.test(
      new URL(process.env.DATABASE_URL!).pathname.slice(1),
    )
  )
    throw Error('RC08B disposable DB required')
  payload = await getPayload({ config })
  site = (await payload.find({ collection: 'sites', limit: 1, overrideAccess: true })).docs[0]
  owner = (await payload.find({ collection: 'users', limit: 1, overrideAccess: true })).docs[0]
  other = await payload.create({
    collection: 'sites',
    data: {
      name: 'Other RC08B site',
      slug: `rc08b-${suffix}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['heart'],
    },
    overrideAccess: true,
  })
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOriginsBySite: {
        [site.id]: 'https://dispatch.rc02.test:3129',
        [other.id]: 'https://other.rc08b.test',
      },
    },
    overrideAccess: true,
  } as never)
  const ids = []
  for (const name of ['alice', 'bob', 'outsider']) {
    const issued = await issueMagicLink(payload as never, `${name}-${suffix}@example.test`)
    ids.push((await consumeMagicLink(payload as never, issued.token!))!.memberId)
  }
  ;[alice, bob, outsider] = ids
}, 60_000)
afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('RC08B persisted promotion boundaries', () => {
  it('reads real future occurrences, excludes foreign/private/draft/deleted records and survives a new query', async () => {
    const base = {
      site: site.id,
      title: `RC08B event ${suffix}`,
      slug: `rc08b-event-${suffix}`,
      startsAt: '2027-03-07T15:00:00Z',
      timeZone: 'America/Chicago',
      status: 'published',
      visibility: 'public',
      recurrence: { frequency: 'weekly', count: 3 },
    }
    const event = await payload.create({
      collection: 'events',
      data: base as never,
      overrideAccess: true,
    })
    for (const [index, changes] of [
      { site: other.id },
      { visibility: 'private' },
      { status: 'draft' },
    ].entries())
      await payload.create({
        collection: 'events',
        data: { ...base, ...changes, slug: `rc08b-hidden-${index}-${suffix}` } as never,
        overrideAccess: true,
      })
    const result = await findPublicEvents({
      from: new Date('2027-03-01'),
      to: new Date('2027-04-01'),
      publicFeed: true,
    })
    const rows = result.occurrences.filter((row) => row.title.includes(suffix))
    expect(rows.map((row) => row.occurrenceStartsAt)).toEqual([
      '2027-03-07T15:00:00.000Z',
      '2027-03-14T14:00:00.000Z',
      '2027-03-21T14:00:00.000Z',
    ])
    expect(await findPublicEvent(`rc08b-hidden-1-${suffix}`, true)).toBeNull()
    await payload.delete({ collection: 'events', id: event.id, overrideAccess: true })
    expect(await findPublicEvent(base.slug, true)).toBeNull()
  })
  it('creates and edits a real timeline through scoped operator access, rejects foreign memberships, and hides deleted/private events', async () => {
    const event = await payload.create({
      collection: 'events',
      data: {
        site: site.id,
        title: 'Timeline event',
        slug: `timeline-event-${suffix}`,
        startsAt: '2027-03-07T15:00:00Z',
        timeZone: 'America/Chicago',
        status: 'published',
        visibility: 'public',
      } as never,
      overrideAccess: true,
    })
    const timeline: any = await payload.create({
      collection: 'timelines',
      data: {
        site: site.id,
        title: 'RC08B timeline',
        slug: `timeline-${suffix}`,
        status: 'draft',
        visibility: 'public',
        orderingMode: 'manual',
      } as never,
      user: owner,
      req: req(),
      overrideAccess: false,
    })
    await payload.create({
      collection: 'timeline-memberships',
      data: { timeline: timeline.id, event: event.id, position: 1 } as never,
      user: owner,
      req: req(),
      overrideAccess: false,
    })
    const published: any = await payload.update({
      collection: 'timelines',
      id: timeline.id,
      data: { status: 'published', summary: 'Saved timeline' } as never,
      user: owner,
      req: req(),
      overrideAccess: false,
    })
    expect(
      (await publicTimelineEntries(payload, published, site.id)).map((row) => row.title),
    ).toEqual(['Timeline event'])
    expect(await publicTimelineEntries(payload, published, other.id)).toEqual([])
    const foreign = await payload.create({
      collection: 'events',
      data: {
        site: other.id,
        title: 'Foreign timeline event',
        slug: `foreign-timeline-${suffix}`,
        startsAt: '2027-03-07T15:00:00Z',
        timeZone: 'UTC',
        status: 'published',
        visibility: 'public',
      } as never,
      overrideAccess: true,
    })
    await expect(
      payload.create({
        collection: 'timeline-memberships',
        data: { timeline: timeline.id, event: foreign.id } as never,
        user: owner,
        req: req(),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await payload.update({
      collection: 'events',
      id: event.id,
      data: { visibility: 'private' } as never,
      overrideAccess: true,
    })
    expect(await publicTimelineEntries(payload, published, site.id)).toEqual([])
    await payload.delete({ collection: 'events', id: event.id, overrideAccess: true })
    expect(await publicTimelineEntries(payload, published, site.id)).toEqual([])
  })
  it('persists consent, scopes replay by form/site, recovers a failed task and never repeats completed side effects', async () => {
    const form = (await payload.create({
      collection: 'form-definitions' as never,
      data: {
        site: site.id,
        name: 'RC08B intake',
        publicPath: `/forms/intake-${suffix}`,
        actions: [{ type: 'create-contact' }, { type: 'create-task', title: `Intake ${suffix}` }],
      } as never,
      user: owner,
      req: req(),
      overrideAccess: false,
    })) as any
    const savedSchema: any = await payload.create({
      collection: 'form-schemas' as never,
      data: {
        form: form.id,
        version: 1,
        state: 'published',
        locale: 'en',
        consentText: schema.consentText,
        consentRevision: schema.consentRevision,
        schema,
      } as never,
      user: owner,
      req: req(),
      overrideAccess: false,
    })
    const active = (await payload.update({
      collection: 'form-definitions' as never,
      id: form.id,
      data: { activeSchema: savedSchema.id } as never,
      user: owner,
      req: req(),
      overrideAccess: false,
    })) as any
    const loaded = await loadPublicForm(payload, String(form.id), site.id)
    expect(loaded).not.toBeNull()
    expect(await loadPublicForm(payload, String(form.id), other.id)).toBeNull()
    const input = {
      formId: String(form.id),
      siteId: site.id,
      schema: loaded!.snapshot,
      values: { email: `intake-${suffix}@example.test`, consent: true, undeclared: 'discard' },
      ipDigest: 'digest',
      idempotencyKey: `intake-request-${suffix}`,
    }
    const results = await Promise.all([
      submitPublicForm(payload, input),
      submitPublicForm(payload, input),
    ])
    expect(results[0].submission.id).toBe(results[1].submission.id)
    expect(results.filter((result) => result.replay)).toHaveLength(1)
    expect(results[0].submission.values).not.toHaveProperty('undeclared')
    expect(results[0].submission.consentSnapshot.wording).toBe(schema.consentText)
    const originalCreate = payload.create.bind(payload)
    let fail = true
    const failing = vi.spyOn(payload, 'create').mockImplementation(async (args: any) => {
      if (args.collection === 'workflow-items' && fail) {
        fail = false
        throw Error('Injected persistence failure')
      }
      return originalCreate(args) as any
    })
    const first = await runFormActions(payload, {
      submission: results[0].submission,
      form: active,
      schema,
    })
    expect(first.map((action) => action.status)).toEqual(['completed', 'failed'])
    failing.mockRestore()
    const recovered = await runFormActions(payload, {
      submission: results[0].submission,
      form: active,
      schema,
    })
    expect(recovered.map((action) => action.status)).toEqual(['completed', 'completed'])
    await runFormActions(payload, { submission: results[0].submission, form: active, schema })
    const tasks = await payload.find({
      collection: 'workflow-items' as never,
      where: { title: { equals: `Intake ${suffix}` } },
      overrideAccess: true,
    })
    expect(tasks.docs).toHaveLength(1)
    expect(
      (
        (await payload.findByID({
          collection: 'form-submissions' as never,
          id: results[0].submission.id,
          overrideAccess: true,
        })) as any
      ).status,
    ).toBe('triaged')
    await expect(
      payload.update({
        collection: 'form-definitions' as never,
        id: form.id,
        data: { site: other.id } as never,
        user: owner,
        req: req(),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'form-schemas' as never,
        id: savedSchema.id,
        data: { consentText: 'Changed' } as never,
        user: owner,
        req: req(),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.find({
        collection: 'form-submissions' as never,
        user: null,
        req: req(),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
  it('enforces persisted message switches at notification creation, with owner-only preferences', async () => {
    await saveMemberProfile(payload, bob, {
      relationshipNotifications: { messages: false, mentions: false, follows: false },
    })
    expect(await eventNotificationEnabled(payload, bob, 'direct_message.received')).toBe(false)
    const input = {
      siteId: site.id,
      recipientMemberId: bob,
      actorMemberId: alice,
      type: 'direct_message.received',
      object: { id: 'test' },
      payloadData: {},
    }
    await dispatchCommunityNotification(payload, input)
    expect(
      (
        await payload.find({
          collection: 'notifications' as never,
          where: { recipientMember: { equals: bob } },
          overrideAccess: true,
        })
      ).docs,
    ).toHaveLength(0)
    await saveMemberProfile(payload, bob, { relationshipNotifications: { messages: true } })
    await dispatchCommunityNotification(payload, input)
    expect(
      (
        await payload.find({
          collection: 'notifications' as never,
          where: { recipientMember: { equals: bob } },
          overrideAccess: true,
        })
      ).docs,
    ).toHaveLength(1)
  })
  it('deduplicates explicit email windows, delivers through the transport, and cancels queued updates after opt-out', async () => {
    await saveMemberProfile(payload, bob, { relationshipNotifications: { follows: true } })
    await setMemberNotificationPreference(payload, {
      siteId: site.id,
      memberId: bob,
      channel: 'email',
      frequency: 'daily_digest',
      rules: {
        deliveryAddress: `bob-${suffix}@example.test`,
        deliveryConsentRevision: 'rc08b-email-v1',
        deliveryEnabledAt: '2026-01-01T00:00:00Z',
      },
    })
    await dispatchCommunityNotification(payload, {
      siteId: site.id,
      recipientMemberId: bob,
      actorMemberId: alice,
      type: 'relationship.follow',
      object: { id: alice },
      payloadData: {},
    })
    const end = new Date(Date.now() + 1000).toISOString(),
      start = '2026-01-01T00:00:00Z'
    const first = await queueCommunityWindow(payload, site.id, bob, 'daily_digest', start, end)
    const replay = await queueCommunityWindow(payload, site.id, bob, 'daily_digest', start, end)
    expect(first).not.toBeNull()
    expect(replay).toEqual(first)
    await sendCommunityDelivery(payload, first![0])
    await sendCommunityDelivery(payload, first![0])
    expect(
      (
        await executeDbQuery<any>(
          payload,
          'SELECT status,attempts FROM audience_delivery_outbox WHERE id=$1',
          [first![0]],
        )
      )[0],
    ).toMatchObject({ status: 'accepted', attempts: 1 })
    const receipts = localMailSinkReceipts().filter((row) => row.subject === 'Community updates')
    expect(receipts).toHaveLength(1)
    expect(receipts[0].text).toContain('notification-unsubscribe')
    expect(receipts[0].text).not.toContain(`alice-${suffix}`)
    await setMemberNotificationPreference(payload, {
      siteId: site.id,
      memberId: bob,
      channel: 'email',
      frequency: 'immediate',
      rules: {
        deliveryAddress: `bob-${suffix}@example.test`,
        deliveryConsentRevision: 'rc08b-email-v1',
        deliveryEnabledAt: start,
      },
    })
    const queued = await queueCommunityWindow(payload, site.id, bob, 'immediate', start, end)
    expect(queued!.length).toBeGreaterThan(0)
    await setMemberNotificationPreference(payload, {
      siteId: site.id,
      memberId: bob,
      channel: 'email',
      frequency: 'off',
    })
    for (const id of queued!) await sendCommunityDelivery(payload, id)
    expect(
      (
        await executeDbQuery<any>(
          payload,
          'SELECT status FROM audience_delivery_outbox WHERE id=$1',
          [queued![0]],
        )
      )[0].status,
    ).toBe('cancelled')
    expect(await queueCommunityWindow(payload, other.id, bob, 'immediate', start, end)).toBeNull()
  })
  it('keeps external delivery independent of in-app, suppresses late mute/block/address opt-out, and recovers a real disabled-transport failure', async () => {
    const rules = {
      deliveryAddress: `bob-${suffix}@example.test`,
      deliveryConsentRevision: 'rc08b-email-v1',
      deliveryEnabledAt: '2026-01-01T00:00:00Z',
    }
    await setMemberNotificationPreference(payload, {
      siteId: site.id,
      memberId: bob,
      channel: 'in_app',
      frequency: 'off',
    })
    await setMemberNotificationPreference(payload, {
      siteId: site.id,
      memberId: bob,
      channel: 'email',
      frequency: 'immediate',
      rules,
    })
    await dispatchCommunityNotification(payload, {
      siteId: site.id,
      recipientMemberId: bob,
      actorMemberId: outsider,
      type: 'relationship.follow',
      object: { id: outsider },
      payloadData: {},
    })
    const notifications: any = await payload.find({
      collection: 'notifications',
      where: { recipientMember: { equals: bob } },
      sort: '-createdAt',
      overrideAccess: true,
    })
    expect(notifications.docs[0].channels).toEqual(['email'])
    const end = new Date(Date.now() + 1000).toISOString(),
      queued = await queueCommunityWindow(
        payload,
        site.id,
        bob,
        'immediate',
        rules.deliveryEnabledAt,
        end,
      )
    const rows = await executeDbQuery<any>(
      payload,
      "SELECT id FROM audience_delivery_outbox WHERE id=ANY($1::uuid[]) AND status='pending' ORDER BY created_at",
      [queued],
    )
    const pending = rows.at(-1)!.id
    const previousMode = process.env.EMAIL_MODE
    process.env.EMAIL_MODE = 'disabled'
    try {
      await sendCommunityDelivery(payload, pending)
    } finally {
      process.env.EMAIL_MODE = previousMode
    }
    expect(
      (
        await executeDbQuery<any>(
          payload,
          'SELECT status,error FROM audience_delivery_outbox WHERE id=$1',
          [pending],
        )
      )[0],
    ).toMatchObject({ status: 'failed', error: 'Transport outcome: email_disabled' })
    expect(await retryCommunityDelivery(payload, other.id, pending, owner.id)).toBe(false)
    expect(await retryCommunityDelivery(payload, site.id, pending, owner.id)).toBe(true)
    await sendCommunityDelivery(payload, pending)
    expect(
      (
        await executeDbQuery<any>(
          payload,
          'SELECT status FROM audience_delivery_outbox WHERE id=$1',
          [pending],
        )
      )[0].status,
    ).toBe('accepted')
    expect(await retryCommunityDelivery(payload, site.id, pending, owner.id)).toBe(false)
    await payload.create({
      collection: 'relationships',
      data: {
        site: site.id,
        subject: bob,
        object: { relationTo: 'members', value: outsider },
        kind: 'mute',
        status: 'active',
        visibility: 'private',
        pairKey: `mute:${site.id}:${bob}:${outsider}`,
      } as never,
      overrideAccess: true,
    })
    const visible = await (
      await import('../../src/modules/community/external-notifications')
    ).deliverableCommunitySources(payload, site.id, bob, rules.deliveryEnabledAt, end)
    expect(visible.some((row) => String(row.id) === notifications.docs[0].id)).toBe(false)
    await dispatchCommunityNotification(payload, {
      siteId: site.id,
      recipientMemberId: bob,
      actorMemberId: alice,
      type: 'relationship.follow',
      object: { id: alice },
      payloadData: {},
    })
    const blockedQueue = await queueCommunityWindow(
      payload,
      site.id,
      bob,
      'immediate',
      rules.deliveryEnabledAt,
      new Date(Date.now() + 1000).toISOString(),
    )
    const pendingBlock = (
      await executeDbQuery<any>(
        payload,
        "SELECT id FROM audience_delivery_outbox WHERE id=ANY($1::uuid[]) AND status='pending' ORDER BY created_at DESC",
        [blockedQueue],
      )
    )[0].id
    await setMemberRelation(payload, {
      siteId: site.id,
      subjectId: bob,
      targetId: alice,
      kind: 'block',
      active: true,
    })
    await sendCommunityDelivery(payload, pendingBlock)
    expect(
      (
        await executeDbQuery<any>(
          payload,
          'SELECT status FROM audience_delivery_outbox WHERE id=$1',
          [pendingBlock],
        )
      )[0].status,
    ).toBe('cancelled')
    await setMemberRelation(payload, {
      siteId: site.id,
      subjectId: bob,
      targetId: alice,
      kind: 'block',
      active: false,
    })
    await dispatchCommunityNotification(payload, {
      siteId: site.id,
      recipientMemberId: bob,
      actorMemberId: alice,
      type: 'relationship.follow',
      object: { id: alice },
      payloadData: {},
    })
    const suppressedQueue = await queueCommunityWindow(
      payload,
      site.id,
      bob,
      'immediate',
      rules.deliveryEnabledAt,
      new Date(Date.now() + 1000).toISOString(),
    )
    const pendingSuppression = (
      await executeDbQuery<any>(
        payload,
        "SELECT id FROM audience_delivery_outbox WHERE id=ANY($1::uuid[]) AND status='pending' ORDER BY created_at DESC",
        [suppressedQueue],
      )
    )[0].id
    await payload.create({
      collection: 'suppressions',
      data: {
        site: site.id,
        emailHash: audienceDigest(rules.deliveryAddress),
        reason: 'unsubscribe',
        source: 'rc08b-owned-opt-out',
        scope: 'site',
        global: false,
        occurredAt: new Date().toISOString(),
      } as never,
      overrideAccess: true,
    })
    await sendCommunityDelivery(payload, pendingSuppression)
    expect(
      (
        await executeDbQuery<any>(
          payload,
          'SELECT status,error FROM audience_delivery_outbox WHERE id=$1',
          [pendingSuppression],
        )
      )[0],
    ).toMatchObject({ status: 'cancelled', error: 'Address suppressed before send.' })
    await setMemberNotificationPreference(payload, {
      siteId: site.id,
      memberId: bob,
      channel: 'in_app',
      frequency: 'immediate',
    })
  })
  it('compiles ten persisted canonical notifications into one deduplicated digest while in-app is off', async () => {
    const { persistCommentWithOutbox } = await import(
      '../../src/modules/community/comment-composer'
    )
    const { subscribeToThread } = await import('../../src/modules/community/thread-lifecycle')
    const { projectInboxEvent, listInbox, markInboxRead } = await import(
      '../../src/modules/community/inbox-notifications'
    )
    const { compileNotificationDigest } = await import(
      '../../src/modules/community/notification-delivery'
    )
    const { deliverableCommunitySources } = await import(
      '../../src/modules/community/external-notifications'
    )
    const start = new Date().toISOString(),
      rules = {
        deliveryAddress: `outsider-${suffix}@example.test`,
        deliveryConsentRevision: 'rc08b-email-v1',
        deliveryEnabledAt: start,
      }
    await setMemberNotificationPreference(payload, {
      siteId: site.id,
      memberId: outsider,
      channel: 'in_app',
      frequency: 'off',
    })
    await setMemberNotificationPreference(payload, {
      siteId: site.id,
      memberId: outsider,
      channel: 'email',
      frequency: 'daily_digest',
      rules,
    })
    const content = (
      await payload.find({
        collection: 'content',
        where: { site: { equals: site.id } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    const thread = await getOrCreateCommentThread(payload as never, {
      siteId: site.id,
      canonicalContentId: String(content.id),
    })
    await subscribeToThread(payload, { siteId: site.id, threadId: thread.id, memberId: outsider })
    for (let index = 0; index < 10; index++) {
      const created = await persistCommentWithOutbox(payload, {
        siteId: site.id,
        threadId: thread.id,
        canonicalContentId: String(content.id),
        authorId: alice,
        authorType: 'member',
        status: 'visible',
        bodyRaw: `Private digest source ${suffix} ${index}`,
        bodyHtml: '<p>Digest source</p>',
        clientMutationId: randomUUID(),
        mentionedHandles: [],
        timestamp: new Date().toISOString(),
      })
      const event = (
        await executeDbQuery<any>(
          payload,
          "SELECT id,event_type,payload FROM outbox_events WHERE payload->>'comment_id'=$1",
          [created.id],
        )
      )[0]
      expect(
        await projectInboxEvent(payload, {
          id: event.id,
          eventType: event.event_type,
          payload: event.payload,
        }),
      ).toBe(1)
      expect(
        await projectInboxEvent(payload, {
          id: event.id,
          eventType: event.event_type,
          payload: event.payload,
        }),
      ).toBe(0)
    }
    const end = new Date(Date.now() + 1000).toISOString(),
      windowRange = { startAt: start, endAt: end }
    expect(await deliverableCommunitySources(payload, site.id, outsider, start, end)).toHaveLength(
      10,
    )
    expect(
      (await listInbox(payload, { siteId: site.id, memberId: outsider })).notifications,
    ).toEqual([])
    expect(
      (await markInboxRead(payload, { siteId: site.id, memberId: outsider })).unreadCount,
    ).toBe(0)
    const first = await compileNotificationDigest(payload, {
        siteId: site.id,
        recipientId: outsider,
        windowRange,
      }),
      replay = await compileNotificationDigest(payload, {
        siteId: site.id,
        recipientId: outsider,
        windowRange,
      })
    expect(first?.id).toBeTruthy()
    expect(replay?.id).toBe(first!.id)
    await sendCommunityDelivery(payload, first!.id)
    await sendCommunityDelivery(payload, first!.id)
    const receipts = localMailSinkReceipts().filter(
      (row) => row.to === rules.deliveryAddress && row.subject === 'Community updates',
    )
    expect(receipts).toHaveLength(1)
    expect(receipts[0].text).toContain('10 community updates')
    expect(receipts[0].text).not.toContain('Private digest source')
  })
  it('interoperates with an independent HTTPS peer: discovery, signed failure/retry, replay and tampering denial', async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }),
      publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const origin = 'https://dispatch.rc02.test:3134',
      actor = `${origin}/actor`,
      keyId = `${actor}#key`
    let attempts = 0,
      accepted = 0
    const peer = createServer(
      {
        key: readFileSync('scratch/rc02-tls/key.pem'),
        cert: readFileSync('scratch/rc02-tls/cert.pem'),
      },
      async (request, response) => {
        if (request.url === '/actor') {
          response.writeHead(200, { 'content-type': 'application/activity+json' })
          response.end(
            JSON.stringify({
              id: actor,
              type: 'Person',
              preferredUsername: 'independent-peer',
              inbox: `${origin}/inbox`,
              publicKey: { id: keyId, owner: actor, publicKeyPem },
            }),
          )
          return
        }
        let body = ''
        for await (const chunk of request) body += chunk
        const header = String(request.headers.signature),
          signature = /signature="([^"]+)"/.exec(header)?.[1] ?? ''
        const signing = `(request-target): post /inbox\nhost: ${request.headers.host}\ndate: ${request.headers.date}\ndigest: ${request.headers.digest}`
        const valid =
          request.headers.digest ===
            `SHA-256=${createHash('sha256').update(body).digest('base64')}` &&
          verify('RSA-SHA256', Buffer.from(signing), publicKeyPem, Buffer.from(signature, 'base64'))
        if (!valid) {
          response.writeHead(401)
          response.end()
          return
        }
        attempts++
        if (attempts === 1) {
          response.writeHead(503)
          response.end()
          return
        }
        accepted++
        response.writeHead(202)
        response.end()
      },
    )
    await new Promise<void>((resolve) => peer.listen(3134, '127.0.0.1', resolve))
    const previous = {
      key: process.env.ACTIVITYPUB_PRIVATE_KEY_PEM,
      id: process.env.ACTIVITYPUB_KEY_ID,
      allow: process.env.NETWORK_ALLOW_PRIVATE_DEVELOPMENT,
    }
    try {
      process.env.ACTIVITYPUB_PRIVATE_KEY_PEM = pair.privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString()
      process.env.ACTIVITYPUB_KEY_ID = keyId
      process.env.NETWORK_ALLOW_PRIVATE_DEVELOPMENT = 'true'
      await payload.updateGlobal({
        slug: 'network-settings',
        data: { remotePolicy: { default: 'allow' } },
        overrideAccess: true,
      } as never)
      const remote = await resolveRemoteActor(payload, actor, true)
      const activity = {
        id: `${actor}/activity/${suffix}`,
        type: 'Follow',
        actor,
        object: `https://dispatch.rc02.test:3129/ap/actor`,
      }
      const delivery = await queueActivityDelivery(payload, {
        remoteActor: remote,
        envelope: activity,
      })
      const handler = networkDeliveryTask.handler as any
      await expect(
        handler({ input: { deliveryId: delivery.id }, req: { payload } }),
      ).rejects.toThrow()
      await handler({ input: { deliveryId: delivery.id }, req: { payload } })
      await handler({ input: { deliveryId: delivery.id }, req: { payload } })
      expect({ attempts, accepted }).toEqual({ attempts: 2, accepted: 1 })
      expect(
        (
          await payload.findByID({
            collection: 'outbound-network-deliveries',
            id: delivery.id,
            overrideAccess: true,
          })
        ).status,
      ).toBe('delivered')
      const body = JSON.stringify(activity),
        date = new Date().toUTCString(),
        digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`
      const signing = `(request-target): post /ap/inbox\nhost: dispatch.rc02.test:3129\ndate: ${date}\ndigest: ${digest}`
      const signature = sign('RSA-SHA256', Buffer.from(signing), pair.privateKey).toString('base64')
      const headers = {
        host: 'dispatch.rc02.test:3129',
        date,
        digest,
        signature: `keyId="${keyId}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`,
      }
      const verified = await verifyInboundActivity({
        request: new Request('https://dispatch.rc02.test:3129/ap/inbox', {
          method: 'POST',
          headers,
          body,
        }),
        body,
        payload,
        allowPrivateDevelopment: true,
      })
      expect((await recordInbound(payload, { ...verified, envelope: activity })).duplicate).toBe(
        false,
      )
      expect((await recordInbound(payload, { ...verified, envelope: activity })).duplicate).toBe(
        true,
      )
      await expect(
        verifyInboundActivity({
          request: new Request('https://dispatch.rc02.test:3129/ap/inbox', {
            method: 'POST',
            headers: { ...headers, date: 'Mon, 01 Jan 2024 00:00:00 GMT' },
            body,
          }),
          body,
          payload,
          allowPrivateDevelopment: true,
        }),
      ).rejects.toThrow('date')
      await expect(
        verifyInboundActivity({
          request: new Request('https://dispatch.rc02.test:3129/ap/inbox', {
            method: 'POST',
            headers,
            body,
          }),
          body: body + ' ',
          payload,
          allowPrivateDevelopment: true,
        }),
      ).rejects.toThrow('digest')
    } finally {
      peer.closeAllConnections()
      await new Promise<void>((resolve) => peer.close(() => resolve()))
      for (const [name, value] of Object.entries({
        ACTIVITYPUB_PRIVATE_KEY_PEM: previous.key,
        ACTIVITYPUB_KEY_ID: previous.id,
        NETWORK_ALLOW_PRIVATE_DEVELOPMENT: previous.allow,
      }))
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
    }
  })
  it('exports canonical contributions and private owned/readable history without foreign contact or moderation data', async () => {
    const content = (
      await payload.find({
        collection: 'content',
        where: { site: { equals: site.id } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    const thread = await getOrCreateCommentThread(payload as never, {
      siteId: site.id,
      canonicalContentId: String(content.id),
    })
    await createCanonicalComment(payload as never, {
      threadId: thread.id,
      authorId: alice,
      authorType: 'member',
      bodyRaw: `Owned ${suffix}`,
      bodyHtml: '<p>Owned</p>',
    })
    await createCanonicalComment(payload as never, {
      threadId: thread.id,
      authorId: outsider,
      authorType: 'member',
      bodyRaw: `Foreign ${suffix}`,
      bodyHtml: '<p>Foreign</p>',
    })
    const conversation = await startDirectConversation(payload, {
      siteId: site.id,
      memberId: alice,
      recipientMemberId: bob,
    })
    await sendConversationMessage(payload, {
      siteId: site.id,
      conversationId: conversation.id,
      senderId: alice,
      body: `Private owned ${suffix}`,
      idempotencyKey: `message-${suffix}`,
    })
    const data = (await exportMemberData(payload as never, alice)) as any
    expect(data.schemaVersion).toBe(2)
    expect(data.contributions.comments.some((row: any) => row.body_raw === `Owned ${suffix}`)).toBe(
      true,
    )
    expect(JSON.stringify(data)).not.toContain(`Foreign ${suffix}`)
    expect(
      data.conversations.messages.some((row: any) =>
        row.body_html.includes(`Private owned ${suffix}`),
      ),
    ).toBe(true)
    expect(JSON.stringify(data)).not.toContain(`bob-${suffix}@example.test`)
    const empty = (await exportMemberData(payload as never, outsider)) as any
    expect(empty.conversations.messages).toEqual([])
  })
  it('exports more than one page of contributions and messages, while a removed member gets own sent text but no foreign history', async () => {
    const content = (
      await payload.find({
        collection: 'content',
        where: { site: { equals: site.id } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    const thread = await getOrCreateCommentThread(payload as never, {
      siteId: site.id,
      canonicalContentId: String(content.id),
    })
    const group = (await (
      await import('../../src/modules/community/conversation-composer')
    ).createGroupConversation(payload, {
      siteId: site.id,
      creatorMemberId: alice,
      memberIds: [bob],
      title: `Large export ${suffix}`,
    })) as any
    for (let index = 0; index < 501; index++) {
      await createCanonicalComment(payload as never, {
        threadId: thread.id,
        authorId: alice,
        authorType: 'member',
        bodyRaw: `Bulk own ${suffix} ${index}`,
        bodyHtml: '<p>Own</p>',
      })
      await sendConversationMessage(payload, {
        siteId: site.id,
        conversationId: group.id,
        senderId: alice,
        body: `Bulk private ${suffix} ${index}`,
        idempotencyKey: `bulk-${suffix}-${index}`,
      })
    }
    await sendConversationMessage(payload, {
      siteId: site.id,
      conversationId: group.id,
      senderId: bob,
      body: `Bob own ${suffix}`,
      idempotencyKey: `bob-own-${suffix}`,
    })
    const data = (await exportMemberData(payload as never, alice)) as any
    expect(
      data.contributions.comments.filter((row: any) =>
        row.body_raw.startsWith(`Bulk own ${suffix}`),
      ),
    ).toHaveLength(501)
    expect(
      data.conversations.messages.filter((row: any) =>
        row.body_html.includes(`Bulk private ${suffix}`),
      ),
    ).toHaveLength(501)
    await (
      await import('../../src/modules/community/conversation-composer')
    ).administerGroupConversation(payload, {
      siteId: site.id,
      conversationId: group.id,
      actorMemberId: bob,
      action: 'leave',
    })
    const removed = (await exportMemberData(payload as never, bob)) as any
    expect(
      removed.conversations.messages.some((row: any) =>
        row.body_html.includes(`Bob own ${suffix}`),
      ),
    ).toBe(true)
    expect(
      removed.conversations.messages.some((row: any) =>
        row.body_html.includes(`Bulk private ${suffix}`),
      ),
    ).toBe(false)
  }, 120_000)
})
