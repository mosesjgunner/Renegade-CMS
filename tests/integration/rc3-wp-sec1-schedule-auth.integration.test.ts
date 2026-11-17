/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WP-SEC-1 (Red R-2) — calendar schedule route authorization regression suite.
 *
 * The defect: POST /api/admin/calendar/schedule built the editorial actor
 * from a body-supplied `role`, so any plain staff account could send
 * "role":"publisher" and satisfy EditorialWorkflow.schedule's publisher
 * requirement. The actor must derive ONLY from the authenticated session:
 * owner/administrator -> publisher, staff -> editor. A supplied role, actor
 * or user id in the request body must have no effect.
 *
 * Seams: the Payload client, the operator-grant record check and the
 * editorial persistence functions are mocked (the house pattern from
 * integrations-admin-api.integration.test.ts) so the route's actor
 * construction is observed directly. The final test chains the actor the
 * route actually produced into the REAL EditorialWorkflow, whose publisher
 * requirement is additionally locked by
 * tests/unit/editorial-workflow-permissions.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const scheduleCalls: any[] = []
const cancelCalls: any[] = []
let recordAccess = true

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(async () => ({
    id: 'art-1',
    title: 'Approved Article',
    lifecycle: 'approved',
    currentRevisionSequence: 1,
    site: 'site-a',
    publication: null,
    scheduledFor: null,
    timeZone: null,
  })),
  create: vi.fn(async (args: any) => ({ id: 'audit-1', ...args.data })),
  db: {
    beginTransaction: vi.fn(async () => 'tx-1'),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => undefined),
  },
  jobs: { queue: vi.fn(async () => ({ id: 'job-1' })) },
}

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
  createLocalReq: vi.fn(async () => ({})),
}))
vi.mock('../../src/modules/operations/operator-grants', () => ({
  checkOperatorRecordAccess: vi.fn(async () => recordAccess),
}))
vi.mock('../../src/modules/editorial/persistence', () => ({
  scheduleEditorialPublication: vi.fn(async (_payload: any, input: any) => {
    scheduleCalls.push(input)
    return {}
  }),
  cancelScheduledPublication: vi.fn(async (_payload: any, input: any) => {
    cancelCalls.push(input)
    return {}
  }),
}))

import { POST } from '../../src/app/(frontend)/api/admin/calendar/schedule/route'
import { EditorialPermissionError, EditorialWorkflow } from '../../src/modules/editorial/workflow'
import { hashRichTextDocument, type RichTextDocument } from '../../src/modules/editorial/contracts'

const asUser = (id: string, role: string) =>
  mockPayload.auth.mockResolvedValue({ user: { id, role } })

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('http://localhost/api/admin/calendar/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const scheduleBody = { action: 'schedule', sourceId: 'art-1', startsAt: '2027-02-01T09:00' }

describe('WP-SEC-1 calendar schedule route — actor derives from session only', () => {
  beforeEach(() => {
    scheduleCalls.length = 0
    cancelCalls.length = 0
    recordAccess = true
    vi.clearAllMocks()
    // clearAllMocks wipes implementations; restore the record-access default.
    recordAccess = true
  })

  it('REPRODUCTION: plain staff + forged "role":"publisher" must NOT become publisher', async () => {
    asUser('staff-1', 'staff')
    const res = await post({ ...scheduleBody, role: 'publisher' })
    expect(res.status).toBe(200)
    expect(scheduleCalls).toHaveLength(1)
    expect(scheduleCalls[0].actor).toEqual({ id: 'staff-1', role: 'editor' })
    expect(scheduleCalls[0].actorUserId).toBe('staff-1')
  })

  it('the actor the route hands a forged-role staff request is refused by the real workflow', async () => {
    asUser('staff-1', 'staff')
    await post({ ...scheduleBody, role: 'publisher' })
    const actor = scheduleCalls[0].actor as { id: string; role: 'editor' }

    const document: RichTextDocument = (() => {
      const raw = { root: { children: [{ text: 'Proof', type: 'paragraph' }], type: 'root' } }
      return {
        format: 'payload-lexical',
        schemaVersion: 1,
        document: raw,
        canonicalHash: hashRichTextDocument(raw),
        plainTextProjection: 'Proof',
        unknownNodePolicy: 'preserve',
      } as RichTextDocument
    })()
    const flow = new EditorialWorkflow({
      document,
      author: { id: 'author-1', role: 'author' },
    })
    flow.requestReview({ id: 'author-1', role: 'author' })
    flow.decideReview({ id: 'editor-1', role: 'editor' }, true)
    expect(() =>
      flow.schedule(actor, '2027-02-01T15:00:00Z', 'America/Chicago', 'sched-proof'),
    ).toThrow(EditorialPermissionError)
  })

  it('staff without a role field is an editor', async () => {
    asUser('staff-2', 'staff')
    await post(scheduleBody)
    expect(scheduleCalls[0].actor).toEqual({ id: 'staff-2', role: 'editor' })
  })

  it('staff forged role on cancel is also an editor', async () => {
    asUser('staff-1', 'staff')
    const res = await post({ action: 'cancel', sourceId: 'art-1', role: 'publisher' })
    expect(res.status).toBe(200)
    expect(cancelCalls).toHaveLength(1)
    expect(cancelCalls[0].actor).toEqual({ id: 'staff-1', role: 'editor' })
  })

  it('body-supplied actor / actorUserId spoofing is ignored', async () => {
    asUser('staff-1', 'staff')
    await post({
      action: 'cancel',
      sourceId: 'art-1',
      role: 'publisher',
      actorUserId: 'victim-9',
      actor: { id: 'victim-9', role: 'publisher' },
    })
    expect(cancelCalls[0].actor).toEqual({ id: 'staff-1', role: 'editor' })
    expect(cancelCalls[0].actorUserId).toBe('staff-1')
  })

  it('administrator schedules as publisher without any body role', async () => {
    asUser('admin-1', 'administrator')
    const res = await post(scheduleBody)
    expect(res.status).toBe(200)
    expect(scheduleCalls[0].actor).toEqual({ id: 'admin-1', role: 'publisher' })
  })

  it('administrator body role is ignored (no body-driven downgrade or upgrade)', async () => {
    asUser('admin-1', 'administrator')
    await post({ ...scheduleBody, role: 'editor' })
    expect(scheduleCalls[0].actor).toEqual({ id: 'admin-1', role: 'publisher' })
  })

  it('owner schedules as publisher', async () => {
    asUser('owner-1', 'owner')
    const res = await post(scheduleBody)
    expect(res.status).toBe(200)
    expect(scheduleCalls[0].actor).toEqual({ id: 'owner-1', role: 'publisher' })
  })

  it('legitimate publisher cancel works', async () => {
    asUser('admin-1', 'administrator')
    const res = await post({ action: 'cancel', sourceId: 'art-1' })
    expect(res.status).toBe(200)
    expect(cancelCalls[0].actor).toEqual({ id: 'admin-1', role: 'publisher' })
  })

  it('cross-site attempt (no record access for the article site) is denied before scheduling', async () => {
    asUser('admin-1', 'administrator')
    recordAccess = false
    const res = await post(scheduleBody)
    expect(res.status).toBe(403)
    expect(scheduleCalls).toHaveLength(0)
    expect(cancelCalls).toHaveLength(0)
  })

  it('non-staff session role is rejected at the gate', async () => {
    asUser('member-1', 'subscriber')
    const res = await post({ ...scheduleBody, role: 'publisher' })
    expect(res.status).toBe(403)
    expect(scheduleCalls).toHaveLength(0)
  })
})
