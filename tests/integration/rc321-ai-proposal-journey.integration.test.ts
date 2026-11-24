/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { credentialCipher } from '../../src/modules/ai/connections'
import { importMarkdownToRichText } from '../../src/modules/editorial/markdown'
import { POST as createProposal } from '../../src/app/(frontend)/api/admin/ai/proposals/route'
import { PATCH as decideProposal } from '../../src/app/(frontend)/api/admin/ai/proposals/[id]/route'

let payload: Payload
let server: Server
let siteA: any
let siteB: any
let publicationA: any
let staffHeaders: Headers
let staffUserId: string
let noGrantHeaders: Headers
let connectionId: string
const previousKey = process.env.AI_CREDENTIAL_KEY_BASE64URL

const relationId = (value: unknown): string =>
  value && typeof value === 'object' ? String((value as any).id ?? '') : String(value ?? '')

async function makeSession(user: any): Promise<Headers> {
  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return new Headers({
    'content-type': 'application/json',
    cookie: `renegade-passkey=${session.token}`,
  })
}

async function makeStaff(site: any, suffix: string, grant: boolean) {
  const member = await payload.create({
    collection: 'members',
    data: {
      displayName: `RC321 ${suffix}`,
      email: `rc321-${suffix}@example.test`,
      status: 'active',
    },
    overrideAccess: true,
  } as never)
  const user = await payload.create({
    collection: 'users',
    data: { email: `rc321-${suffix}@example.test`, role: 'staff', member: (member as any).id },
    context: { skipEnrollmentToken: true, seeding: true },
    overrideAccess: true,
  })
  if (grant) {
    const existing = await payload.find({
      collection: 'member-site-roles',
      where: {
        and: [{ member: { equals: (member as any).id } }, { site: { equals: site.id } }],
      },
      overrideAccess: true,
    } as never)
    if (!existing.docs.length) {
      await payload.create({
        collection: 'member-site-roles',
        data: { member: (member as any).id, site: site.id, role: 'contributor' },
        overrideAccess: true,
      } as never)
    }
  }
  return user as any
}

async function makeArticle(suffix: string) {
  return (await payload.create({
    collection: 'content',
    data: {
      site: siteA.id,
      publication: publicationA.id,
      contentType: 'article',
      title: `RC321 journey ${suffix}`,
      slug: `rc321-journey-${suffix}`,
      status: 'draft',
      visibility: 'public',
      summary: 'Original summary.',
      body: importMarkdownToRichText('Original passage.').document.document,
    },
    overrideAccess: true,
  } as never)) as any
}

async function companionOf(contentId: string) {
  const found = await payload.find({
    collection: 'article-family-content' as never,
    where: { content: { equals: contentId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs[0] as any
}

async function revisionsOf(articleId: string) {
  const found = await payload.find({
    collection: 'revision-records' as never,
    where: { article: { equals: articleId } },
    sort: 'sequence',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs as any[]
}

async function postProposal(
  headers: Headers | undefined,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any }> {
  const response = await createProposal(
    new Request('http://localhost:3000/api/admin/ai/proposals', {
      method: 'POST',
      headers: headers ?? new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    }),
  )
  return { status: response.status, json: await response.json().catch(() => ({})) }
}

async function patchProposal(
  headers: Headers | undefined,
  id: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any }> {
  const response = await decideProposal(
    new Request(`http://localhost:3000/api/admin/ai/proposals/${id}`, {
      method: 'PATCH',
      headers: headers ?? new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
  return { status: response.status, json: await response.json().catch(() => ({})) }
}

const readContent = (id: string) =>
  payload.findByID({ collection: 'content', id, depth: 0, overrideAccess: true }) as Promise<any>

const readProposal = (id: string) =>
  payload.findByID({
    collection: 'ai-proposals' as never,
    id,
    depth: 0,
    overrideAccess: true,
  }) as Promise<any>

beforeAll(async () => {
  process.env.AI_CREDENTIAL_KEY_BASE64URL = Buffer.alloc(32, 9).toString('base64url')
  server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/tags') {
      response.end(JSON.stringify({ models: [{ name: 'fixture' }] }))
      return
    }
    if (request.url !== '/api/generate') {
      response.writeHead(404)
      response.end('{}')
      return
    }
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const input = JSON.parse(raw) as { prompt: string; format?: string }
    let output = 'Ready.'
    if (input.format === 'json') {
      output = input.prompt.includes('title and description')
        ? JSON.stringify({
            title: 'A better search title',
            description: 'A clear summary of this local test article.',
          })
        : JSON.stringify({ ok: true })
    } else if (input.prompt.includes('Revise the selected passage')) output = 'Revised passage.'
    response.end(JSON.stringify({ response: output, prompt_eval_count: 40, eval_count: 12 }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port

  payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)
  siteA = await payload.create({
    collection: 'sites',
    data: {
      name: 'RC321 site A',
      slug: `rc321-a-${suffix}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['thumbs_up', 'heart', 'insightful', 'applause'],
    },
    overrideAccess: true,
  })
  siteB = await payload.create({
    collection: 'sites',
    data: {
      name: 'RC321 site B',
      slug: `rc321-b-${suffix}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['thumbs_up', 'heart', 'insightful', 'applause'],
    },
    overrideAccess: true,
  })
  publicationA = (
    await payload.find({
      collection: 'publications',
      where: { site: { equals: siteA.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  expect(publicationA).toBeTruthy()

  const staff = await makeStaff(siteA, `staff-${suffix}`, true)
  staffUserId = String(staff.id)
  staffHeaders = await makeSession(staff)
  const noGrant = await makeStaff(siteA, `plain-${suffix}`, false)
  noGrantHeaders = await makeSession(noGrant)

  const connection = (await payload.create({
    collection: 'ai-connections' as never,
    data: {
      site: siteA.id,
      label: `RC321 fixture ${suffix}`,
      providerKey: 'ai.ollama',
      endpoint: `http://127.0.0.1:${port}`,
      model: 'fixture',
      models: ['fixture'],
      capabilities: ['ai.text.rewrite', 'ai.text.structured'],
      allowedTasks: ['editor.improve-selection', 'intelligence.metadata-seo'],
      status: 'active',
      perTaskUsd: 1,
      monthlyUsd: 10,
      maxInputTokens: 10000,
      maxOutputTokens: 500,
      inputUsdPer1k: 0,
      outputUsdPer1k: 0,
      createdBy: staffUserId,
    } as never,
    overrideAccess: true,
  })) as any
  connectionId = String(connection.id)
  await payload.create({
    collection: 'ai-credentials' as never,
    data: {
      connection: connectionId,
      envelope: credentialCipher().encrypt({ apiKey: 'fixture-key' }),
    } as never,
    overrideAccess: true,
  })
})

afterAll(async () => {
  server?.close()
  await payload?.db.destroy?.()
  if (previousKey === undefined) delete process.env.AI_CREDENTIAL_KEY_BASE64URL
  else process.env.AI_CREDENTIAL_KEY_BASE64URL = previousKey
})

describe('RC3-21 AI proposal journey (route level)', () => {
  it('leaves the target byte-identical while a metadata-seo proposal is undecided, then decline changes nothing', async () => {
    const article = await makeArticle(randomUUID().slice(0, 8))
    const before = JSON.stringify(await readContent(article.id))

    const created = await postProposal(staffHeaders, {
      task: 'intelligence.metadata-seo',
      targetId: article.id,
      siteId: siteA.id,
      connectionId,
    })
    expect(created.status, JSON.stringify(created.json)).toBe(200)
    expect(created.json.proposal.status).toBe('ready')
    const proposalId = String(created.json.proposal.id)
    expect(JSON.stringify(await readContent(article.id))).toBe(before)

    const declined = await patchProposal(staffHeaders, proposalId, {
      siteId: siteA.id,
      decision: 'decline',
    })
    expect(declined.status, JSON.stringify(declined.json)).toBe(200)
    expect(JSON.stringify(await readContent(article.id))).toBe(before)
    const saved = await readProposal(proposalId)
    expect(saved.status).toBe('declined')
    expect(relationId(saved.decidedBy)).toBe(staffUserId)
    expect(saved.decidedAt).toBeTruthy()
  })

  it('applying metadata-seo updates the SEO fields and persists a NEW revision owned by the approver', async () => {
    const article = await makeArticle(randomUUID().slice(0, 8))
    const companionBefore = await companionOf(article.id)
    const preRevisionId = relationId(companionBefore.currentRevision)
    const preSequence = Number(companionBefore.currentRevisionSequence)
    const preRevisions = await revisionsOf(companionBefore.id)
    expect(preRevisionId).toBeTruthy()

    const created = await postProposal(staffHeaders, {
      task: 'intelligence.metadata-seo',
      targetId: article.id,
      siteId: siteA.id,
      connectionId,
    })
    expect(created.status, JSON.stringify(created.json)).toBe(200)
    const proposalId = String(created.json.proposal.id)

    const applied = await patchProposal(staffHeaders, proposalId, {
      siteId: siteA.id,
      decision: 'apply',
    })
    expect(applied.status, JSON.stringify(applied.json)).toBe(200)
    expect(applied.json.proposal.status).toBe('applied')

    const updated = await readContent(article.id)
    expect(updated.seoTitle).toBe('A better search title')
    expect(updated.seoDescription).toBe('A clear summary of this local test article.')

    const application = applied.json.proposal.application
    expect(application.revisionId).toBeTruthy()
    expect(application.revisionId).not.toBe(preRevisionId)
    // AI provenance: the revision schema has no field for it, so it is
    // recorded on the proposal's application object.
    expect(application.proposalId).toBe(proposalId)
    expect(application.auditId).toBeTruthy()
    expect(application.providerKey).toBe('ai.ollama')
    expect(application.actorId).toBe(staffUserId)

    const revisions = await revisionsOf(companionBefore.id)
    expect(revisions.length).toBe(preRevisions.length + 1)
    const fresh = revisions.find((revision) => String(revision.id) === application.revisionId)
    expect(fresh, 'application.revisionId must name the newly persisted revision').toBeTruthy()
    expect(Number(fresh.sequence)).toBe(preSequence + 1)
    expect(relationId(fresh.parentRevision)).toBe(preRevisionId)
    expect(relationId(fresh.createdBy)).toBe(staffUserId)

    const companionAfter = await companionOf(article.id)
    expect(relationId(companionAfter.currentRevision)).toBe(application.revisionId)
    expect(Number(companionAfter.currentRevisionSequence)).toBe(preSequence + 1)

    const saved = await readProposal(proposalId)
    expect(saved.status).toBe('applied')
    expect((saved.application as any).revisionId).toBe(application.revisionId)
  })

  it('applying improve-selection changes the body, creates a revision and increments the sequence', async () => {
    const article = await makeArticle(randomUUID().slice(0, 8))
    const companionBefore = await companionOf(article.id)
    const preRevisionId = relationId(companionBefore.currentRevision)
    const preSequence = Number(companionBefore.currentRevisionSequence)

    const created = await postProposal(staffHeaders, {
      task: 'editor.improve-selection',
      targetId: article.id,
      siteId: siteA.id,
      connectionId,
      selection: 'Original passage.',
    })
    expect(created.status, JSON.stringify(created.json)).toBe(200)
    const proposalId = String(created.json.proposal.id)

    const applied = await patchProposal(staffHeaders, proposalId, {
      siteId: siteA.id,
      decision: 'apply',
    })
    expect(applied.status, JSON.stringify(applied.json)).toBe(200)

    const updated = await readContent(article.id)
    expect(JSON.stringify(updated.body)).toContain('Revised passage.')
    const application = applied.json.proposal.application
    expect(application.revisionId).toBeTruthy()
    expect(application.revisionId).not.toBe(preRevisionId)
    const companionAfter = await companionOf(article.id)
    expect(Number(companionAfter.currentRevisionSequence)).toBe(preSequence + 1)
    expect(relationId(companionAfter.currentRevision)).toBe(application.revisionId)
    const revisions = await revisionsOf(companionBefore.id)
    expect(revisions.some((revision) => String(revision.id) === application.revisionId)).toBe(true)
  })

  it('refuses replay of a decided proposal (409) and apply of a stale proposal (409)', async () => {
    const article = await makeArticle(randomUUID().slice(0, 8))
    const created = await postProposal(staffHeaders, {
      task: 'intelligence.metadata-seo',
      targetId: article.id,
      siteId: siteA.id,
      connectionId,
    })
    expect(created.status, JSON.stringify(created.json)).toBe(200)
    const proposalId = String(created.json.proposal.id)
    const applied = await patchProposal(staffHeaders, proposalId, {
      siteId: siteA.id,
      decision: 'apply',
    })
    expect(applied.status, JSON.stringify(applied.json)).toBe(200)
    const replay = await patchProposal(staffHeaders, proposalId, {
      siteId: siteA.id,
      decision: 'apply',
    })
    expect(replay.status).toBe(409)

    // Stale: target edited after the proposal was created.
    const staleArticle = await makeArticle(randomUUID().slice(0, 8))
    const staleCreated = await postProposal(staffHeaders, {
      task: 'intelligence.metadata-seo',
      targetId: staleArticle.id,
      siteId: siteA.id,
      connectionId,
    })
    expect(staleCreated.status, JSON.stringify(staleCreated.json)).toBe(200)
    const staleId = String(staleCreated.json.proposal.id)
    await payload.update({
      collection: 'content',
      id: staleArticle.id,
      data: { summary: 'Edited after the proposal was created.' } as never,
      overrideAccess: true,
    })
    const staleApply = await patchProposal(staffHeaders, staleId, {
      siteId: siteA.id,
      decision: 'apply',
    })
    expect(staleApply.status).toBe(409)
    const staleSaved = await readProposal(staleId)
    expect(staleSaved.status).toBe('ready')
    const staleContent = await readContent(staleArticle.id)
    expect(staleContent.seoTitle ?? null).toBeNull()
  })

  it('refuses cross-site decides (403) and unauthenticated / ungranted access', async () => {
    const article = await makeArticle(randomUUID().slice(0, 8))
    const created = await postProposal(staffHeaders, {
      task: 'intelligence.metadata-seo',
      targetId: article.id,
      siteId: siteA.id,
      connectionId,
    })
    expect(created.status, JSON.stringify(created.json)).toBe(200)
    const proposalId = String(created.json.proposal.id)

    const crossSite = await patchProposal(staffHeaders, proposalId, {
      siteId: siteB.id,
      decision: 'apply',
    })
    expect(crossSite.status).toBe(403)

    const crossSiteCreate = await postProposal(staffHeaders, {
      task: 'intelligence.metadata-seo',
      targetId: article.id,
      siteId: siteB.id,
      connectionId,
    })
    expect(crossSiteCreate.status).toBe(403)

    const unauthCreate = await postProposal(undefined, {
      task: 'intelligence.metadata-seo',
      targetId: article.id,
      siteId: siteA.id,
      connectionId,
    })
    expect(unauthCreate.status).toBe(403)
    const unauthDecide = await patchProposal(undefined, proposalId, {
      siteId: siteA.id,
      decision: 'apply',
    })
    expect(unauthDecide.status).toBe(403)

    // A signed-in staff user with no grant on this site (plain member of the
    // install, no member-site-role for site A) is refused as well.
    const ungranted = await patchProposal(noGrantHeaders, proposalId, {
      siteId: siteA.id,
      decision: 'apply',
    })
    expect(ungranted.status).toBe(403)

    const saved = await readProposal(proposalId)
    expect(saved.status).toBe('ready')
  })
})
