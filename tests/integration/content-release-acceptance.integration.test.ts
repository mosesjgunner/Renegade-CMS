/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { scheduleContentRelease } from '../../src/modules/releases/service'
import { seed } from '../../src/scripts/seed'

let payload: Payload

const idOf = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : String((value as { id?: unknown } | null)?.id ?? '')

const findOne = async (collection: string, slug: string) => {
  const result = await payload.find({
    collection: collection as never,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  expect(result.docs[0]).toBeTruthy()
  return result.docs[0] as any
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('coordinated content release acceptance', () => {
  it('durably schedules and releases an approved product once', async () => {
    const site = await findOne('sites', 'demo-publication')
    const publication = await findOne('publications', 'main')
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
        kind: 'digital',
        state: 'approved',
        releaseRevision: `revision-${suffix}`,
      },
      overrideAccess: true,
    } as never)) as any
    const release = (await payload.create({
      collection: 'content-releases' as never,
      data: {
        site: site.id,
        publication: publication.id,
        title: `Release ${suffix}`,
        product: product.id,
        productRevision: product.releaseRevision,
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
    await payload.jobs.runByID({ id: idOf(scheduled.executionJob), silent: true })

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
    expect(finished.status).toBe('released')
    expect(finished.executionItems).toMatchObject([{ status: 'succeeded', attempts: 1 }])
    expect(published.state).toBe('published')

    await payload.jobs.runByID({ id: idOf(scheduled.executionJob), silent: true })
    const replayed = (await payload.findByID({
      collection: 'content-releases' as never,
      id: release.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(replayed.executionItems).toMatchObject([{ status: 'succeeded', attempts: 1 }])
  })
})
