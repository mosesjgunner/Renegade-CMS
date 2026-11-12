/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { fixtureRichText } from '../helpers/fixture-rich-text'

/**
 * RC2-C-03 seed: two published articles on Site A — one with complete
 * SEO fields (the trace article) and one deliberately missing its meta
 * description (the rendered-quality audit target). Idempotent per world
 * suffix. Run once per served environment; not part of any suite sweep.
 */
describe('RC2-C-03 seed', () => {
  it('creates the trace and no-description articles', async () => {
    const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
    const payload: Payload = await getPayload({ config })
    const suffix: string = world.suffix
    const siteId: string = world.siteA.siteId

    const findOrCreate = async (where: any, data: any) => {
      const found = await (payload as any).find({
        collection: 'content',
        where,
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs[0]) return found.docs[0]
      return (payload as any).create({ collection: 'content', data, overrideAccess: true })
    }

    const base = {
      site: siteId,
      publication: world.siteA.blogPublicationId,
      contentType: 'article',
      status: 'published',
      publishedAt: new Date().toISOString(),
    }
    const trace = await findOrCreate(
      { slug: { equals: `c03-trace-${suffix}` } },
      {
        ...base,
        title: `C03 Trace Article ${suffix}`,
        slug: `c03-trace-${suffix}`,
        body: fixtureRichText(`Trace body for the C03 SEO journey ${suffix}.`),
        seoDescription:
          'A fully described article used to trace canonical, Open Graph and structured data output.',
      },
    )
    const nodesc = await findOrCreate(
      { slug: { equals: `c03-nodesc-${suffix}` } },
      {
        ...base,
        title: `C03 Missing Description ${suffix}`,
        slug: `c03-nodesc-${suffix}`,
        body: fixtureRichText(
          `This article deliberately ships without a meta description ${suffix}.`,
        ),
      },
    )
    // The two gate drafts must start each run as drafts: if a prior run
    // already approved the seeded record, mint a fresh one.
    const runStamp = Date.now().toString(36)
    const findDraftOrCreate = async (slugBase: string, data: any) => {
      const found = await (payload as any).find({
        collection: 'content',
        where: { slug: { equals: slugBase } },
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs[0] && found.docs[0].status === 'draft') return found.docs[0]
      if (found.docs[0])
        return (payload as any).create({
          collection: 'content',
          data: { ...data, slug: `${slugBase}-${runStamp}` },
          overrideAccess: true,
        })
      return (payload as any).create({ collection: 'content', data, overrideAccess: true })
    }
    const gated = await findDraftOrCreate(`c03-gated-${suffix}`, {
      site: siteId,
      publication: world.siteA.blogPublicationId,
      contentType: 'article',
      title: `C03 Gated Draft ${suffix}`,
      slug: `c03-gated-${suffix}`,
      status: 'draft',
      body: fixtureRichText(`Draft held at the quality gate for the C03 journey ${suffix}.`),
    })
    const noalt = await (async () => {
      const found = await (payload as any).find({
        collection: 'media-assets',
        where: { title: { equals: `C03 No Alt Media ${suffix}` } },
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs[0] && !found.docs[0].altText) return found.docs[0]
      const title = found.docs[0]
        ? `C03 No Alt Media ${suffix} ${runStamp}`
        : `C03 No Alt Media ${suffix}`
      return (payload as any).create({
        collection: 'media-assets',
        data: {
          site: siteId,
          title,
          kind: 'image',
          mimeType: 'image/png',
          byteSize: 1024,
          storageLocation: `c03-noalt-${suffix}-${runStamp}.png`,
          checksum: `sha256:c03noalt${suffix}${runStamp}`,
        },
        overrideAccess: true,
      })
    })()
    const gatedBlock = await findDraftOrCreate(`c03-gated-block-${suffix}`, {
      site: siteId,
      publication: world.siteA.blogPublicationId,
      contentType: 'article',
      title: `C03 Alt Gate Draft ${suffix}`,
      slug: `c03-gated-block-${suffix}`,
      status: 'draft',
      body: fixtureRichText(`Draft whose hero image has no alt text ${suffix}.`),
      heroMedia: noalt.id,
      seoDescription: 'A complete meta description so only the alt-text rule can block this draft.',
    })
    const readBack = async (id: string) =>
      (payload as any).findByID({ collection: 'content', id, depth: 0, overrideAccess: true })
    const traceRead = await readBack(trace.id)
    const nodescRead = await readBack(nodesc.id)
    const gatedBlockRead = await readBack(gatedBlock.id)
    writeFileSync(
      '/tmp/c03-articles.json',
      JSON.stringify(
        {
          suffix,
          traceId: String(trace.id),
          traceTitle: `C03 Trace Article ${suffix}`,
          tracePath: traceRead?.canonicalPath ?? null,
          nodescId: String(nodesc.id),
          nodescTitle: `C03 Missing Description ${suffix}`,
          nodescPath: nodescRead?.canonicalPath ?? null,
          gatedId: String(gated.id),
          gatedTitle: `C03 Gated Draft ${suffix}`,
          gatedBlockId: String(gatedBlock.id),
          gatedBlockTitle: `C03 Alt Gate Draft ${suffix}`,
          gatedBlockPath: gatedBlockRead?.canonicalPath ?? null,
          noaltId: String(noalt.id),
        },
        null,
        2,
      ),
    )
    expect(traceRead?.canonicalPath).toBeTruthy()
    expect(nodescRead?.canonicalPath).toBeTruthy()
  }, 300_000)
})
