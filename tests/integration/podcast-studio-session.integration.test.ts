/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-05 (POD-REQ-11, POD-REQ-12, POD-REQ-13 state layer) against
 * real Payload + Postgres:
 *
 * - The Example Show scaffold creates a show + starter studio
 *   session (rundown, one cart deck, export-profile placeholder).
 * - Session collection CRUD through src/modules/podcast-studio/
 *   sessions.ts: create → save/reload deep-equality of the stored
 *   document → state ops persist (an unarmed fire is rejected and
 *   its rejection lands in the persisted session log) → delete.
 * - OPML import/export through the op dispatch, incl. the conflict
 *   guard refusing a changed target.
 * - The studio API routes reject unauthenticated calls (401). The
 *   authenticated staff happy path through the routes needs
 *   passkey-session fixtures — the same limitation POD-03/POD-04
 *   recorded; all behaviour is proven through the module functions
 *   the routes call.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import {
  applySessionOperationToRecord,
  createExampleShow,
  createStudioSessionRecord,
  deleteStudioSessionRecord,
  listStudioSessionRecords,
  loadStudioSessionRecord,
  saveStudioSessionRecord,
} from '../../src/modules/podcast-studio/sessions'
import {
  GET as sessionsListGet,
  POST as sessionsCreatePost,
} from '../../src/app/(frontend)/api/podcast-studio/sessions/route'
import {
  GET as sessionGet,
  PATCH as sessionPatch,
} from '../../src/app/(frontend)/api/podcast-studio/sessions/[id]/route'
import { GET as sessionOpmlGet } from '../../src/app/(frontend)/api/podcast-studio/sessions/[id]/opml/route'
import { seed } from '../../src/scripts/seed'

let payload: Payload
let site: any
const runId = randomUUID().slice(0, 8)

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()
}, 120_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('POD-05 studio sessions — scaffold + collection CRUD', () => {
  it('Example Show scaffold creates a show with a starter session (rundown + deck + export profile)', async () => {
    const { show, record } = await createExampleShow(payload as never, {
      siteId: site.id,
      slugSuffix: `pod05-${runId}`,
    })
    expect(String(show.title)).toBe('Example Show')
    expect(record.showId).toBe(String(show.id))
    expect(record.siteId).toBe(String(site.id))
    expect(record.schemaVersion).toBe(1)
    expect(record.session.rundown).toHaveLength(5)
    expect(record.session.cartwall.banks).toHaveLength(1)
    expect(record.session.cartwall.banks[0].clips).toHaveLength(3)
    expect(record.session.exportProfile).toMatchObject({
      status: expect.stringContaining('placeholder'),
    })

    const listed = await listStudioSessionRecords(payload as never, String(show.id))
    expect(listed.map((entry) => entry.id)).toContain(record.id)
  })

  it('create → mid-show ops → save/reload deep-equality → delete', async () => {
    const show = await payload.create({
      collection: 'podcast-shows',
      data: {
        site: site.id,
        title: `POD-05 CRUD Show ${runId}`,
        slug: `pod05-crud-${runId}`,
        status: 'draft',
      } as any,
      overrideAccess: true,
    })
    const session = createSession({ showId: String(show.id), showTitle: String(show.title) })
    const record = await createStudioSessionRecord(payload as never, {
      siteId: site.id,
      showId: String(show.id),
      title: String(show.title),
      session,
    })
    expect(record.state).toBe('draft')
    expect(record.lastSavedAt).toBeTruthy()

    // State ops persist through the record layer.
    const started = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'add-item',
      item: { id: 'rd-1', title: 'Cold open', type: 'segment', plannedSec: 300 },
    })
    expect(started.applied.ok).toBe(true)
    await applySessionOperationToRecord(payload as never, record.id, {
      op: 'start-segment',
      itemId: 'rd-1',
    })
    await applySessionOperationToRecord(payload as never, record.id, { op: 'tick', sec: 330 })
    const completed = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'complete-segment',
      itemId: 'rd-1',
    })
    expect(completed.record.session.rundown[0]).toMatchObject({ status: 'done', actualSec: 330 })
    expect(completed.record.session.chapters).toHaveLength(1)

    // An unarmed fire is rejected and the rejection is in the persisted log.
    const fired = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'add-clip',
      bankId: completed.record.session.cartwall.banks[0].id,
      clip: { id: 'cart-1', title: 'Sting', cueOutSec: 8 },
    })
    expect(fired.applied.ok).toBe(true)
    const rejected = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'fire',
      clipId: 'cart-1',
    })
    expect(rejected.applied.ok).toBe(false)
    expect(rejected.applied.error).toBe('not-armed')
    expect(rejected.record.session.log.some((entry) => entry.type === 'cue-fire-rejected')).toBe(
      true,
    )

    // Save/reload through the collection is deep-equal to the in-memory document.
    const reloaded = await loadStudioSessionRecord(payload as never, record.id)
    expect(reloaded?.session).toEqual(rejected.record.session)
    const savedAgain = await saveStudioSessionRecord(
      payload as never,
      record.id,
      rejected.record.session,
    )
    expect(savedAgain.session).toEqual(rejected.record.session)

    await deleteStudioSessionRecord(payload as never, record.id)
    expect(await loadStudioSessionRecord(payload as never, record.id)).toBeNull()
  })

  it('OPML import/export through the op dispatch, with the conflict guard', async () => {
    const show = await payload.create({
      collection: 'podcast-shows',
      data: {
        site: site.id,
        title: `POD-05 OPML Show ${runId}`,
        slug: `pod05-opml-${runId}`,
        status: 'draft',
      } as any,
      overrideAccess: true,
    })
    const record = await createStudioSessionRecord(payload as never, {
      siteId: site.id,
      showId: String(show.id),
      title: String(show.title),
      session: createSession({ showId: String(show.id), showTitle: String(show.title) }),
    })
    const exported = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'export-opml',
    })
    expect(exported.applied.ok).toBe(true)
    expect(exported.applied.opml).toContain('<opml version="2.0">')

    const imported = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'import-opml',
      opml: exported.applied.opml ?? '',
    })
    expect(imported.applied.ok).toBe(true)
    expect(imported.record.session.rundownSourceHash).toBeTruthy()

    const conflict = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'export-opml',
      targetText: (exported.applied.opml ?? '') + '<!-- changed elsewhere -->',
    })
    expect(conflict.applied.ok).toBe(false)
    expect(conflict.applied.error).toBe('opml-conflict')
    expect(conflict.applied.conflict?.reason).toBe('target-changed-since-import')

    await deleteStudioSessionRecord(payload as never, record.id)
  })
})

describe('POD-05 studio API — auth denial', () => {
  it('rejects unauthenticated calls with 401 on every studio session route', async () => {
    const list = await sessionsListGet(
      new Request('http://localhost:3000/api/podcast-studio/sessions?showId=nope'),
    )
    expect(list.status).toBe(401)

    const create = await sessionsCreatePost(
      new Request('http://localhost:3000/api/podcast-studio/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId: 'nope' }),
      }),
    )
    expect(create.status).toBe(401)

    const one = await sessionGet(
      new Request('http://localhost:3000/api/podcast-studio/sessions/nope'),
      { params: Promise.resolve({ id: 'nope' }) },
    )
    expect(one.status).toBe(401)

    const patch = await sessionPatch(
      new Request('http://localhost:3000/api/podcast-studio/sessions/nope', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'stop-all' }),
      }),
      { params: Promise.resolve({ id: 'nope' }) },
    )
    expect(patch.status).toBe(401)

    const opml = await sessionOpmlGet(
      new Request('http://localhost:3000/api/podcast-studio/sessions/nope/opml'),
      { params: Promise.resolve({ id: 'nope' }) },
    )
    expect(opml.status).toBe(401)
  })

  it('the collection itself denies unauthenticated local-API reads', async () => {
    await expect(
      payload.find({
        collection: 'podcast-studio-sessions' as never,
        limit: 1,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/not allowed/i)
  })
})
