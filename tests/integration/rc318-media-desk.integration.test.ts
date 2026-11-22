/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-18 — Media desk and studio claims, service-level journeys on real
 * PostgreSQL (seeded demo site, real media storage, real sharp/ffmpeg):
 *
 * - #12 Media Studio: upload → library search → metadata edit → scoped
 *   detail readback on current HEAD (the library surface the med-01 /
 *   med-03 / med-06 suites exercise in depth, re-evidenced here through
 *   the scoped library API).
 * - #13 DAM: rights lifecycle with the denied-use negative case — an
 *   approved asset publishes, its rights expire, and every public path
 *   closes: publish assertions throw, public delivery withdraws, the
 *   governance dashboard flags it and an incident opens. Asset history
 *   (usages + replacement versions) reads back through the scoped
 *   detail API.
 * - #14 Graphics Studio: asset → graphic derivative → RENDER (new:
 *   the recipe becomes a real media asset) → approve → attach to
 *   published content → public readback, with the original provably
 *   untouched and rights negatives at both create and render.
 * - #17 Interviews: capture with referential integrity (transcript
 *   must belong to the attached media), deterministic quote extraction
 *   with readback, and the approved export (publication is the
 *   approval boundary; the export is a persisted document asset).
 * - #18 Events & timelines: a recurring event's occurrence expansion
 *   with an override and an exclusion, read through the product's own
 *   public timeline functions on real records.
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'

import config from '../../src/payload.config'
import { loadConfig, type AppConfig } from '../../src/modules/core/config'
import { seed } from '../../src/scripts/seed'
import {
  assertMediaIdsPublishable,
  assertUsageTargetsPublishable,
  attachMediaToContent,
  createPublicMediaIncidents,
  getScopedMediaAssetDetail,
  listScopedMediaLibrary,
  mediaGovernanceDashboard,
  publicMedia,
  reconcileMediaUsages,
  replaceMedia,
  updateMediaMetadata,
  uploadMedia,
} from '../../src/modules/media/workflow'
import { mediaStorage } from '../../src/modules/media/storage'
import { transcriptChecksum, type TranscriptSegment } from '../../src/modules/media/contracts'
import { createGraphicDerivative } from '../../src/modules/graphics/service'
import {
  approveGraphicDerivative,
  renderGraphicDerivative,
} from '../../src/modules/graphics/render'
import {
  createInterviewCapture,
  exportInterview,
  extractInterviewQuotes,
  getInterviewReadback,
} from '../../src/modules/media/interviews'
import { asEvent, canReadEvent } from '../../src/modules/events/public'
import { publicEventOccurrences } from '../../src/modules/events/contracts'

const execFileAsync = promisify(execFile)

let payload: Payload
let appConfig: AppConfig
let site: any
let publication: any
let user: any
let scope: { kind: 'site'; siteId: string }
let suffix: string
let tmpDir: string

const findOne = async (collection: string, where: Record<string, unknown>) => {
  const result = (await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)) as { docs: any[] }
  return result.docs[0]
}

const pngBytes = async (r: number, g: number, b: number, w = 800, h = 600) =>
  new Uint8Array(
    await sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } })
      .png()
      .toBuffer(),
  )

const createContent = async (title: string, status: 'draft' | 'published') => {
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`
  return (await payload.create({
    collection: 'content',
    data: {
      site: site.id,
      // 'book' on purpose: the editorial hierarchy hook requires an
      // editor body before an article/page can publish; a book is a
      // real publishable type whose surface carries hero media the
      // same way (the shape media-acceptance uses).
      contentType: 'book',
      title,
      slug,
      canonicalPath: `/books/${slug}`,
      summary: 'RC3-18 media desk journey fixture.',
      status,
      ...(status === 'published' ? { publishedAt: new Date().toISOString() } : {}),
    },
    overrideAccess: true,
  } as never)) as any
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  appConfig = loadConfig()
  suffix = randomUUID().slice(0, 8)
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-rc318-'))
  site = await findOne('sites', { slug: { equals: 'demo-publication' } })
  expect(site).toBeTruthy()
  publication = await findOne('publications', { slug: { equals: 'main' } })
  const member = await findOne('members', { email: { equals: 'river@example.test' } })
  expect(member).toBeTruthy()
  user = { role: 'owner', member: member.id, site: { id: site.id } }
  scope = { kind: 'site', siteId: String(site.id) }
})

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  await payload?.db.destroy?.()
})

describe('RC3-18 media desk journeys', () => {
  it('#12 library: upload → search → metadata edit → scoped detail readback', async () => {
    const asset: any = await uploadMedia(payload, appConfig, {
      user,
      scope,
      title: `RC318 Desk Image ${suffix}`,
      altText: 'Solid blue fixture image',
      originalFilename: `desk-${suffix}.png`,
      bytes: await pngBytes(30, 90, 200),
    })
    expect(asset.kind).toBe('image')
    expect(asset.processingState).toBe('ready')

    const found = await listScopedMediaLibrary(payload, user, {
      siteId: String(site.id),
      q: `RC318 Desk Image ${suffix}`,
    })
    expect(found.some((item: any) => item.id === String(asset.id))).toBe(true)

    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(asset.id),
      altText: 'Updated alt text from the media desk',
      description: 'Edited through updateMediaMetadata.',
    })
    const detail: any = await getScopedMediaAssetDetail(payload, user, {
      siteId: String(site.id),
      mediaId: String(asset.id),
    })
    expect(detail.altText).toBe('Updated alt text from the media desk')
    expect(detail.title).toBe(`RC318 Desk Image ${suffix}`)
  })

  it('#13 DAM: rights expiry closes every public path; history reads back', async () => {
    const asset: any = await uploadMedia(payload, appConfig, {
      user,
      scope,
      title: `RC318 Rights Image ${suffix}`,
      altText: 'Rights-managed fixture image',
      originalFilename: `rights-${suffix}.png`,
      bytes: await pngBytes(200, 60, 40),
    })
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString()
    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(asset.id),
      rightsStatus: 'approved',
      rightsExpiresAt: future,
      creatorCredit: 'RC318 Test Credit',
    })
    const content = await createContent(`RC318 Rights Story ${suffix}`, 'published')
    await attachMediaToContent(payload, user, {
      scope,
      mediaId: String(asset.id),
      contentId: String(content.id),
      purpose: 'hero',
    })
    await reconcileMediaUsages(payload, String(site.id))
    await expect(assertMediaIdsPublishable(payload, [String(asset.id)])).resolves.toBeUndefined()
    await expect(
      assertUsageTargetsPublishable(payload, [String(content.id)]),
    ).resolves.toBeUndefined()
    expect(await publicMedia(payload, String(asset.id))).toBeTruthy()

    // Replacement in all-usages mode creates the asset-history chain:
    // the original's replaceGloballyWith points at the replacement and
    // public delivery resolves through it (the default 'new-asset'
    // mode deliberately leaves usages and delivery untouched).
    const replacement: any = await replaceMedia(payload, appConfig, {
      user,
      scope,
      title: `RC318 Rights Image V2 ${suffix}`,
      altText: 'Replacement fixture image',
      originalFilename: `rights-v2-${suffix}.png`,
      bytes: await pngBytes(40, 180, 90),
      replacedMediaId: String(asset.id),
      mode: 'all-usages',
      reason: 'RC318 history proof',
    })
    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(replacement.id),
      rightsStatus: 'approved',
      rightsExpiresAt: future,
      creatorCredit: 'RC318 Test Credit',
    })
    await reconcileMediaUsages(payload, String(site.id))
    const historyDetail: any = await getScopedMediaAssetDetail(payload, user, {
      siteId: String(site.id),
      mediaId: String(asset.id),
    })
    expect((historyDetail.versions ?? []).length).toBeGreaterThanOrEqual(1)
    await expect(
      assertUsageTargetsPublishable(payload, [String(content.id)]),
    ).resolves.toBeUndefined()

    // Denied-use, layer 1 — delivery is chain-aware: expiring the
    // replacement's rights closes public delivery for the replacement
    // AND for the original (whose usages resolve through the chain).
    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(replacement.id),
      rightsExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    await expect(assertMediaIdsPublishable(payload, [String(replacement.id)])).rejects.toThrow(
      /expired/i,
    )
    expect(await publicMedia(payload, String(replacement.id))).toBeUndefined()
    expect(await publicMedia(payload, String(asset.id))).toBeUndefined()
    const dashboard = await mediaGovernanceDashboard(payload, String(site.id))
    expect(dashboard.expiringRights).toContain(String(replacement.id))

    // Denied-use, layer 2 — the publish gate keys on the asset the
    // usage rows point at (the chain head): when the licence lapses on
    // the head record too, the release gate refuses the target and the
    // governance sweep opens an incident for the publicly used asset.
    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(asset.id),
      rightsExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    await expect(assertUsageTargetsPublishable(payload, [String(content.id)])).rejects.toThrow(
      /expired/i,
    )
    const incidents = await createPublicMediaIncidents(payload, String(site.id))
    expect(incidents.created).toBeGreaterThanOrEqual(1)
    const after = await mediaGovernanceDashboard(payload, String(site.id))
    expect(after.incidents.some((incident) => incident.assetId === String(asset.id))).toBe(true)
  })

  it('#14 graphics: derivative renders to a real asset, approves, publishes; original untouched', async () => {
    const source: any = await uploadMedia(payload, appConfig, {
      user,
      scope,
      title: `RC318 Graphic Source ${suffix}`,
      altText: 'Graphic source image',
      originalFilename: `graphic-source-${suffix}.png`,
      bytes: await pngBytes(90, 40, 160, 1200, 630),
    })
    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(source.id),
      rightsStatus: 'approved',
    })
    const sourceBefore = (await payload.findByID({
      collection: 'media-assets',
      id: source.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any

    const { derivative }: any = await createGraphicDerivative(payload, {
      title: `RC318 Social Graphic ${suffix}`,
      template: 'og',
      sourceMediaId: String(source.id),
      text: 'Renegade RC318',
      actorId: String(user.member),
      scope: { site: String(site.id), publication: String(publication.id) },
    })
    expect(derivative.status).toBe('pending')

    const rendered = await renderGraphicDerivative(payload, {
      derivativeId: String(derivative.id),
      actorId: String(user.member),
    })
    expect(rendered.alreadyRendered).toBe(false)
    expect(rendered.asset.kind).toBe('graphic')
    const outBytes = await mediaStorage(appConfig).get(String(rendered.asset.storageLocation))
    expect(outBytes).toBeTruthy()
    const outMeta = await sharp(Buffer.from(outBytes!)).metadata()
    expect(outMeta.format).toBe('png')
    expect(outMeta.width).toBe(1200)
    expect(outMeta.height).toBe(630)

    const again = await renderGraphicDerivative(payload, {
      derivativeId: String(derivative.id),
      actorId: String(user.member),
    })
    expect(again.alreadyRendered).toBe(true)
    expect(String(again.asset.id)).toBe(String(rendered.asset.id))

    const approved = await approveGraphicDerivative(payload, {
      derivativeId: String(derivative.id),
      actorId: String(user.member),
    })
    expect(approved.derivative.status).toBe('approved')

    const content = await createContent(`RC318 Graphic Story ${suffix}`, 'published')
    await attachMediaToContent(payload, user, {
      scope,
      mediaId: String(rendered.asset.id),
      contentId: String(content.id),
      purpose: 'hero',
    })
    expect(await publicMedia(payload, String(rendered.asset.id))).toBeTruthy()

    const sourceAfter = (await payload.findByID({
      collection: 'media-assets',
      id: source.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(sourceAfter.checksum).toBe(sourceBefore.checksum)
    expect(sourceAfter.sizeBytes).toBe(sourceBefore.sizeBytes)

    // Negatives: unapproved rights block creation; expired rights block render.
    const restricted: any = await uploadMedia(payload, appConfig, {
      user,
      scope,
      title: `RC318 Restricted Source ${suffix}`,
      bytes: await pngBytes(10, 10, 10),
    })
    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(restricted.id),
      rightsStatus: 'pending',
    })
    await expect(
      createGraphicDerivative(payload, {
        title: `RC318 Blocked Graphic ${suffix}`,
        template: 'og',
        sourceMediaId: String(restricted.id),
        text: 'Nope',
        actorId: String(user.member),
        scope: { site: String(site.id), publication: String(publication.id) },
      }),
    ).rejects.toThrow(/not approved/i)

    const expiring: any = await uploadMedia(payload, appConfig, {
      user,
      scope,
      title: `RC318 Expiring Source ${suffix}`,
      bytes: await pngBytes(70, 70, 70),
    })
    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(expiring.id),
      rightsStatus: 'approved',
      rightsExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })
    const { derivative: expiringDerivative }: any = await createGraphicDerivative(payload, {
      title: `RC318 Expiring Graphic ${suffix}`,
      template: 'og',
      sourceMediaId: String(expiring.id),
      text: 'About to lapse',
      actorId: String(user.member),
      scope: { site: String(site.id), publication: String(publication.id) },
    })
    await updateMediaMetadata(payload, user, {
      scope,
      mediaId: String(expiring.id),
      rightsExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    await expect(
      renderGraphicDerivative(payload, {
        derivativeId: String(expiringDerivative.id),
        actorId: String(user.member),
      }),
    ).rejects.toThrow(/expired/i)
  })

  it('#17 interviews: capture integrity, quote extraction, approved export', async () => {
    const host = await findOne('authors', { slug: { equals: 'river-morgan' } })
    const guest = await findOne('authors', { slug: { equals: 'casey-guest' } })
    expect(host).toBeTruthy()
    expect(guest).toBeTruthy()

    const mp3Path = path.join(tmpDir, `interview-${suffix}.mp3`)
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=330:duration=3',
      '-codec:a',
      'libmp3lame',
      '-y',
      mp3Path,
    ])
    const audio: any = await uploadMedia(payload, appConfig, {
      user,
      scope,
      title: `RC318 Interview Audio ${suffix}`,
      originalFilename: `interview-${suffix}.mp3`,
      bytes: new Uint8Array(await readFile(mp3Path)),
    })
    expect(audio.kind).toBe('audio')

    const long = (who: string, n: number) =>
      `${who} explains at length why the river gauge matters to every farmer downstream of the county line, answer number ${n} in the RC318 interview fixture.`
    const segments: TranscriptSegment[] = [
      { id: 'seg-1', startSeconds: 0, endSeconds: 4, speaker: 'Host', text: 'Welcome back.' },
      {
        id: 'seg-2',
        startSeconds: 4,
        endSeconds: 14,
        speaker: 'Guest',
        text: long('The guest', 1),
      },
      { id: 'seg-3', startSeconds: 14, endSeconds: 18, speaker: 'Host', text: 'And the cost?' },
      { id: 'seg-4', startSeconds: 18, endSeconds: 28, speaker: 'Guest', text: long('She', 2) },
      { id: 'seg-5', startSeconds: 28, endSeconds: 32, speaker: 'Host', text: 'Noted.' },
      { id: 'seg-6', startSeconds: 32, endSeconds: 42, speaker: 'Guest', text: long('He', 3) },
    ]
    const transcript: any = await payload.create({
      collection: 'transcript-revisions',
      data: {
        title: `RC318 Interview Transcript ${suffix}`,
        media: audio.id,
        version: 1,
        source: 'manual',
        reviewState: 'reviewed',
        segments,
        checksum: transcriptChecksum(segments),
        immutable: true,
      },
      overrideAccess: true,
    } as never)

    // Integrity negative: a transcript of other media cannot attach.
    const otherMedia: any = await uploadMedia(payload, appConfig, {
      user,
      scope,
      title: `RC318 Interview Decoy ${suffix}`,
      bytes: await pngBytes(1, 2, 3),
    })
    await expect(
      createInterviewCapture(payload, {
        site: String(site.id),
        publication: String(publication.id),
        title: 'Mismatch',
        slug: `rc318-mismatch-${suffix}`,
        mediaId: String(otherMedia.id),
        transcriptId: String(transcript.id),
      }),
    ).rejects.toThrow(/different media/i)

    const interview: any = await createInterviewCapture(payload, {
      site: String(site.id),
      publication: String(publication.id),
      title: `RC318 River Gauge Interview ${suffix}`,
      slug: `rc318-interview-${suffix}`,
      guestIds: [String(guest.id)],
      hostIds: [String(host.id)],
      mediaId: String(audio.id),
      transcriptId: String(transcript.id),
    })
    expect(interview.status).toBe('draft')

    const { quotes } = await extractInterviewQuotes(payload, String(interview.id))
    expect(quotes).toHaveLength(3)
    expect(quotes.map((quote) => quote.segmentId)).toEqual(['seg-2', 'seg-4', 'seg-6'])
    const readback = await getInterviewReadback(payload, String(interview.id))
    expect((readback?.interview.quotes ?? []) as unknown[]).toHaveLength(3)
    expect(readback?.exportAssetId).toBeNull()

    await expect(
      exportInterview(payload, { interviewId: String(interview.id), actorId: String(user.member) }),
    ).rejects.toThrow(/published/i)

    await payload.update({
      collection: 'interviews',
      id: interview.id,
      data: { status: 'published', publishedAt: new Date().toISOString() },
      overrideAccess: true,
    } as never)
    const exported = await exportInterview(payload, {
      interviewId: String(interview.id),
      actorId: String(user.member),
    })
    expect(exported.asset.kind).toBe('document')
    const artifactBytes = await mediaStorage(appConfig).get(String(exported.asset.storageLocation))
    expect(artifactBytes).toBeTruthy()
    const artifact = JSON.parse(Buffer.from(artifactBytes!).toString('utf8'))
    expect(artifact.interview.id).toBe(String(interview.id))
    expect(artifact.quotes).toHaveLength(3)
    expect(artifact.transcript.checksum).toBe(transcriptChecksum(segments))
    const readback2 = await getInterviewReadback(payload, String(interview.id))
    expect(readback2?.exportAssetId).toBe(String(exported.asset.id))
  })

  it('#18 events: recurring occurrence expansion with override and exclusion', async () => {
    const startsAt = '2026-12-07T15:00:00.000Z' // a Monday
    const event: any = await payload.create({
      collection: 'events',
      data: {
        site: site.id,
        title: `RC318 Weekly Meetup ${suffix}`,
        slug: `rc318-weekly-${suffix}`,
        canonicalPath: `/events/rc318-weekly-${suffix}`,
        summary: 'Weekly recurring fixture event.',
        status: 'published',
        visibility: 'public',
        startsAt,
        endsAt: '2026-12-07T16:00:00.000Z',
        timeZone: 'UTC',
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          count: 5,
          excludedStartsAt: ['2026-12-21T15:00:00.000Z'],
        },
        recurrenceOverrides: {
          '2026-12-14T15:00:00.000Z': { title: `RC318 Weekly Meetup — Holiday Special ${suffix}` },
        },
      },
      overrideAccess: true,
    } as never)
    const occurrences = publicEventOccurrences(
      [asEvent(event)],
      new Date('2026-12-01T00:00:00.000Z'),
      new Date('2027-01-15T00:00:00.000Z'),
    )
    // 5 scheduled, 1 excluded → 4 occurrences.
    expect(occurrences).toHaveLength(4)
    expect(occurrences.map((o) => o.occurrenceStartsAt)).toEqual([
      '2026-12-07T15:00:00.000Z',
      '2026-12-14T15:00:00.000Z',
      '2026-12-28T15:00:00.000Z',
      '2027-01-04T15:00:00.000Z',
    ])
    const special = occurrences.find((o) => o.occurrenceStartsAt === '2026-12-14T15:00:00.000Z')
    expect(special?.title).toContain('Holiday Special')
    await expect(canReadEvent(payload, event, String(site.id))).resolves.toBe(true)
  })
})
