/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { fixtureRichText } from '../helpers/fixture-rich-text'

/**
 * RC2-D-01 seed: draft articles on Site A for the workflow reject arc,
 * the scheduled release and the coordinated release. Fresh records are
 * minted per run stamp so journeys stay re-runnable.
 */
describe('RC2-D-01 seed', () => {
  it('creates the D-01 articles', async () => {
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

    const workflow = await mk(
      `d01-workflow-${suffix}`,
      `D01 Workflow Article ${suffix} ${stamp}`,
      `Workflow reject and approve arc article ${suffix}.`,
    )
    const scheduled = await mk(
      `d01-scheduled-${suffix}`,
      `D01 Scheduled Article ${suffix} ${stamp}`,
      `Scheduled release article ${suffix}.`,
    )
    const releaseMain = await mk(
      `d01-release-main-${suffix}`,
      `D01 Release Main ${suffix} ${stamp}`,
      `Coordinated release main article ${suffix}.`,
    )
    const media = await (payload as any).create({
      collection: 'media-assets',
      data: {
        site: siteId,
        title: `D01 Release Media ${suffix} ${stamp}`,
        kind: 'image',
        mimeType: 'image/png',
        byteSize: 1024,
        storageLocation: `d01-media-${suffix}-${stamp}.png`,
        checksum: `sha256:d01media${suffix}${stamp}`,
        altText: 'D01 release media asset',
        rightsStatus: 'approved',
      },
      overrideAccess: true,
    })
    const readBack = async (id: string) =>
      (payload as any).findByID({ collection: 'content', id, depth: 0, overrideAccess: true })
    const scheduledRead = await readBack(scheduled.id)
    const releaseRead = await readBack(releaseMain.id)
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
    const scheduledCompanion = await companionOf(String(scheduled.id))
    const releaseCompanion = await companionOf(String(releaseMain.id))
    const workflowCompanion = await companionOf(String(workflow.id))
    expect(scheduledCompanion).toBeTruthy()
    expect(releaseCompanion).toBeTruthy()
    expect(workflowCompanion).toBeTruthy()
    writeFileSync(
      '/tmp/d01-content.json',
      JSON.stringify(
        {
          suffix,
          stamp,
          workflowId: String(workflow.id),
          workflowCompanion,
          scheduledId: String(scheduled.id),
          scheduledPath: scheduledRead?.canonicalPath ?? null,
          scheduledCompanion,
          releaseMainId: String(releaseMain.id),
          releaseMainPath: releaseRead?.canonicalPath ?? null,
          releaseCompanion,
          mediaId: String(media.id),
        },
        null,
        2,
      ),
    )
    expect(scheduledRead?.canonicalPath).toBeTruthy()
    expect(releaseRead?.canonicalPath).toBeTruthy()
  }, 300_000)
})
