/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { fixtureRichText } from '../helpers/fixture-rich-text'

/**
 * RC2-D-04 seed: two canonical draft articles on Site A — one for the
 * all-destinations campaign release, one for the failure/retry release.
 * Fresh records are minted per run stamp so journeys stay re-runnable.
 */
describe('RC2-D-04 seed', () => {
  it('creates the D-04 articles', async () => {
    const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
    const payload: Payload = await getPayload({ config })
    const suffix: string = world.suffix
    const stamp = Date.now().toString(36)
    const siteId: string = world.siteA.siteId

    const mk = async (slugBase: string, title: string, bodyText: string) =>
      (payload as any).create({
        collection: 'content',
        data: {
          site: siteId,
          publication: world.siteA.blogPublicationId,
          contentType: 'article',
          title,
          slug: `${slugBase}-${stamp}`,
          status: 'draft',
          body: fixtureRichText(bodyText),
          seoDescription:
            'A complete meta description so the quality gate records no blocking issue.',
        },
        overrideAccess: true,
      })

    const main = await mk(
      `d04-campaign-${suffix}`,
      `D04 Campaign Article ${suffix} ${stamp}`,
      `Cross-family campaign article ${suffix}.`,
    )
    const retry = await mk(
      `d04-retry-${suffix}`,
      `D04 Retry Article ${suffix} ${stamp}`,
      `Failure and retry campaign article ${suffix}.`,
    )
    const companionOf = async (contentId: string) => {
      const found = await (payload as any).find({
        collection: 'article-family-content',
        where: { content: { equals: contentId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      return found.docs[0]?.id ? String(found.docs[0].id) : null
    }
    const readBack = async (id: string) =>
      (payload as any).findByID({ collection: 'content', id, depth: 0, overrideAccess: true })
    const mainRead = await readBack(main.id)
    const retryRead = await readBack(retry.id)
    const mainCompanion = await companionOf(String(main.id))
    const retryCompanion = await companionOf(String(retry.id))
    expect(mainCompanion).toBeTruthy()
    expect(retryCompanion).toBeTruthy()
    writeFileSync(
      '/tmp/d04-content.json',
      JSON.stringify(
        {
          suffix,
          stamp,
          mainId: String(main.id),
          mainPath: mainRead?.canonicalPath ?? null,
          mainCompanion,
          retryId: String(retry.id),
          retryPath: retryRead?.canonicalPath ?? null,
          retryCompanion,
        },
        null,
        2,
      ),
    )
    expect(mainRead?.canonicalPath).toBeTruthy()
    expect(retryRead?.canonicalPath).toBeTruthy()
  }, 300_000)
})
