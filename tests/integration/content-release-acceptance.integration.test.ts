/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { scheduleContentRelease } from '../../src/modules/releases/service'
import { isGateSnapshotValid } from '../../src/modules/releases/gates'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { PATCH as catalogTransition } from '../../src/app/(frontend)/api/admin/catalog/route'

let payload: Payload

const idOf = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : String((value as { id?: unknown } | null)?.id ?? '')

let acceptanceSite: any
let acceptancePublication: any

beforeAll(async () => {
  payload = await getPayload({ config })
  acceptanceSite = await payload.create({
    collection: 'sites',
    data: {
      name: 'Release integration',
      slug: `release-integration-${randomUUID().slice(0, 8)}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['thumbs_up', 'heart', 'insightful', 'applause'],
    },
    overrideAccess: true,
  })
  acceptancePublication = (
    await payload.find({
      collection: 'publications',
      where: { site: { equals: acceptanceSite.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  expect(acceptancePublication).toBeTruthy()
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('coordinated content release acceptance', () => {
  it('durably schedules and releases an approved product once', async () => {
    const site = acceptanceSite
    const publication = acceptancePublication
    const suffix = randomUUID().slice(0, 8)
    const merchant = (await payload.create({
      collection: 'merchant-connections' as never,
      data: {
        site: site.id,
        publication: publication.id,
        label: `Release merchant ${suffix}`,
        providerKey: 'development-stripe',
        merchantCountry: 'US',
      },
      overrideAccess: true,
    } as never)) as any
    const product = (await payload.create({
      collection: 'products' as never,
      data: {
        site: site.id,
        publication: publication.id,
        merchantConnection: merchant.id,
        name: `Release product ${suffix}`,
        slug: `release-product-${suffix}`,
        canonicalPath: `/store/release-product-${suffix}`,
        kind: 'physical',
        state: 'draft',
        productCapabilities: ['shippable'],
        variants: [
          {
            sku: `RELEASE-${suffix}`,
            title: 'Release edition',
            optionValues: {},
            status: 'active',
            weightGrams: 100,
            dimensionsMm: { length: 100, width: 100, height: 10 },
            inventoryPolicy: 'untracked',
          },
        ],
        offers: [
          {
            id: `release-offer-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `RELEASE-${suffix}`,
            amountMinor: '1000',
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
        ],
      },
      overrideAccess: true,
    } as never)) as any
    const member = await payload.create({
      collection: 'members',
      data: {
        displayName: 'Release editor',
        email: `release-${suffix}@example.test`,
        status: 'active',
      },
      overrideAccess: true,
    } as never)
    const editor = await payload.create({
      collection: 'users',
      data: { email: `release-${suffix}@example.test`, role: 'staff', member: member.id },
      context: { skipEnrollmentToken: true, seeding: true },
      overrideAccess: true,
    })
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
    // Fixture session only: this integration test does not claim WebAuthn enrollment.
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
    const request = (action: string, authenticated: boolean) =>
      new Request('http://localhost:3000/api/admin/catalog', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(authenticated ? { cookie: `renegade-passkey=${session.token}` } : {}),
        },
        body: JSON.stringify({ productId: product.id, action }),
      })
    expect((await catalogTransition(request('request-review', false))).status).toBe(403)
    for (const action of ['request-review', 'approve']) {
      const response = await catalogTransition(request(action, true))
      const body = await response.text()
      expect(response.status, body).toBe(200)
    }
    const approved = await payload.findByID({
      collection: 'products',
      id: product.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(approved.state).toBe('approved')
    expect(approved.releaseRevision).toBeTruthy()
    const release = (await payload.create({
      collection: 'content-releases' as never,
      data: {
        site: site.id,
        publication: publication.id,
        title: `Release ${suffix}`,
        product: product.id,
        productRevision: approved.releaseRevision,
      },
      overrideAccess: true,
    } as never)) as any

    const scheduled = (await scheduleContentRelease(payload, {
      releaseId: String(release.id),
      scheduledFor: new Date().toISOString(),
      timeZone: 'UTC',
      actorId: 'publisher-acceptance',
      idempotencyKey: `release-schedule-${suffix}`,
    })) as any
    expect(isGateSnapshotValid(scheduled, scheduled.gateSnapshot).valid).toBe(true)
    expect(
      isGateSnapshotValid(
        { ...scheduled, plannedInstant: '2030-01-01T00:00:00.000Z' },
        scheduled.gateSnapshot,
      ).valid,
    ).toBe(false)
    await payload.jobs.run({
      queue: 'operations',
      where: { id: { equals: idOf(scheduled.executionJob) } },
      silent: true,
    })

    const finished = (await payload.findByID({
      collection: 'content-releases' as never,
      id: release.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    const published = (await payload.findByID({
      collection: 'products' as never,
      id: product.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(finished.status).toBe('completed')
    expect(finished.executionItems).toMatchObject([{ status: 'succeeded', attempts: 1 }])
    expect(published.state).toBe('published')

    await payload.jobs.run({
      queue: 'operations',
      where: { id: { equals: idOf(scheduled.executionJob) } },
      silent: true,
    })
    const replayed = (await payload.findByID({
      collection: 'content-releases' as never,
      id: release.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(replayed.executionItems).toMatchObject([{ status: 'succeeded', attempts: 1 }])
  })
})
