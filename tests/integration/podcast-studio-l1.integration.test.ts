/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-04 L1 ACCEPTANCE (POD-REQ-09, POD-REQ-10, POD-REQ-37) against
 * real Payload + Postgres. This is the L1 gate evidence for the
 * podcast programme (acceptance doc §1/§3):
 *
 * JP-1 management-only creator: import an existing podcast with
 *   POD-02 media migration → tidy metadata → publish an externally
 *   recorded episode through the POD-04 production path → the public
 *   feed validates with the POD-01 structural validator, full
 *   namespace.
 * JP-2 private show: POD-03's suite covers the full matrix; here a
 *   spot-check that one revoked member token loses the feed at once.
 * JP-3 production desk: an episode walked idea → published through
 *   every production state; an unapproved publish is blocked with the
 *   named PODCAST_APPROVAL_REQUIRED error; a recording session leaves
 *   a calendar entry in the existing calendar module; a
 *   consent-missing guest is flagged per the show's policy (warn
 *   admits with a warning, block refuses); replace-audio keeps the
 *   GUID and updates the enclosure length; withdraw/restore preserve
 *   the GUID and feed presence.
 * Recovery: RECORD-LEVEL only — an episode + its audio asset are
 *   exported to a JSON snapshot, deleted (records and stored bytes),
 *   and restored from the snapshot with GUID, production state, and
 *   enclosure bytes intact. Platform-level backup restore
 *   (pg_dump/media.tar.gz via src/modules/operations/backup.ts) is
 *   NOT executed here and stays UNVERIFIED — see the POD-04 handoff;
 *   L1 is therefore PARTIAL on the recovery leg.
 *
 * The staff production API routes are exercised for their
 * unauthenticated rejection (401) only: staff happy-path sessions are
 * passkey fixtures (see POD-03's identical limitation for its staff
 * surface); all behaviour below runs through the same module
 * functions the routes call.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { importPodcastFeed, validatePodcastFeed } from '../../src/modules/media/publishing'
import { mediaStorage } from '../../src/modules/media/storage'
import { migrateEpisodeEnclosure } from '../../src/modules/podcast-studio/import-media'
import { issueToken, revokeToken } from '../../src/modules/podcast-studio/member-feeds'
import {
  addGuestAppearance,
  assertGuestAdmissionReady,
  createPodcastGuest,
  listRecordingSessions,
  productionBoard,
  publishEpisode,
  recordEpisodeApproval,
  recordGuestConsent,
  replaceEpisodeAudio,
  restoreEpisode,
  scheduleRecordingSession,
  transitionProductionState,
  withdrawEpisode,
} from '../../src/modules/podcast-studio/production'
import { GET as publicFeedGet } from '../../src/app/(frontend)/podcasts/[slug]/feed.xml/route'
import { GET as memberFeedGet } from '../../src/app/(frontend)/podcasts/[slug]/member-feed/[token]/route'
import { GET as productionBoardGet } from '../../src/app/(frontend)/api/podcast-studio/production/route'
import { seed } from '../../src/scripts/seed'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const mp3Bytes = (fill: number, length = 1024) => {
  const bytes = new Uint8Array(length).fill(fill)
  bytes.set([0x49, 0x44, 0x33], 0) // 'ID3'
  return bytes
}

const wavBytes = (fill: number, dataSize = 400) => {
  const bytes = new Uint8Array(44 + dataSize).fill(fill)
  const view = new DataView(bytes.buffer)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  view.setUint32(4, 36 + dataSize, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // 'fmt '
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // 'data'
  view.setUint32(40, dataSize, true)
  return bytes
}

let payload: Payload
let server: Server
let baseUrl: string
let testMediaDir: string
let site: any
let appConfig: ReturnType<typeof loadConfig>
const runId = randomUUID().slice(0, 8)

const IMPORT_AUDIO = mp3Bytes(21, 2048)

async function makeAudioAsset(label: string, bytes: Uint8Array, mimeType: string) {
  const storage = mediaStorage(loadConfig())
  const key = `${site.id}/${randomUUID()}.bin`
  await storage.put(key, bytes, mimeType)
  // media-blobs are unique on (site, checksum): fixture bytes repeat
  // across runs, so the recorded checksum carries a unique suffix.
  const checksum = `sha256:${sha256(bytes)}:${randomUUID().slice(0, 8)}`
  const blob = await payload.create({
    collection: 'media-blobs',
    data: {
      site: site.id,
      storageKey: key,
      storageProvider: 'local',
      mimeType,
      sizeBytes: bytes.byteLength,
      checksum,
      state: 'ready',
    },
    overrideAccess: true,
  })
  const asset = await payload.create({
    collection: 'media-assets',
    data: {
      site: site.id,
      title: `POD-04 ${label} ${runId}`,
      kind: 'audio',
      storageProvider: 'local',
      originalBlob: blob.id,
      storageLocation: key,
      mimeType,
      sizeBytes: bytes.byteLength,
      checksum,
      durationSeconds: 1,
    } as any,
    overrideAccess: true,
  })
  return { asset, blob, key }
}

async function makeShow(slugSuffix: string, extra: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-04 Show ${slugSuffix} ${runId}`,
      slug: `pod04-${slugSuffix}-${runId}`,
      description: 'POD-04 L1 fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      lockedOwnerEmail: 'host@example.test',
      persons: [{ name: 'L1 Host', role: 'host', group: 'Hosts' }],
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      ...extra,
    } as any,
    overrideAccess: true,
  })
}

async function publicFeed(slug: string) {
  const res = await publicFeedGet(new Request(`http://localhost:3000/podcasts/${slug}/feed.xml`), {
    params: Promise.resolve({ slug }),
  })
  return { status: res.status, body: await res.text() }
}

/** Walks an episode from its current state to review via legal transitions. */
async function walkToReview(episodeId: string) {
  const episode = await payload.findByID({
    collection: 'podcast-episodes',
    id: episodeId,
    depth: 0,
    overrideAccess: true,
  } as never)
  const state = String((episode as any).productionState ?? 'idea')
  const paths: Record<string, string[]> = {
    idea: ['recorded', 'editing', 'review'],
    scripted: ['recorded', 'editing', 'review'],
    'scheduled-record': ['recorded', 'editing', 'review'],
    recorded: ['editing', 'review'],
    editing: ['review'],
    review: [],
  }
  for (const step of paths[state] ?? []) {
    await transitionProductionState(payload as never, episodeId, step as any)
  }
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'pod04-int-media-'))
  process.env.MEDIA_DIR = testMediaDir
  appConfig = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
    APP_URL: 'http://localhost:3000',
    MEDIA_DIR: testMediaDir,
  } as any)

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/import-feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml' })
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>JP1 Import</title>` +
          `<item><title>Imported Episode One</title><guid>jp1-1</guid>` +
          `<pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate>` +
          `<enclosure url="${baseUrl}/audio/import-1.mp3" length="${IMPORT_AUDIO.byteLength}" type="audio/mpeg"/></item>` +
          `</channel></rss>`,
      )
      return
    }
    if (url.pathname === '/audio/import-1.mp3') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' })
      res.end(Buffer.from(IMPORT_AUDIO))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()
}, 120_000)

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (testMediaDir) await rm(testMediaDir, { recursive: true, force: true }).catch(() => undefined)
  await payload?.db.destroy?.()
})

describe('JP-1 — management-only creator (import → publish → validated feed)', () => {
  it('imports with media migration, tidies metadata, publishes imported + externally recorded episodes, feed validates full-namespace', async () => {
    const show = await payload.create({
      collection: 'podcast-shows',
      data: {
        site: site.id,
        title: `POD-04 JP1 Show ${runId}`,
        slug: `pod04-jp1-${runId}`,
        description: 'JP-1 fixture show.',
        rssEnabled: true,
        feedVisibility: 'public',
        lockedOwnerEmail: 'host@example.test',
        persons: [{ name: 'L1 Host', role: 'host', group: 'Hosts' }],
        importOwnership: 'claimed-import',
        externalFeedUrl: `${baseUrl}/import-feed.xml`,
        status: 'published',
        publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      } as any,
      overrideAccess: true,
    })

    const imported = await importPodcastFeed(payload as never, {
      siteId: site.id,
      showId: show.id,
      feedUrl: `${baseUrl}/import-feed.xml`,
      allowPrivate: true,
      migrateRemoteMedia: true,
      runMediaMigration: (episodeId: string) =>
        migrateEpisodeEnclosure(payload as never, episodeId, {
          allowPrivate: true,
          config: appConfig,
        }),
    })
    expect(imported).toMatchObject({ created: 1, remoteMedia: { migrated: 1, failed: 0 } })

    const episodes = await payload.find({
      collection: 'podcast-episodes',
      where: { show: { equals: show.id } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(episodes.docs).toHaveLength(1)
    const importedEpisode = episodes.docs[0] as any
    expect(importedEpisode.mediaMigrationState).toBe('done')
    expect(importedEpisode.mediaChecksum).toBe(sha256(IMPORT_AUDIO))
    expect(importedEpisode.audio).toBeTruthy()
    expect(importedEpisode.productionState).toBe('idea')

    // Tidy metadata (a genuine local edit).
    await payload.update({
      collection: 'podcast-episodes',
      id: importedEpisode.id,
      data: {
        title: 'Imported Episode One (tidied)',
        description: 'Tidied by the creator.',
      } as any,
      overrideAccess: true,
    })

    // Publish the imported episode through the production path.
    await walkToReview(String(importedEpisode.id))
    await recordEpisodeApproval(payload as never, {
      episodeId: String(importedEpisode.id),
      approver: 'jp1-staff',
      decision: 'approved',
    })
    const publishedImported = await publishEpisode(payload as never, String(importedEpisode.id), {
      by: 'jp1-staff',
    })
    expect(publishedImported.productionState).toBe('published')
    expect(publishedImported.status).toBe('published')
    expect(publishedImported.publishedAt).toBeTruthy()

    // A new externally recorded episode: local audio, same desk flow.
    const externalBytes = wavBytes(9)
    const { asset } = await makeAudioAsset('JP1 external', externalBytes, 'audio/wav')
    const external = await payload.create({
      collection: 'podcast-episodes',
      data: {
        site: site.id,
        show: show.id,
        title: 'Externally Recorded Episode',
        slug: `pod04-jp1-external-${runId}`,
        audio: asset.id,
        enclosureBytes: externalBytes.byteLength,
        enclosureMimeType: 'audio/wav',
        status: 'draft',
      } as any,
      overrideAccess: true,
    })
    await walkToReview(String(external.id))
    await recordEpisodeApproval(payload as never, {
      episodeId: String(external.id),
      approver: 'jp1-staff',
      decision: 'approved',
    })
    await publishEpisode(payload as never, String(external.id), { by: 'jp1-staff' })

    const feed = await publicFeed(show.slug)
    expect(feed.status).toBe(200)
    expect(feed.body).toContain('<podcast:guid>')
    expect(feed.body).toContain('<podcast:locked')
    expect(feed.body).toContain('<podcast:person')
    expect(feed.body).toContain(String(publishedImported.guid))
    const externalAfter = await payload.findByID({
      collection: 'podcast-episodes',
      id: external.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(feed.body).toContain(String((externalAfter as any).guid))
    // The POD-01 structural validator passes the feed (throws on error).
    expect(() => validatePodcastFeed(feed.body)).not.toThrow()
  }, 120_000)
})

describe('JP-2 — private show spot-check (POD-03 revocation)', () => {
  it('a revoked member token loses the token feed immediately', async () => {
    const show = await makeShow('jp2', { feedVisibility: 'members' })
    const { asset } = await makeAudioAsset('JP2', wavBytes(4), 'audio/wav')
    const episode = await payload.create({
      collection: 'podcast-episodes',
      data: {
        site: site.id,
        show: show.id,
        title: 'JP2 Members Episode',
        slug: `pod04-jp2-ep-${runId}`,
        audio: asset.id,
        enclosureBytes: 444,
        enclosureMimeType: 'audio/wav',
        status: 'published',
        publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      } as any,
      overrideAccess: true,
    })
    const member = await payload.create({
      collection: 'members',
      data: {
        email: `pod04-jp2-${runId}@example.test`,
        displayName: `POD-04 JP2 ${runId}`,
        status: 'active',
      },
      overrideAccess: true,
    })
    const supporter = await payload.create({
      collection: 'supporters',
      data: {
        site: site.id,
        member: member.id,
        displayName: `POD-04 JP2 ${runId}`,
        visibilityPreference: 'public',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'entitlements',
      data: {
        site: site.id,
        supporter: supporter.id,
        entitlement: `podcast-show:${show.id}.listen`,
        source: `pod04-test:${runId}`,
        startsAt: new Date(Date.now() - 86_400_000).toISOString(),
        resource: `podcast-show:${show.id}`,
        capability: 'listen',
        grantKey: `pod04-${runId}-jp2`,
      } as any,
      overrideAccess: true,
    })
    const { token } = await issueToken(payload as never, { memberId: member.id, showId: show.id })
    const feedRequest = () =>
      memberFeedGet(
        new Request(`http://localhost:3000/podcasts/${show.slug}/member-feed/${token}`),
        { params: Promise.resolve({ slug: show.slug, token }) },
      )
    const before = await feedRequest()
    expect(before.status).toBe(200)
    expect(await before.text()).toContain(String((episode as any).guid ?? ''))

    await revokeToken(payload as never, { memberId: member.id, showId: show.id })
    expect((await feedRequest()).status).toBe(404)
  }, 120_000)
})

describe('JP-3 — production desk (states, calendar, guests, approvals, publish path)', () => {
  it('walks idea → published with every gate, then replace-audio / withdraw / restore preserve the GUID', async () => {
    const show = await makeShow('jp3', { guestConsentPolicy: 'warn' })
    const audioOne = wavBytes(5, 400)
    const audioTwo = wavBytes(6, 900)
    const first = await makeAudioAsset('JP3 master v1', audioOne, 'audio/wav')
    const second = await makeAudioAsset('JP3 master v2', audioTwo, 'audio/wav')
    const episode = await payload.create({
      collection: 'podcast-episodes',
      data: {
        site: site.id,
        show: show.id,
        title: 'JP3 Desk Episode',
        slug: `pod04-jp3-ep-${runId}`,
        audio: first.asset.id,
        enclosureBytes: audioOne.byteLength,
        enclosureMimeType: 'audio/wav',
        status: 'draft',
      } as any,
      overrideAccess: true,
    })
    const episodeId = String(episode.id)
    const guid = String((episode as any).guid)
    expect(guid).toBeTruthy()

    // Illegal jump: idea → published is refused by the state machine.
    await expect(
      transitionProductionState(payload as never, episodeId, 'published' as any),
    ).rejects.toMatchObject({ code: 'PODCAST_PRODUCTION_TRANSITION_INVALID' })

    // idea → scripted → (session) scheduled-record → recorded → editing → review
    await transitionProductionState(payload as never, episodeId, 'scripted' as any)
    const session = await scheduleRecordingSession(payload as never, {
      episodeId,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 90_000_000).toISOString(),
      timeZone: 'America/Chicago',
      actorId: 'jp3-staff',
    })
    expect(session.title).toContain('JP3 Desk Episode')
    const afterSession = await payload.findByID({
      collection: 'podcast-episodes',
      id: episodeId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect((afterSession as any).productionState).toBe('scheduled-record')
    const sessions = await listRecordingSessions(payload as never, episodeId)
    expect(sessions).toHaveLength(1)
    expect(String(sessions[0].id)).toBe(String(session.id))
    expect(sessions[0].structuredData).toMatchObject({
      kind: 'recording-session',
      episodeId,
      showId: String(show.id),
    })

    await transitionProductionState(payload as never, episodeId, 'recorded' as any)
    await transitionProductionState(payload as never, episodeId, 'editing' as any)
    await transitionProductionState(payload as never, episodeId, 'review' as any)

    // The approval gate actually blocks: no approval recorded yet.
    await expect(
      publishEpisode(payload as never, episodeId, { by: 'jp3-staff' }),
    ).rejects.toMatchObject({
      code: 'PODCAST_APPROVAL_REQUIRED',
      name: 'PodcastApprovalRequiredError',
    })
    // A rejected decision does not satisfy the gate either.
    await recordEpisodeApproval(payload as never, {
      episodeId,
      approver: 'jp3-staff',
      decision: 'changes-requested',
      note: 'Fix the cold open.',
    })
    await expect(
      publishEpisode(payload as never, episodeId, { by: 'jp3-staff' }),
    ).rejects.toMatchObject({
      code: 'PODCAST_APPROVAL_REQUIRED',
    })

    // Guest book: consent-missing guest flagged per policy.
    const guest = await createPodcastGuest(payload as never, {
      siteId: site.id,
      name: 'JP3 Guest',
      email: 'guest@example.test',
      bio: 'A fixture guest.',
    })
    const appearance = await addGuestAppearance(payload as never, {
      guestId: String(guest.id),
      episodeId,
      prepNotes: 'Ask about the new book.',
      questions: ['What changed since last time?'],
    })
    expect(appearance.consentAt).toBeFalsy()
    const showDoc = await payload.findByID({
      collection: 'podcast-shows',
      id: show.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    const warned = await assertGuestAdmissionReady(payload as never, showDoc, String(guest.id))
    expect(warned.ready).toBe(true)
    expect(warned.policy).toBe('warn')
    expect(warned.warnings).toHaveLength(1)
    expect(warned.missingAppearanceIds).toEqual([String(appearance.id)])

    await payload.update({
      collection: 'podcast-shows',
      id: show.id,
      data: { guestConsentPolicy: 'block' } as any,
      overrideAccess: true,
    })
    const blockedShow = await payload.findByID({
      collection: 'podcast-shows',
      id: show.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    await expect(
      assertGuestAdmissionReady(payload as never, blockedShow, String(guest.id)),
    ).rejects.toMatchObject({ code: 'PODCAST_GUEST_CONSENT_REQUIRED' })

    await recordGuestConsent(payload as never, String(appearance.id), {
      consentBy: 'jp3-staff',
      consentScope: 'Record and publish this appearance.',
      releaseUrl: 'https://example.test/release',
    })
    const admitted = await assertGuestAdmissionReady(
      payload as never,
      blockedShow,
      String(guest.id),
    )
    expect(admitted).toMatchObject({ ready: true, warnings: [] })

    // Approve and publish; the board and the feed agree.
    await recordEpisodeApproval(payload as never, {
      episodeId,
      approver: 'jp3-staff',
      decision: 'approved',
    })
    const published = await publishEpisode(payload as never, episodeId, { by: 'jp3-staff' })
    expect(published.productionState).toBe('published')
    expect(published.status).toBe('published')
    const board = await productionBoard(payload as never, String(show.id))
    expect(board.counts.published).toBe(1)
    expect(board.byState.published.map((entry: any) => String(entry.id))).toContain(episodeId)

    let feed = await publicFeed(show.slug)
    expect(feed.status).toBe(200)
    expect(feed.body).toContain(guid)
    expect(feed.body).toContain(`length="${audioOne.byteLength}"`)

    // Replace audio: GUID unchanged, enclosure length follows the new master.
    const replaced = await replaceEpisodeAudio(payload as never, episodeId, String(second.asset.id))
    expect(String(replaced.guid)).toBe(guid)
    expect(Number(replaced.enclosureBytes)).toBe(audioTwo.byteLength)
    feed = await publicFeed(show.slug)
    expect(feed.body).toContain(guid)
    expect(feed.body).toContain(`length="${audioTwo.byteLength}"`)
    expect(feed.body).not.toContain(`length="${audioOne.byteLength}"`)

    // Withdraw: gone from the feed on the next request. Restore: back, same GUID.
    const withdrawn = await withdrawEpisode(payload as never, episodeId, { by: 'jp3-staff' })
    expect(withdrawn.productionState).toBe('withdrawn')
    expect(withdrawn.status).toBe('unavailable')
    feed = await publicFeed(show.slug)
    expect(feed.body).not.toContain(guid)

    const restored = await restoreEpisode(payload as never, episodeId, { by: 'jp3-staff' })
    expect(restored.productionState).toBe('published')
    expect(String(restored.guid)).toBe(guid)
    feed = await publicFeed(show.slug)
    expect(feed.body).toContain(guid)
    expect(() => validatePodcastFeed(feed.body)).not.toThrow()
  }, 120_000)

  it('staff production API rejects unauthenticated calls', async () => {
    const res = await productionBoardGet(
      new Request('http://localhost:3000/api/podcast-studio/production?showId=nope'),
    )
    expect(res.status).toBe(401)
  })
})

describe('Recovery — record-level episode + asset restore (platform backup UNVERIFIED)', () => {
  it('restores a deleted episode + audio asset from an exported record snapshot with GUID and bytes intact', async () => {
    const show = await makeShow('recovery')
    const bytes = wavBytes(8, 640)
    const { asset, blob, key } = await makeAudioAsset('Recovery', bytes, 'audio/wav')
    const episode = await payload.create({
      collection: 'podcast-episodes',
      data: {
        site: site.id,
        show: show.id,
        title: 'Recovery Episode',
        slug: `pod04-recovery-ep-${runId}`,
        audio: asset.id,
        enclosureBytes: bytes.byteLength,
        enclosureMimeType: 'audio/wav',
        status: 'draft',
      } as any,
      overrideAccess: true,
    })
    await walkToReview(String(episode.id))
    await recordEpisodeApproval(payload as never, {
      episodeId: String(episode.id),
      approver: 'recovery-staff',
      decision: 'approved',
    })
    await publishEpisode(payload as never, String(episode.id), { by: 'recovery-staff' })

    // Export: record-level snapshot of episode + asset + blob + bytes.
    const episodeDoc = (await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    const assetDoc = (await payload.findByID({
      collection: 'media-assets',
      id: asset.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    const blobDoc = (await payload.findByID({
      collection: 'media-blobs',
      id: blob.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    const storage = mediaStorage(loadConfig())
    const storedBytes = await storage.get(key)
    expect(storedBytes && Buffer.from(storedBytes).equals(Buffer.from(bytes))).toBe(true)
    const snapshot = JSON.parse(
      JSON.stringify({ episode: episodeDoc, asset: assetDoc, blob: blobDoc, key }),
    )
    const guid = String(episodeDoc.guid)

    // Loss: records deleted, stored bytes removed.
    await payload.delete({
      collection: 'podcast-episodes',
      id: episode.id,
      overrideAccess: true,
    } as never)
    await payload.delete({
      collection: 'media-assets',
      id: asset.id,
      overrideAccess: true,
    } as never)
    await payload.delete({ collection: 'media-blobs', id: blob.id, overrideAccess: true } as never)
    await storage.remove(key)
    expect(await storage.get(key)).toBeUndefined()
    let feed = await publicFeed(show.slug)
    expect(feed.body).not.toContain(guid)

    // Restore from the snapshot (same ids where Payload accepts them;
    // the GUID is carried explicitly either way).
    await storage.put(key, bytes, 'audio/wav')
    const { id: _blobId, createdAt: _b1, updatedAt: _b2, ...blobData } = snapshot.blob
    const restoredBlob = await payload
      .create({
        collection: 'media-blobs',
        data: { ...blobData, id: snapshot.blob.id } as any,
        overrideAccess: true,
      })
      .catch(() =>
        payload.create({ collection: 'media-blobs', data: blobData as any, overrideAccess: true }),
      )
    const { id: _assetId, createdAt: _a1, updatedAt: _a2, ...assetData } = snapshot.asset
    const restoredAsset = await payload
      .create({
        collection: 'media-assets',
        data: { ...assetData, originalBlob: restoredBlob.id, id: snapshot.asset.id } as any,
        overrideAccess: true,
      })
      .catch(() =>
        payload.create({
          collection: 'media-assets',
          data: { ...assetData, originalBlob: restoredBlob.id } as any,
          overrideAccess: true,
        }),
      )
    const { id: _epId, createdAt: _e1, updatedAt: _e2, ...episodeData } = snapshot.episode
    const restoredEpisode = await payload.create({
      collection: 'podcast-episodes',
      data: { ...episodeData, audio: restoredAsset.id } as any,
      overrideAccess: true,
    })
    expect(String((restoredEpisode as any).guid)).toBe(guid)
    expect((restoredEpisode as any).productionState).toBe('published')
    expect(Number((restoredEpisode as any).enclosureBytes)).toBe(bytes.byteLength)
    const restoredBytes = await storage.get(key)
    expect(restoredBytes && Buffer.from(restoredBytes).equals(Buffer.from(bytes))).toBe(true)

    feed = await publicFeed(show.slug)
    expect(feed.status).toBe(200)
    expect(feed.body).toContain(guid)
    expect(feed.body).toContain(`length="${bytes.byteLength}"`)
    expect(() => validatePodcastFeed(feed.body)).not.toThrow()
  }, 120_000)
})
