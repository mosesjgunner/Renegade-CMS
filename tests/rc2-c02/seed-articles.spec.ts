/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { fixtureRichText } from '../helpers/fixture-rich-text'

/**
 * RC2-C-02 seed: four articles on Site A carrying unique search tokens —
 * a published, fully-attributed article (title + body tokens), a draft,
 * an embargoed (future-dated) article, and a members-visibility article —
 * plus a dump of their search_documents projection rows. Idempotent per
 * world suffix. Run once per served environment; not part of any suite.
 */
describe('RC2-C-02 seed', () => {
  it('creates the search-token articles and dumps the projection rows', async () => {
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
      { slug: { equals: `search-author-${suffix}` } },
      {
        displayName: `Search Author ${suffix}`,
        slug: `search-author-${suffix}`,
        site: siteId,
        bio: 'Byline for the C-02 search journey.',
      },
    )

    const base = {
      site: siteId,
      publication: world.siteA.blogPublicationId,
      contentType: 'article',
    }
    const main = await findOrCreate(
      'content',
      { slug: { equals: `c02-search-${suffix}` } },
      {
        ...base,
        title: `Quixotica${suffix} Field Report`,
        slug: `c02-search-${suffix}`,
        status: 'published',
        publishedAt: new Date().toISOString(),
        body: fixtureRichText(`The zephyrium${suffix} survey records the field season.`),
        authors: [{ author: author.id, displayOrder: 0 }],
        categories: [world.categoryAId],
      },
    )
    const draft = await findOrCreate(
      'content',
      { slug: { equals: `c02-draft-${suffix}` } },
      {
        ...base,
        title: `Draftonly${suffix} Notes`,
        slug: `c02-draft-${suffix}`,
        status: 'draft',
        body: fixtureRichText(`Unfiled notes ${suffix}.`),
      },
    )
    const embargo = await findOrCreate(
      'content',
      { slug: { equals: `c02-embargo-${suffix}` } },
      {
        ...base,
        title: `Embargoed${suffix} Brief`,
        slug: `c02-embargo-${suffix}`,
        status: 'published',
        publishedAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        body: fixtureRichText(`Embargoed body ${suffix}.`),
      },
    )
    const members = await findOrCreate(
      'content',
      { slug: { equals: `c02-members-${suffix}` } },
      {
        ...base,
        title: `Privateonly${suffix} Memo`,
        slug: `c02-members-${suffix}`,
        status: 'published',
        publishedAt: new Date().toISOString(),
        visibility: 'members',
        body: fixtureRichText(`Members body ${suffix}.`),
      },
    )

    const ids = [main.id, draft.id, embargo.id, members.id].map(String)
    const pool = (payload.db as any).pool
    const rows = await pool.query(
      'SELECT canonical_id, title, author, taxonomy, visibility FROM search_documents WHERE canonical_id = ANY($1)',
      [ids],
    )
    const readBack = await (payload as any).findByID({
      collection: 'content',
      id: main.id,
      depth: 0,
      overrideAccess: true,
    })
    writeFileSync(
      '/tmp/c02-articles.json',
      JSON.stringify(
        {
          suffix,
          titleToken: `quixotica${suffix}`,
          bodyToken: `zephyrium${suffix}`,
          draftToken: `draftonly${suffix}`,
          embargoToken: `embargoed${suffix}`,
          membersToken: `privateonly${suffix}`,
          mainId: String(main.id),
          mainTitle: `Quixotica${suffix} Field Report`,
          mainPath: readBack?.canonicalPath ?? null,
          authorName: `Search Author ${suffix}`,
          categoryName: world.categoryAName,
          projectionRows: rows.rows,
        },
        null,
        2,
      ),
    )
    expect(readBack?.canonicalPath).toBeTruthy()
  }, 300_000)
})
