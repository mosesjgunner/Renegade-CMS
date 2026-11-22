/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  createRepurposeDraft,
  decideRepurposeDraft,
  getRepurposeDraft,
  listRepurposeDrafts,
} from '../../src/modules/editorial/repurpose'
import {
  assertFixtureSafeDatabase,
  buildRc2World,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

/**
 * RC3-14 / DEBT-04: the deterministic repurpose workflow, proven at the
 * persisted-record level. Staging writes nothing to any target
 * collection; approval materializes the derivative as a DRAFT (never
 * published) carrying provenance back to the source; rejection
 * materializes nothing; a decided draft cannot be decided twice, so a
 * retry can never create a second derivative.
 */
describe('RC3-14: repurpose staging -> human approval -> draft materialization', () => {
  let payload: Payload
  let world: Rc2World
  const suffix = randomUUID().slice(0, 8)
  let sourceId: string

  const lexicalBody = (text: string) => ({
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          version: 1,
          format: '',
          indent: 0,
          direction: 'ltr',
          children: [
            { type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' },
          ],
        },
      ],
    },
  })

  async function countCollection(collection: string, where: any) {
    const result = await payload.find({
      collection: collection as never,
      where,
      limit: 0,
      depth: 0,
      overrideAccess: true,
    } as never)
    return (result as any).totalDocs as number
  }

  beforeAll(async () => {
    assertFixtureSafeDatabase(process.env.DATABASE_URL)
    payload = await getPayload({ config })
    world = await buildRc2World(payload)
    const source = (await payload.create({
      collection: 'content',
      data: {
        site: world.siteA.siteId,
        contentType: 'article',
        title: `Repurpose Source ${suffix}`,
        slug: `repurpose-source-${suffix}`,
        summary: 'A story about following public money through the ledger.',
        status: 'published',
        publishedAt: new Date().toISOString(),
        body: lexicalBody(
          'The committee authorized the funds in March. The agency distributed them in June. ' +
            'The contractor spent them by September, and the ledger shows every step.',
        ),
      },
      overrideAccess: true,
    } as never)) as any
    sourceId = String(source.id)
  }, 240_000)

  afterAll(async () => {
    if (payload && world) await teardownRc2World(payload, world)
  })

  it('stages a draft with provenance and writes nothing to the target collection', async () => {
    const draftsBefore = await countCollection('social-drafts', {
      sourceContent: { equals: sourceId },
    })
    const staged = await createRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      sourceContentId: sourceId,
      targetKind: 'social-post',
    })
    expect(staged.status).toBe('pending-approval')
    expect(staged.provenance).toMatchObject({
      taskKey: 'content.repurpose',
      deriver: 'deterministic-v1',
      sourceContentId: sourceId,
      targetKind: 'social-post',
    })
    expect(staged.sourceChecksum).toMatch(/^[a-f0-9]{64}$/)
    expect(staged.draftText).toContain('The committee authorized the funds')
    // The persisted readback returns the same record.
    const readback = await getRepurposeDraft(payload, staged.id)
    expect(readback?.id).toBe(staged.id)
    expect(readback?.status).toBe('pending-approval')
    // Nothing materialized anywhere yet.
    expect(await countCollection('social-drafts', { sourceContent: { equals: sourceId } })).toBe(
      draftsBefore,
    )
    expect(staged.materializedId).toBeUndefined()
  })

  it('approval materializes a DRAFT social post carrying provenance; a second decision is refused', async () => {
    const staged = await createRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      sourceContentId: sourceId,
      targetKind: 'social-post',
    })
    const decided = await decideRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      draftId: staged.id,
      decision: 'approve',
    })
    expect(decided.status).toBe('approved')
    expect(decided.decidedByMemberId).toBe(world.siteA.owner.memberId)
    expect(decided.materializedCollection).toBe('social-drafts')

    const materialized = (await payload.findByID({
      collection: 'social-drafts' as never,
      id: decided.materializedId!,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(materialized.status).toBe('draft')
    expect(String(materialized.sourceContent?.id ?? materialized.sourceContent)).toBe(sourceId)
    expect(materialized.provenance).toMatchObject({
      taskKey: 'content.repurpose',
      sourceContentId: sourceId,
      repurposeDraftId: staged.id,
    })
    expect(materialized.provenance.derivedText).toContain('The committee authorized')

    await expect(
      decideRepurposeDraft(payload, {
        siteId: world.siteA.siteId,
        actorMemberId: world.siteA.owner.memberId,
        draftId: staged.id,
        decision: 'approve',
      }),
    ).rejects.toMatchObject({ code: 'REPURPOSE_ALREADY_DECIDED' })
    // Still exactly one derivative for this staged draft.
    const listed = await listRepurposeDrafts(payload, {
      siteId: world.siteA.siteId,
      status: 'approved',
    })
    expect(listed.filter((row) => row.id === staged.id)).toHaveLength(1)
  })

  it('approval of a newsletter section materializes a draft email message, never a sent one', async () => {
    const staged = await createRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      sourceContentId: sourceId,
      targetKind: 'newsletter-section',
    })
    const decided = await decideRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      draftId: staged.id,
      decision: 'approve',
    })
    const message = (await payload.findByID({
      collection: 'email-messages' as never,
      id: decided.materializedId!,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(message.status).toBe('draft')
    expect(JSON.stringify(message.blocks)).toContain('The committee authorized')
  })

  it('approval of an article draft materializes a draft content record', async () => {
    const staged = await createRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      sourceContentId: sourceId,
      targetKind: 'article-draft',
    })
    const decided = await decideRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      draftId: staged.id,
      decision: 'approve',
    })
    const doc = (await payload.findByID({
      collection: 'content',
      id: decided.materializedId!,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(doc.status).toBe('draft')
    expect(doc.title).toBe(`Repurpose Source ${suffix}`)
  })

  it('rejection materializes nothing', async () => {
    const before = await countCollection('social-drafts', {
      sourceContent: { equals: sourceId },
    })
    const staged = await createRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      sourceContentId: sourceId,
      targetKind: 'social-post',
    })
    const decided = await decideRepurposeDraft(payload, {
      siteId: world.siteA.siteId,
      actorMemberId: world.siteA.owner.memberId,
      draftId: staged.id,
      decision: 'reject',
    })
    expect(decided.status).toBe('rejected')
    expect(decided.materializedId).toBeUndefined()
    expect(await countCollection('social-drafts', { sourceContent: { equals: sourceId } })).toBe(
      before,
    )
  })

  it('refuses non-staff actors, plain members, other sites staff, and unpublished sources', async () => {
    await expect(
      createRepurposeDraft(payload, {
        siteId: world.siteA.siteId,
        actorMemberId: world.siteA.member.memberId,
        sourceContentId: sourceId,
        targetKind: 'social-post',
      }),
    ).rejects.toMatchObject({ code: 'REPURPOSE_STAFF_REQUIRED' })
    await expect(
      createRepurposeDraft(payload, {
        siteId: world.siteA.siteId,
        actorMemberId: world.siteB.owner.memberId,
        sourceContentId: sourceId,
        targetKind: 'social-post',
      }),
    ).rejects.toMatchObject({ code: 'REPURPOSE_NO_STANDING' })
    await expect(
      createRepurposeDraft(payload, {
        siteId: world.siteB.siteId,
        actorMemberId: world.siteB.owner.memberId,
        sourceContentId: sourceId,
        targetKind: 'social-post',
      }),
    ).rejects.toMatchObject({ code: 'REPURPOSE_SOURCE_SITE_MISMATCH' })

    const draftSource = (await payload.create({
      collection: 'content',
      data: {
        site: world.siteA.siteId,
        contentType: 'article',
        title: `Unpublished Source ${suffix}`,
        slug: `unpublished-source-${suffix}`,
        summary: 'Not yet public.',
        status: 'draft',
      },
      overrideAccess: true,
    } as never)) as any
    await expect(
      createRepurposeDraft(payload, {
        siteId: world.siteA.siteId,
        actorMemberId: world.siteA.owner.memberId,
        sourceContentId: String(draftSource.id),
        targetKind: 'social-post',
      }),
    ).rejects.toMatchObject({ code: 'REPURPOSE_SOURCE_NOT_PUBLISHED' })
  })
})
