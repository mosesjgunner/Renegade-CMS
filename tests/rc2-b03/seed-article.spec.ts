/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { fixtureRichText } from '../helpers/fixture-rich-text'

/**
 * RC2-B-03 seed: creates the fully-attributed published article the
 * surfaces journey follows (author, category, tag, related link), plus
 * an empty category for the empty-state stage, on Site A of the
 * already-seeded RC2 world (tests/rc2-b01/seed-world.spec.ts).
 * Idempotent per world suffix. Run once per served environment; not
 * part of any suite sweep.
 */
describe('RC2-B-03 seed', () => {
  it('creates the attributed article and the empty category', async () => {
    const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
    const payload: Payload = await getPayload({ config })
    const suffix: string = world.suffix
    const siteId: string = world.siteA.siteId

    const findOrCreate = async (collection: string, where: any, data: any) => {
      const found = await (payload as any).find({
        collection,
        where,
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs[0]) return found.docs[0]
      return (payload as any).create({ collection, data, overrideAccess: true })
    }

    const author = await findOrCreate(
      'authors',
      { slug: { equals: `ada-field-${suffix}` } },
      {
        displayName: `Ada Field ${suffix}`,
        slug: `ada-field-${suffix}`,
        site: siteId,
        bio: 'Staff writer for the B-03 surfaces journey.',
      },
    )
    const tag = await findOrCreate(
      'tags',
      { slug: { equals: `field-notes-${suffix}` } },
      { site: siteId, scope: 'site', name: `Field Notes ${suffix}`, slug: `field-notes-${suffix}` },
    )
    const emptyCategory = await findOrCreate(
      'categories',
      { slug: { equals: `empty-category-${suffix}` } },
      {
        site: siteId,
        scope: 'site',
        name: `Empty Category ${suffix}`,
        slug: `empty-category-${suffix}`,
      },
    )
    const article = await findOrCreate(
      'content',
      { slug: { equals: `b03-propagation-${suffix}` } },
      {
        site: siteId,
        publication: world.siteA.blogPublicationId,
        contentType: 'article',
        title: `B03 Propagation Article ${suffix}`,
        slug: `b03-propagation-${suffix}`,
        status: 'published',
        publishedAt: new Date().toISOString(),
        body: fixtureRichText(`B03 propagation body ${suffix}`),
        authors: [{ author: author.id, displayOrder: 0 }],
        categories: [world.categoryAId],
        tags: [tag.id],
        relatedContent: [world.siteA.publishedArticleId],
      },
    )
    const readBack = await (payload as any).findByID({
      collection: 'content',
      id: article.id,
      depth: 0,
      overrideAccess: true,
    })
    writeFileSync(
      '/tmp/b03-article.json',
      JSON.stringify(
        {
          articleId: String(article.id),
          slug: `b03-propagation-${suffix}`,
          canonicalPath: readBack?.canonicalPath ?? null,
          title: `B03 Propagation Article ${suffix}`,
          authorName: `Ada Field ${suffix}`,
          categoryId: world.categoryAId,
          categoryName: world.categoryAName,
          categorySlug: `journey-category-${suffix}`,
          tagName: `Field Notes ${suffix}`,
          emptyCategorySlug: `empty-category-${suffix}`,
          emptyCategoryName: `Empty Category ${suffix}`,
          relatedTitle: `Site A Published Article ${suffix}`,
          relatedPath: world.siteA.publishedCanonicalPath,
        },
        null,
        2,
      ),
    )
    expect(readBack?.canonicalPath).toBeTruthy()
  }, 300_000)
})
