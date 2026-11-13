/**
 * RC2-G-03 setup: give Site A's blog publication its ActivityPub social account
 * (the actor prerequisite the webfinger/actor routes require), then report the
 * handles the journey needs. Idempotent.
 */
import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { getPayload } from 'payload'
import config from '@payload-config'

const manifest = JSON.parse(await fs.readFile('/tmp/b01-world.json', 'utf8'))

describe('rc2-g03 setup', () => {
  it('ensures the publication ActivityPub account and reports handles', async () => {
    const payload = await getPayload({ config })
    const publication = (await payload.findByID({
      collection: 'publications',
      id: manifest.siteA.blogPublicationId,
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as { id: string; slug: string; site?: string }
    const existing = await payload.find({
      collection: 'social-accounts' as never,
      where: {
        and: [{ publication: { equals: publication.id } }, { network: { equals: 'activitypub' } }],
      } as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    let accountId = (existing.docs[0] as { id?: string } | undefined)?.id
    if (!accountId) {
      const created = (await payload.create({
        collection: 'social-accounts' as never,
        data: {
          displayName: 'G-03 Blog ActivityPub',
          network: 'activitypub',
          actorType: 'publication',
          externalAccountId: publication.slug,
          capabilityState: 'available',
          capabilities: { follow: true, post: true },
          publication: publication.id,
          site: manifest.siteA.siteId,
        } as never,
        overrideAccess: true,
      } as never)) as unknown as { id: string }
      accountId = created.id
    }
    let discussions = await payload.find({
      collection: 'discussions',
      where: { canonicalPath: { equals: manifest.siteA.publishedCanonicalPath } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!discussions.docs[0]) {
      await payload
        .create({
          collection: 'discussions',
          data: {
            title: 'G-03 article discussion',
            kind: 'attached',
            attachedTo: { relationTo: 'content', value: manifest.siteA.publishedArticleId },
            canonicalPath: manifest.siteA.publishedCanonicalPath,
            site: manifest.siteA.siteId,
          } as never,
          overrideAccess: true,
        } as never)
        .catch((error: Error) => console.log('discussion create note:', error.message))
      discussions = await payload.find({
        collection: 'discussions',
        where: { canonicalPath: { equals: manifest.siteA.publishedCanonicalPath } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
    }
    const report = {
      handle: publication.slug,
      publicationId: publication.id,
      accountId,
      articlePath: manifest.siteA.publishedCanonicalPath,
      discussionId: discussions.docs[0]?.id ?? null,
      siteA: manifest.siteA.siteId,
    }
    await fs.writeFile('/tmp/g03-setup.json', JSON.stringify(report, null, 2))
    console.log('G03 SETUP', JSON.stringify(report))
    expect(accountId).toBeTruthy()
  }, 120_000)
})
