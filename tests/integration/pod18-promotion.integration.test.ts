/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-18 (POD-REQ-38/39/40) on real Payload + Postgres:
 *
 *   episode in review + approval + a connected social account
 *   → publishEpisode with promotion → exactly ONE social-draft in
 *     the social system's own collections (+ one variant carrying
 *     title/excerpt/canonical URL/artwork), status read back as
 *     queued from the social system's state
 *   → a second episode published WITHOUT opt-in enqueues nothing
 *   → newsletter composition creates a DRAFT email-messages issue
 *     carrying the canonical URL (service level, never sent)
 *   → the oEmbed endpoint answers the JSON shape for the public
 *     episode and for a members-only episode (locked: the response
 *     contains no audio URL), and 404s an unpublished episode.
 *
 * Live platform posting / newsletter sending are NOT exercised —
 * no live accounts exist in this environment (see PROMOTION.md).
 *
 * Fixture network is 'bluesky': the acceptance DB's
 * enum_social_accounts_network predates the collection's
 * mastodon/pinterest/telegram/discord values (pre-existing schema
 * drift observed in this stage, unrelated to POD-18).
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import {
  publishEpisode,
  recordEpisodeApproval,
  transitionProductionState,
} from '../../src/modules/podcast-studio/production'
import {
  composeEpisodeNewsletterDraft,
  episodePromotionStatus,
} from '../../src/modules/podcast-studio/promotion'
import { GET as oembedGet } from '../../src/app/(frontend)/api/oembed/route'

const runId = randomUUID().slice(0, 8)
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

let payload: Payload
let site: any
let show: any
let testMediaDir: string
let promotedEpisode: any
let quietEpisode: any
let lockedEpisode: any
let socialAccount: any

async function makeAsset(label: string, kind: string, mimeType: string, fill: number) {
  const bytes = new Uint8Array(1024).fill(fill)
  const storage = mediaStorage(loadConfig())
  const key = `${site.id}/${randomUUID()}.bin`
  await storage.put(key, bytes, mimeType)
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
  } as never)
  return payload.create({
    collection: 'media-assets',
    data: {
      site: site.id,
      title: `POD-18 ${label} ${runId}`,
      kind,
      storageProvider: 'local',
      originalBlob: (blob as any).id,
      storageLocation: key,
      mimeType,
      sizeBytes: bytes.byteLength,
      checksum,
    } as any,
    overrideAccess: true,
  } as never)
}

async function makeEpisode(slugSuffix: string, extra: Record<string, unknown> = {}) {
  const audio = await makeAsset(`${slugSuffix} audio`, 'audio', 'audio/mpeg', 7)
  const artwork = await makeAsset(`${slugSuffix} artwork`, 'image', 'image/png', 9)
  return payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title: `POD-18 Episode ${slugSuffix} ${runId}`,
      slug: `pod18-${slugSuffix}-${runId}`,
      description: 'Release notes for the promotion integration episode.',
      audio: (audio as any).id,
      artwork: (artwork as any).id,
      status: 'draft',
      productionState: 'idea',
      ...extra,
    } as any,
    overrideAccess: true,
  } as never)
}

async function walkToReview(episodeId: string) {
  for (const step of ['recorded', 'editing', 'review'] as const) {
    await transitionProductionState(payload as never, episodeId, step)
  }
  await recordEpisodeApproval(payload as never, {
    episodeId,
    approver: 'pod18-staff',
    decision: 'approved',
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'pod18-int-media-'))
  process.env.MEDIA_DIR = testMediaDir
  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()

  show = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-18 Show ${runId}`,
      slug: `pod18-show-${runId}`,
      description: 'POD-18 fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      lockedOwnerEmail: 'host@example.test',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  } as never)

  socialAccount = await payload.create({
    collection: 'social-accounts' as never,
    data: {
      site: site.id,
      displayName: `POD-18 Bluesky ${runId}`,
      network: 'bluesky',
      actorType: 'site',
      externalAccountId: `pod18-${runId}`,
      capabilityState: 'manual-handoff',
      capabilities: {},
    } as any,
    overrideAccess: true,
  } as never)

  promotedEpisode = await makeEpisode('promoted')
  quietEpisode = await makeEpisode('quiet')
  lockedEpisode = await makeEpisode('locked', { membersOnly: true })
}, 120_000)

afterAll(async () => {
  if (testMediaDir) await rm(testMediaDir, { recursive: true, force: true }).catch(() => undefined)
  await payload?.db.destroy?.()
})

describe('POD-18 promotion on real Payload', () => {
  it('publish with promotion enqueues exactly one social item; opt-out enqueues none', async () => {
    await walkToReview(String(promotedEpisode.id))
    const published = await publishEpisode(payload as never, String(promotedEpisode.id), {
      promoteSocial: true,
      origin: 'http://localhost:3000',
      // Pin this run's account: the shared acceptance site accumulates
      // accounts across runs, and site-wide discovery would (correctly)
      // enqueue one variant per connected account.
      socialAccountIds: [String(socialAccount.id)],
    })
    expect(published.productionState).toBe('published')
    expect(published.promotion?.socialStatus).toBe('queued')

    const drafts = await payload.find({
      collection: 'social-drafts' as never,
      where: {
        canonicalUrl: { equals: `http://localhost:3000/podcasts/episodes/${promotedEpisode.slug}` },
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(drafts.docs).toHaveLength(1)
    const draft = drafts.docs[0] as any
    expect(draft.provenance).toMatchObject({
      source: 'podcast-episode',
      episodeId: String(promotedEpisode.id),
    })
    const variants = await payload.find({
      collection: 'social-network-variants' as never,
      where: { draft: { equals: draft.id } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(variants.docs).toHaveLength(1)
    const variant = variants.docs[0] as any
    expect(variant.network).toBe('bluesky')
    expect(variant.text).toContain(promotedEpisode.title)
    expect(variant.text).toContain('Release notes for the promotion')
    expect(variant.text).toContain(`/podcasts/episodes/${promotedEpisode.slug}`)
    expect(variant.linkUrl).toContain(`/podcasts/episodes/${promotedEpisode.slug}`)
    const attachments = (variant.attachments ?? []).map((a: any) => String(a?.id ?? a))
    expect(attachments).toEqual([String(promotedEpisode.artwork?.id ?? promotedEpisode.artwork)])

    const status = await episodePromotionStatus(payload as never, String(promotedEpisode.id))
    expect(status.socialStatus).toBe('queued')

    // Opt-out: publish the second episode with no promotion.
    await walkToReview(String(quietEpisode.id))
    await publishEpisode(payload as never, String(quietEpisode.id), {
      origin: 'http://localhost:3000',
    })
    const quietDrafts = await payload.find({
      collection: 'social-drafts' as never,
      where: {
        canonicalUrl: { equals: `http://localhost:3000/podcasts/episodes/${quietEpisode.slug}` },
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(quietDrafts.docs).toHaveLength(0)
  })

  it('newsletter composition creates a draft issue with the canonical URL (service level)', async () => {
    const result = await composeEpisodeNewsletterDraft(payload as never, {
      episodeId: String(promotedEpisode.id),
      origin: 'http://localhost:3000',
    })
    expect(result.created).toBe(true)
    const message: any = await payload.findByID({
      collection: 'email-messages',
      id: result.messageId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(message.status).toBe('draft')
    expect(message.kind).toBe('bulk')
    expect(JSON.stringify(message.blocks)).toContain(
      `http://localhost:3000/podcasts/episodes/${promotedEpisode.slug}`,
    )
  })

  it('oEmbed endpoint: JSON shape, locked members-only response with no audio URL, 404 for draft', async () => {
    const call = (episodeSlug: string) =>
      oembedGet(
        new Request(
          `http://localhost:3000/api/oembed?url=${encodeURIComponent(`http://localhost:3000/podcasts/episodes/${episodeSlug}`)}&format=json`,
        ),
      )
    const okRes = await call(promotedEpisode.slug)
    expect(okRes.status).toBe(200)
    const ok = await okRes.json()
    expect(ok.version).toBe('1.0')
    expect(ok.type).toBe('rich')
    expect(ok.html).toContain(`/podcasts/episodes/${promotedEpisode.slug}/embed`)
    expect(ok.html).toContain('<iframe')

    // Publish the locked episode (no promotion), then check its oEmbed.
    await walkToReview(String(lockedEpisode.id))
    await publishEpisode(payload as never, String(lockedEpisode.id), {})
    const lockedRes = await call(lockedEpisode.slug)
    expect(lockedRes.status).toBe(200)
    const lockedText = await lockedRes.text()
    expect(lockedText).not.toContain('/media/')
    expect(lockedText).not.toContain(String(lockedEpisode.audio?.id ?? lockedEpisode.audio))
    const locked = JSON.parse(lockedText)
    expect(locked.html).toContain(`/podcasts/episodes/${lockedEpisode.slug}/embed`)

    const draftEpisode = await makeEpisode('stilldraft')
    const draftRes = await call((draftEpisode as any).slug)
    expect(draftRes.status).toBe(404)
  })
})
