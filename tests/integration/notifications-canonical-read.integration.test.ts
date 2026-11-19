import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { GET, PATCH } from '../../src/app/(frontend)/api/community/notifications/route'
import {
  buildRc2World,
  loginAsMember,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

// RC2-H-03 (RC2-DEBT-21): the community notifications route must serve the
// canonical notifications collection as its single primary read. Before the
// consolidation, any row in the inbox_notifications table (written only by
// an unwired projector) SHADOWED the canonical list and switched the
// response's unread count to the inbox counter, hiding real notifications.
// DEBT-21 completion: the inbox store is retired entirely — the route no
// longer reads those tables at all, so the shadowing setup below is kept
// as regression bait: rows in the retired tables must have zero effect.
describe('community notifications route serves the canonical read (RC2-H-03)', () => {
  let world: Rc2World
  let payload: Awaited<ReturnType<typeof getPayload>>
  let canonicalNotificationId = ''
  let inboxRowId = ''

  const memberA = () => world.siteA.member

  // loginAsMember returns only the session cookie; the member CSRF pair is
  // a pure double-submit token, so the test composes it the way the real
  // client does (same value as cookie and header).
  const sessionHeaders = async (): Promise<Record<string, string>> => {
    const session = await loginAsMember(payload, memberA())
    const cookie = session.headers.get('cookie') ?? ''
    return {
      cookie: `${cookie}; renegade-member-csrf=h03-test-token`,
      'x-member-csrf': 'h03-test-token',
      host: world.siteA.host,
    }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    world = await buildRc2World(payload)
    const member = memberA()

    // A canonical notification for the member (activity event + notification).
    const activity = (await payload.create({
      collection: 'activity-events',
      data: {
        site: world.siteA.siteId,
        type: 'comment.created',
        actor: { system: true },
        object: { kind: 'comment' },
        payload: { note: 'canonical-notification' },
        occurredAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)) as { id: string }
    const notification = (await payload.create({
      collection: 'notifications',
      data: {
        activityEvent: activity.id,
        recipientMember: member.memberId,
        status: 'unread',
        channels: ['in-app'],
      },
      overrideAccess: true,
    } as never)) as { id: string }
    canonicalNotificationId = String(notification.id)

    // A row in the legacy inbox table for the same member, plus an inbox
    // counter claiming 7 unread — the shadowing setup.
    const pool = (
      payload.db as unknown as {
        pool: {
          query: (text: string, params: unknown[]) => Promise<{ rows: { id: string }[] }>
        }
      }
    ).pool
    const inserted = await pool.query(
      `INSERT INTO inbox_notifications (site_id, recipient_member_id, kind, target_type, target_id, snapshot)
       VALUES ($1, $2, 'comment.created.v1', 'comment', $3, '{"note":"inbox-shadow"}'::jsonb) RETURNING id`,
      [world.siteA.siteId, member.memberId, randomUUID()],
    )
    inboxRowId = String(inserted.rows[0].id)
    await pool.query(
      `INSERT INTO member_notification_counters (site_id, member_id, unread_count)
       VALUES ($1, $2, 7) ON CONFLICT (site_id, member_id) DO UPDATE SET unread_count = 7`,
      [world.siteA.siteId, member.memberId],
    )
  }, 600_000)

  afterAll(async () => {
    if (world) await teardownRc2World(payload, world)
  })

  const getNotifications = async (headers: Record<string, string>) => {
    const request = new Request(
      `http://127.0.0.1:39071/api/community/notifications?siteId=${world.siteA.siteId}`,
      { method: 'GET', headers },
    )
    const response = await GET(request)
    return { status: response.status, body: await response.json() }
  }

  it('returns the canonical notification even when inbox rows exist', async () => {
    const { status, body } = await getNotifications(await sessionHeaders())
    expect(status).toBe(200)
    // The primary list is the canonical notification — not the inbox row.
    expect(Array.isArray(body.notifications)).toBe(true)
    expect(body.notifications).toHaveLength(1)
    expect(String(body.notifications[0].id)).toBe(canonicalNotificationId)
    expect(String(body.notifications[0].id)).not.toBe(inboxRowId)
    expect(body.notifications[0].snapshot?.note).toBe('canonical-notification')
    // DEBT-21: the inbox compatibility field is gone — the retired
    // tables have no effect on the response at all.
    expect(body.inboxNotifications).toBeUndefined()
    // The unread count is the canonical count (1), never the inbox counter (7).
    expect(body.unreadCount).toBe(1)
  }, 120_000)

  it('mark-read reports the canonical unread count, with no inbox double-count', async () => {
    const headers = await sessionHeaders()
    const request = new Request('http://127.0.0.1:39071/api/community/notifications', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...headers,
        origin: world.siteA.origin,
      },
      body: JSON.stringify({ siteId: world.siteA.siteId }),
    })
    const response = await PATCH(request)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.unreadCount).toBe(0)

    const { body: after } = await getNotifications(headers)
    expect(after.unreadCount).toBe(0)
    expect(after.notifications[0].read).toBe(true)
  }, 120_000)
})
