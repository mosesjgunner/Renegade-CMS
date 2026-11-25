/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { POST } from '../../src/app/(frontend)/api/admin/integrations/route'

// RC3-21 DEBT-02 / #60: the mounted `content.draft.read` agent tool.
//
// Pattern note: this follows the established mocked-Payload pattern of
// tests/integration/integrations-admin-api.integration.test.ts, which is the
// existing suite for this exact route. That pattern is used here because the
// route's grant resolution short-circuits on the auth user (owner fallback /
// explicit authorizedSiteIds) and every Payload call the action makes
// (findByID + audit create) is observable against the mock store, including
// the persisted audit rows these cases assert on.

const mockContent: any[] = []
const mockAuditEvents: any[] = []

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(async () => ({ docs: [] })),
  findByID: vi.fn(async (args: any) => {
    if (args.collection !== 'content') return null
    const found = mockContent.find((item) => String(item.id) === String(args.id))
    return found || null
  }),
  create: vi.fn(async (args: any) => {
    const doc = { id: `doc_${Date.now()}_${Math.random()}`, ...args.data }
    if (args.collection === 'integration-audit-events') mockAuditEvents.push(doc)
    return doc
  }),
}

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
}))

const post = (body: Record<string, unknown>) =>
  POST(
    new Request('http://localhost/api/admin/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const draftDoc = {
  id: 'content-1',
  site: 'site-1',
  publication: 'pub-1',
  space: 'space-1',
  title: 'Draft under review',
  status: 'draft',
  contentType: 'article',
  canonicalPath: '/drafts/under-review',
  updatedAt: '2026-11-24T10:00:00.000Z',
  // Canary draft body: the summary projection must never leak it.
  body: 'SECRET-DRAFT-BODY-CANARY',
}

describe('RC3-21 agent mount: agent.draft-read on /api/admin/integrations', () => {
  beforeEach(() => {
    mockContent.length = 0
    mockAuditEvents.length = 0
    mockPayload.auth.mockReset()
    // Global owner (installation fallback), as in the sibling suite.
    mockPayload.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'owner' } })
  })

  it('(a) rejects unauthenticated and non-staff callers with 403 and writes no audit row', async () => {
    mockContent.push({ ...draftDoc })

    mockPayload.auth.mockResolvedValueOnce({ user: null })
    const unauthenticated = await post({
      action: 'agent.draft-read',
      siteId: 'site-1',
      contentId: 'content-1',
    })
    expect(unauthenticated.status).toBe(403)

    mockPayload.auth.mockResolvedValueOnce({ user: { id: 'user-1', role: 'subscriber' } })
    const nonStaff = await post({
      action: 'agent.draft-read',
      siteId: 'site-1',
      contentId: 'content-1',
    })
    expect(nonStaff.status).toBe(403)

    expect(mockAuditEvents).toHaveLength(0)
  })

  it('(b) denies an operator without a grant for the target site and persists a denied audit row', async () => {
    mockPayload.auth.mockResolvedValue({
      user: { id: 'admin-2', role: 'administrator', authorizedSiteIds: ['site-1'] },
    })
    mockContent.push({ ...draftDoc, id: 'content-2', site: 'site-2' })

    const res = await post({
      action: 'agent.draft-read',
      siteId: 'site-2',
      contentId: 'content-2',
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.output).toBeNull()
    expect(body.run.status).toBe('denied')

    expect(mockAuditEvents).toHaveLength(1)
    const audit = mockAuditEvents[0]
    expect(audit.action).toBe('agent.tool.content.draft.read')
    expect(audit.outcome).toBe('denied')
    expect(audit.site).toBe('site-2')
    expect(audit.subject.runId).toBe(body.run.id)
    expect(audit.subject.tool).toBe('content.draft.read')
    expect(audit.subject.targetCollection).toBe('content')
    expect(audit.subject.targetId).toBe('content-2')
  })

  it('(c) returns a summary-only projection for an in-scope draft and persists an allowed audit row', async () => {
    mockContent.push({ ...draftDoc })

    const res = await post({
      action: 'agent.draft-read',
      siteId: 'site-1',
      contentId: 'content-1',
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.run.status).toBe('completed')
    expect(body.output).toEqual({
      id: 'content-1',
      title: 'Draft under review',
      status: 'draft',
      contentType: 'article',
      canonicalPath: '/drafts/under-review',
      updatedAt: '2026-11-24T10:00:00.000Z',
    })
    // No draft body / rich text leaks through the summary projection.
    expect(JSON.stringify(body)).not.toContain('SECRET-DRAFT-BODY-CANARY')
    expect(body.output).not.toHaveProperty('body')

    expect(body.audit).toHaveLength(1)
    expect(body.audit[0].tool).toBe('content.draft.read')
    expect(body.audit[0].status).toBe('completed')

    expect(mockAuditEvents).toHaveLength(1)
    const audit = mockAuditEvents[0]
    expect(audit.action).toBe('agent.tool.content.draft.read')
    expect(audit.outcome).toBe('allowed')
    expect(audit.site).toBe('site-1')
    expect(audit.subject.runId).toBe(body.run.id)
    expect(audit.subject.auditId).toBe(body.audit[0].id)
    expect(audit.subject.targetId).toBe('content-1')
  })

  it('(d) denies when the content record belongs to a different site than requested, and audits the denial', async () => {
    mockContent.push({ ...draftDoc, id: 'content-3', site: 'site-2' })

    const res = await post({
      action: 'agent.draft-read',
      siteId: 'site-1',
      contentId: 'content-3',
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.output).toBeNull()
    expect(body.run.status).toBe('denied')
    expect(JSON.stringify(body)).not.toContain('SECRET-DRAFT-BODY-CANARY')

    expect(mockAuditEvents).toHaveLength(1)
    const audit = mockAuditEvents[0]
    expect(audit.action).toBe('agent.tool.content.draft.read')
    expect(audit.outcome).toBe('denied')
    expect(audit.subject.runId).toBe(body.run.id)
    expect(audit.subject.targetId).toBe('content-3')
  })
})
