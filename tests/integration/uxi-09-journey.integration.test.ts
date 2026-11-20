/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { resolveDiscoveryDocument } from '../../src/modules/public/discovery'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { PATCH as catalogTransition } from '../../src/app/(frontend)/api/admin/catalog/route'

// UXI-09 (Stage 5, workstream B) — cross-surface journey proof for the
// loops whose reachability/completeness was previously unproven at the
// seam between surfaces:
//
//   publishing: create (draft) → NOT publicly discoverable → publish →
//     discoverable through the same discovery resolver the public
//     article/archive pages use → revise → revised title is the public
//     one → unpublish → no longer discoverable (recovery).
//   commerce:   product draft → absent from the exact query the public
//     /store page runs → publish → present → archive → absent again.
//   media:      the /videos archive query starts empty for a new slug
//     (the UXI-D16 empty-state branch condition), a published public
//     video appears in the exact query /videos runs, and making it
//     private removes it again.
//
// The remaining families are covered by their existing suites, run in
// the same full integration pass (see UXI-09.md Continuation).

let payload: Payload
let site: any
let publication: any

const suffix = randomUUID().slice(0, 8)

beforeAll(async () => {
  payload = await getPayload({ config })
  site = await payload.create({
    collection: 'sites',
    data: {
      name: 'UXI-09 journey',
      slug: `uxi09-journey-${suffix}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['thumbs_up', 'heart', 'insightful', 'applause'],
    },
    overrideAccess: true,
  } as never)
  publication = (
    await payload.find({
      collection: 'publications',
      where: { site: { equals: site.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0]
  expect(publication).toBeTruthy()
}, 60_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

const body = (value: string) => ({
  root: {
    type: 'root',
    version: 1,
    children: [
      { type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: value }] },
    ],
  },
})

async function publicDiscoveryFor(articleId: string) {
  const record = await payload.findByID({
    collection: 'content',
    id: articleId,
    depth: 0,
    overrideAccess: true,
  } as never)
  return resolveDiscoveryDocument(payload, {
    collection: 'content',
    record: record as unknown as Record<string, unknown>,
    siteId: String(site.id),
  })
}

describe('UXI-09 cross-surface journeys', () => {
  it('publishing: draft → publish → revise → unpublish across admin and public surfaces', async () => {
    const slug = `uxi09-article-${suffix}`
    const article: any = await payload.create({
      collection: 'content',
      data: {
        site: site.id,
        publication: publication.id,
        contentType: 'article',
        title: 'UXI-09 journey draft',
        slug,
        status: 'draft',
        body: body('Journey body, first version.'),
      },
      overrideAccess: true,
    } as never)

    // Draft: the public discovery resolver must not present it.
    const draftDoc = await publicDiscoveryFor(String(article.id))
    expect(draftDoc.indexability.indexable).toBe(false)

    // Publish: now discoverable, with the published title.
    await payload.update({
      collection: 'content',
      id: article.id,
      data: { status: 'published', publishedAt: new Date().toISOString() },
      overrideAccess: true,
    } as never)
    const publishedDoc = await publicDiscoveryFor(String(article.id))
    expect(publishedDoc.indexability.indexable).toBe(true)
    expect(publishedDoc.title.value).toBe('UXI-09 journey draft')

    // Revise and republish: the public surface shows the revision,
    // not the first version.
    await payload.update({
      collection: 'content',
      id: article.id,
      data: { title: 'UXI-09 journey revised', status: 'published' },
      overrideAccess: true,
    } as never)
    const revisedDoc = await publicDiscoveryFor(String(article.id))
    expect(revisedDoc.indexability.indexable).toBe(true)
    expect(revisedDoc.title.value).toBe('UXI-09 journey revised')

    // Unpublish (recovery): the public surface stops presenting it.
    await payload.update({
      collection: 'content',
      id: article.id,
      data: { status: 'draft' },
      overrideAccess: true,
    } as never)
    const unpublishedDoc = await publicDiscoveryFor(String(article.id))
    expect(unpublishedDoc.indexability.indexable).toBe(false)
  })

  it('commerce: product appears on the public store only while published', async () => {
    const merchant: any = await payload.create({
      collection: 'merchant-connections' as never,
      data: {
        site: site.id,
        publication: publication.id,
        label: `UXI-09 merchant ${suffix}`,
        providerKey: 'development-stripe',
        merchantCountry: 'US',
      },
      overrideAccess: true,
    } as never)
    const product: any = await payload.create({
      collection: 'products' as never,
      data: {
        site: site.id,
        publication: publication.id,
        merchantConnection: merchant.id,
        name: `UXI-09 product ${suffix}`,
        slug: `uxi09-product-${suffix}`,
        canonicalPath: `/store/uxi09-product-${suffix}`,
        kind: 'physical',
        state: 'draft',
        productCapabilities: ['shippable'],
        variants: [
          {
            sku: `UXI09-${suffix}`,
            title: 'Standard',
            optionValues: {},
            status: 'active',
            weightGrams: 100,
            dimensionsMm: { length: 100, width: 100, height: 10 },
            inventoryPolicy: 'untracked',
          },
        ],
        offers: [
          {
            id: `uxi09-offer-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `UXI09-${suffix}`,
            amountMinor: '1200',
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
        ],
      },
      overrideAccess: true,
    } as never)

    // The exact query src/app/(frontend)/store/page.tsx runs.
    const storeIds = async () =>
      (
        await (payload as any).find({
          collection: 'products',
          where: { and: [{ state: { equals: 'published' } }, { site: { equals: site.id } }] },
          limit: 100,
          depth: 1,
          overrideAccess: true,
        })
      ).docs.map((doc: any) => String(doc.id))

    expect(await storeIds()).not.toContain(String(product.id))

    // Publish through the real admin catalog workflow (the surface an
    // operator uses): draft → review → approved → published. Direct
    // state writes are rejected by the collection by design.
    const member: any = await payload.create({
      collection: 'members',
      data: {
        displayName: 'UXI-09 catalog operator',
        email: `uxi09-${suffix}@example.test`,
        status: 'active',
      },
      overrideAccess: true,
    } as never)
    const editor: any = await payload.create({
      collection: 'users',
      data: { email: `uxi09-${suffix}@example.test`, role: 'staff', member: member.id },
      context: { skipEnrollmentToken: true, seeding: true },
      overrideAccess: true,
    } as never)
    const grants = await payload.find({
      collection: 'member-site-roles',
      where: { and: [{ member: { equals: member.id } }, { site: { equals: site.id } }] },
      overrideAccess: true,
    } as never)
    if (!grants.docs.length) {
      await payload.create({
        collection: 'member-site-roles',
        data: { member: member.id, site: site.id, role: 'contributor' },
        overrideAccess: true,
      } as never)
    }
    const session = await createPasskeySession(
      { id: String(editor.id), email: String(editor.email) },
      loadConfig().payloadSecret,
      async (id, expires) => {
        await payload.db.pool.query(
          'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
          [id, editor.id, expires],
        )
      },
    )
    const transition = async (action: string) => {
      const response = await catalogTransition(
        new Request('http://localhost:3000/api/admin/catalog', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            cookie: `renegade-passkey=${session.token}`,
          },
          body: JSON.stringify({ productId: product.id, action }),
        }),
      )
      const text = await response.text()
      expect(response.status, text).toBe(200)
    }
    await transition('request-review')
    await transition('approve')
    await transition('publish')
    expect(await storeIds()).toContain(String(product.id))

    // Archive through the same workflow: the store stops showing it.
    await transition('archive')
    expect(await storeIds()).not.toContain(String(product.id))
  })

  it('media: /videos archive query is empty before, present while public, gone when private', async () => {
    // The exact query src/app/(frontend)/videos/page.tsx runs.
    const publicVideos = async () =>
      payload.find({
        collection: 'videos' as never,
        where: {
          and: [{ status: { equals: 'published' } }, { visibility: { equals: 'public' } }],
        },
        sort: '-publishedAt',
        limit: 50,
        depth: 0,
        overrideAccess: true,
      } as never)

    const slug = `uxi09-video-${suffix}`
    const before = await publicVideos()
    expect(before.docs.some((doc: any) => doc.slug === slug)).toBe(false)

    const video: any = await payload.create({
      collection: 'videos' as never,
      data: {
        site: site.id,
        publication: publication.id,
        title: 'UXI-09 journey video',
        slug,
        status: 'published',
        visibility: 'public',
        provider: 'youtube',
        externalId: `uxi09-${suffix}`,
        publishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)
    const during = await publicVideos()
    expect(during.docs.some((doc: any) => String(doc.id) === String(video.id))).toBe(true)

    await payload.update({
      collection: 'videos' as never,
      id: video.id,
      data: { visibility: 'private' },
      overrideAccess: true,
    } as never)
    const after = await publicVideos()
    expect(after.docs.some((doc: any) => String(doc.id) === String(video.id))).toBe(false)
  })
})
