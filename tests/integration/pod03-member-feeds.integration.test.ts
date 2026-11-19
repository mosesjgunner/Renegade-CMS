/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-03 (POD-REQ-08) acceptance matrix against real Payload + Postgres:
 * two entitled members + one member whose entitlement is revoked.
 * Current members fetch the token feed and enclosures; the revoked
 * member fails feed AND enclosure immediately (entitlement is checked
 * at serve time); token revocation and rotation kill old URLs at
 * once; token-less requests fail; public shows/episodes are
 * unaffected; members-only episodes are absent from the public feed;
 * the raw token is never persisted (hash-only, asserted on the DB doc).
 *
 * HTTP-level proof only — real podcast-client behaviour with token
 * feeds stays UNVERIFIED.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { digest } from '../../src/modules/identity/member-identity'
import {
  hashFeedToken,
  issueToken,
  memberEnclosurePath,
  memberFeedPath,
  resolveToken,
  revokeToken,
  rotateToken,
} from '../../src/modules/podcast-studio/member-feeds'
import { GET as publicFeedGet } from '../../src/app/(frontend)/podcasts/[slug]/feed.xml/route'
import { GET as memberFeedGet } from '../../src/app/(frontend)/podcasts/[slug]/member-feed/[token]/route'
import { GET as enclosureGet } from '../../src/app/(frontend)/podcasts/[slug]/member-feed/[token]/episode/[episodeId]/audio/route'
import { GET as mediaGet } from '../../src/app/(frontend)/media/[id]/route'
import {
  GET as apiListTokens,
  POST as apiIssueToken,
} from '../../src/app/(frontend)/api/podcast-studio/member-feeds/route'
import { POST as apiRotateToken } from '../../src/app/(frontend)/api/podcast-studio/member-feeds/rotate/route'
import { POST as apiRevokeToken } from '../../src/app/(frontend)/api/podcast-studio/member-feeds/revoke/route'
import { seed } from '../../src/scripts/seed'

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')

const wavBytes = (fill: number) => {
  const dataSize = 400
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
let testMediaDir: string
let site: any
const runId = randomUUID().slice(0, 8)

let membersShow: any
let publicShow: any
let epMembersPublic: any // members show, not flagged (private via the show)
let epMembersOnly: any // members show, flagged
let epPublicPublic: any // public show, public episode
let epPublicMembers: any // public show, members-only episode
let audioAsset: any
const audioBytes = wavBytes(7)

let memberA: any
let memberB: any
let memberC: any
let entitlementC: any
let tokenA: string
let tokenB: string
let tokenC: string

const feedRequest = (slug: string, token: string) =>
  memberFeedGet(new Request(`http://localhost:3000/podcasts/${slug}/member-feed/${token}`), {
    params: Promise.resolve({ slug, token }),
  })
const enclosureRequest = (slug: string, token: string, episodeId: string, headers?: HeadersInit) =>
  enclosureGet(
    new Request(
      `http://localhost:3000/podcasts/${slug}/member-feed/${token}/episode/${episodeId}/audio`,
      { headers },
    ),
    { params: Promise.resolve({ slug, token, episodeId }) },
  )

async function createMember(label: string) {
  const member = await payload.create({
    collection: 'members',
    data: {
      email: `pod03-${label}-${runId}@example.test`,
      displayName: `POD-03 ${label} ${runId}`,
      status: 'active',
    },
    overrideAccess: true,
  })
  const supporter = await payload.create({
    collection: 'supporters',
    data: {
      site: site.id,
      member: member.id,
      displayName: `POD-03 ${label} ${runId}`,
      visibilityPreference: 'public',
    },
    overrideAccess: true,
  })
  return { member, supporter }
}

async function grantEntitlement(supporter: any, show: any, label: string) {
  // Direct entitlement rows in the exact shape
  // recomputeSubscriptionEntitlements writes for a subscription plan
  // granting resource `podcast-show:<showId>` / capability `listen`
  // (the show's default POD-03 binding).
  return payload.create({
    collection: 'entitlements',
    data: {
      site: site.id,
      supporter: supporter.id,
      entitlement: `podcast-show:${show.id}.listen`,
      source: `pod03-test:${runId}`,
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      resource: `podcast-show:${show.id}`,
      capability: 'listen',
      grantKey: `pod03-${runId}-${label}`,
    } as any,
    overrideAccess: true,
  })
}

async function createEpisode(show: any, slug: string, title: string, membersOnly: boolean) {
  return payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title,
      slug,
      audio: audioAsset.id,
      membersOnly,
      enclosureBytes: audioBytes.byteLength,
      enclosureMimeType: 'audio/wav',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'pod03-int-media-'))
  process.env.MEDIA_DIR = testMediaDir

  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()

  const storage = mediaStorage(loadConfig())
  const audioKey = `${site.id}/${randomUUID()}.wav`
  await storage.put(audioKey, audioBytes, 'audio/wav')
  const audioBlob = await payload.create({
    collection: 'media-blobs',
    data: {
      site: site.id,
      storageKey: audioKey,
      storageProvider: 'local',
      mimeType: 'audio/wav',
      sizeBytes: audioBytes.byteLength,
      checksum: `sha256:pod03-audio-${runId}`,
      state: 'ready',
    },
    overrideAccess: true,
  })
  audioAsset = await payload.create({
    collection: 'media-assets',
    data: {
      site: site.id,
      title: `POD-03 Audio ${runId}`,
      kind: 'audio',
      storageProvider: 'local',
      originalBlob: audioBlob.id,
      storageLocation: audioKey,
      mimeType: 'audio/wav',
      sizeBytes: audioBytes.byteLength,
      checksum: `sha256:pod03-audio-${runId}`,
      durationSeconds: 1,
    } as any,
    overrideAccess: true,
  })

  membersShow = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-03 Members Show ${runId}`,
      slug: `pod03-members-${runId}`,
      description: 'Members-only fixture show.',
      rssEnabled: true,
      feedVisibility: 'members',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  })
  publicShow = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-03 Public Show ${runId}`,
      slug: `pod03-public-${runId}`,
      description: 'Public fixture show with one members-only episode.',
      rssEnabled: true,
      feedVisibility: 'public',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  })

  epMembersPublic = await createEpisode(
    membersShow,
    `pod03-m-open-${runId}`,
    `Members Show Open Episode ${runId}`,
    false,
  )
  epMembersOnly = await createEpisode(
    membersShow,
    `pod03-m-only-${runId}`,
    `Members Show Private Episode ${runId}`,
    true,
  )
  epPublicPublic = await createEpisode(
    publicShow,
    `pod03-p-open-${runId}`,
    `Public Show Open Episode ${runId}`,
    false,
  )
  epPublicMembers = await createEpisode(
    publicShow,
    `pod03-p-only-${runId}`,
    `Public Show Private Episode ${runId}`,
    true,
  )

  const a = await createMember('a')
  const b = await createMember('b')
  const c = await createMember('c')
  memberA = a.member
  memberB = b.member
  memberC = c.member
  await grantEntitlement(a.supporter, membersShow, 'a-members')
  await grantEntitlement(b.supporter, membersShow, 'b-members')
  entitlementC = await grantEntitlement(c.supporter, membersShow, 'c-members')
  await grantEntitlement(a.supporter, publicShow, 'a-public')
  // Member B deliberately holds NO entitlement for the public show.

  tokenA = (await issueToken(payload as never, { memberId: memberA.id, showId: membersShow.id }))
    .token
  tokenB = (await issueToken(payload as never, { memberId: memberB.id, showId: membersShow.id }))
    .token
  tokenC = (await issueToken(payload as never, { memberId: memberC.id, showId: membersShow.id }))
    .token
}, 120_000)

afterAll(async () => {
  if (testMediaDir) await rm(testMediaDir, { recursive: true, force: true }).catch(() => undefined)
  await payload?.db.destroy?.()
})

describe('POD-03 private & member podcast feeds', () => {
  it('entitled members fetch the token feed with token-scoped enclosures and stream them (incl. ranges)', async () => {
    for (const token of [tokenA, tokenB]) {
      const res = await feedRequest(membersShow.slug, token)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toContain('no-store')
      const body = await res.text()
      expect(body).toContain(`Members Show Open Episode ${runId}`)
      expect(body).toContain(`Members Show Private Episode ${runId}`)
      // Enclosures are token-scoped, never public /media/ URLs.
      expect(body).toContain(`/member-feed/${token}/episode/${epMembersOnly.id}/audio`)
      expect(body).not.toContain(`/media/${audioAsset.id}`)
    }

    const full = await enclosureRequest(membersShow.slug, tokenA, epMembersOnly.id)
    expect(full.status).toBe(200)
    expect(full.headers.get('content-type')).toBe('audio/wav')
    const fullBytes = new Uint8Array(await full.arrayBuffer())
    expect(fullBytes).toEqual(audioBytes)

    const ranged = await enclosureRequest(membersShow.slug, tokenB, epMembersPublic.id, {
      Range: 'bytes=0-99',
    })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('content-range')).toBe(`bytes 0-99/${audioBytes.byteLength}`)
    const rangedBytes = new Uint8Array(await ranged.arrayBuffer())
    expect(rangedBytes).toEqual(audioBytes.subarray(0, 100))

    // Hash-only persistence: the DB doc holds the sha256, never the raw token.
    const resolved = await resolveToken(payload as never, tokenA)
    expect(resolved?.memberId).toBe(String(memberA.id))
    const doc: any = await payload.findByID({
      collection: 'podcast-feed-tokens',
      id: resolved!.tokenId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(doc.tokenHash).toBe(hashFeedToken(tokenA))
    expect(doc.tokenHash).toBe(sha256Hex(tokenA))
    expect(JSON.stringify(doc)).not.toContain(tokenA)
  })

  it('keeps members-only episodes absent from public outputs while public content is unaffected', async () => {
    // Members show: no public feed at all.
    const membersPublic = await publicFeedGet(
      new Request(`http://localhost:3000/podcasts/${membersShow.slug}/feed.xml`),
      { params: Promise.resolve({ slug: membersShow.slug }) },
    )
    expect(membersPublic.status).toBe(404)

    // Public show: public episode present with a public enclosure,
    // members-only episode ABSENT (not listed without an enclosure).
    const publicRes = await publicFeedGet(
      new Request(`http://localhost:3000/podcasts/${publicShow.slug}/feed.xml`),
      { params: Promise.resolve({ slug: publicShow.slug }) },
    )
    expect(publicRes.status).toBe(200)
    const publicBody = await publicRes.text()
    expect(publicBody).toContain(`Public Show Open Episode ${runId}`)
    expect(publicBody).toContain(`/media/${audioAsset.id}`)
    expect(publicBody).not.toContain(`Public Show Private Episode ${runId}`)

    // The public episode still streams through the ordinary media route.
    const mediaRes = await mediaGet(new Request(`http://localhost:3000/media/${audioAsset.id}`), {
      params: Promise.resolve({ id: String(audioAsset.id) }),
    })
    expect(mediaRes.status).toBe(200)

    // Token feed on the public show: entitled A sees both episodes;
    // unentitled B sees only the public one.
    const publicShowTokenA = (
      await issueToken(payload as never, { memberId: memberA.id, showId: publicShow.id })
    ).token
    const feedA = await memberFeedGet(
      new Request(`http://localhost:3000${memberFeedPath(publicShow.slug, publicShowTokenA)}`),
      { params: Promise.resolve({ slug: publicShow.slug, token: publicShowTokenA }) },
    )
    expect(feedA.status).toBe(200)
    const feedABody = await feedA.text()
    expect(feedABody).toContain(`Public Show Open Episode ${runId}`)
    expect(feedABody).toContain(`Public Show Private Episode ${runId}`)

    const publicShowTokenB = (
      await issueToken(payload as never, { memberId: memberB.id, showId: publicShow.id })
    ).token
    const feedB = await memberFeedGet(
      new Request(`http://localhost:3000${memberFeedPath(publicShow.slug, publicShowTokenB)}`),
      { params: Promise.resolve({ slug: publicShow.slug, token: publicShowTokenB }) },
    )
    expect(feedB.status).toBe(200)
    const feedBBody = await feedB.text()
    expect(feedBBody).toContain(`Public Show Open Episode ${runId}`)
    expect(feedBBody).not.toContain(`Public Show Private Episode ${runId}`)
    // …and B cannot stream the members-only episode even with a valid token.
    const deniedEnclosure = await enclosureGet(
      new Request(
        `http://localhost:3000${memberEnclosurePath(publicShow.slug, publicShowTokenB, epPublicMembers.id)}`,
      ),
      {
        params: Promise.resolve({
          slug: publicShow.slug,
          token: publicShowTokenB,
          episodeId: String(epPublicMembers.id),
        }),
      },
    )
    expect(deniedEnclosure.status).toBe(404)
  })

  it('fails immediately on entitlement revocation, token revocation, rotation, and token-less requests', async () => {
    // Token-less / bogus token requests fail on feed and enclosure.
    const bogus = 'A'.repeat(43)
    expect((await feedRequest(membersShow.slug, bogus)).status).toBe(404)
    expect((await enclosureRequest(membersShow.slug, bogus, epMembersOnly.id)).status).toBe(404)

    // C starts entitled…
    expect((await feedRequest(membersShow.slug, tokenC)).status).toBe(200)
    // …then the entitlement is revoked (token untouched): feed AND
    // enclosure fail on the very next request — serve-time checking.
    await payload.update({
      collection: 'entitlements',
      id: entitlementC.id,
      data: { revokedAt: new Date().toISOString() } as any,
      overrideAccess: true,
    })
    expect((await feedRequest(membersShow.slug, tokenC)).status).toBe(404)
    expect((await enclosureRequest(membersShow.slug, tokenC, epMembersOnly.id)).status).toBe(404)

    // Token revocation (B): same immediacy, entitlement still intact.
    await revokeToken(payload as never, { memberId: memberB.id, showId: membersShow.id })
    expect((await feedRequest(membersShow.slug, tokenB)).status).toBe(404)
    expect((await enclosureRequest(membersShow.slug, tokenB, epMembersOnly.id)).status).toBe(404)

    // Rotation (A): old URLs die, the new token works.
    const rotated = await rotateToken(payload as never, {
      memberId: memberA.id,
      showId: membersShow.id,
    })
    expect(rotated.token).not.toBe(tokenA)
    expect((await feedRequest(membersShow.slug, tokenA)).status).toBe(404)
    expect((await enclosureRequest(membersShow.slug, tokenA, epMembersOnly.id)).status).toBe(404)
    expect((await feedRequest(membersShow.slug, rotated.token)).status).toBe(200)
    expect((await enclosureRequest(membersShow.slug, rotated.token, epMembersOnly.id)).status).toBe(
      200,
    )
    tokenA = rotated.token
  })

  it('member API issues a working token once, lists metadata only, and refuses cross-member management', async () => {
    const sessionToken = `pod03-session-${runId}-a`
    const csrf = `pod03-csrf-${runId}`
    await payload.create({
      collection: 'member-sessions',
      data: {
        member: memberA.id,
        tokenHash: digest(sessionToken),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        createdFrom: 'magic-link',
      },
      overrideAccess: true,
    })
    const authed = (extra?: Record<string, string>) => ({
      headers: {
        cookie: `renegade-member=${sessionToken}; renegade-member-csrf=${csrf}`,
        'x-member-csrf': csrf,
        'content-type': 'application/json',
        ...extra,
      },
    })

    // Unauthenticated issue is refused.
    const anon = await apiIssueToken(
      new Request('http://localhost:3000/api/podcast-studio/member-feeds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ showId: membersShow.id }),
      }),
    )
    expect(anon.status).toBe(401)

    // A member cannot manage another member's token.
    const cross = await apiIssueToken(
      new Request('http://localhost:3000/api/podcast-studio/member-feeds', {
        method: 'POST',
        ...authed(),
        body: JSON.stringify({ showId: membersShow.id, memberId: memberB.id }),
      }),
    )
    expect(cross.status).toBe(403)

    // Issue for self: raw token returned once, and it works.
    const issuedRes = await apiIssueToken(
      new Request('http://localhost:3000/api/podcast-studio/member-feeds', {
        method: 'POST',
        ...authed(),
        body: JSON.stringify({ showId: membersShow.id }),
      }),
    )
    expect(issuedRes.status).toBe(200)
    const issuedBody = await issuedRes.json()
    expect(typeof issuedBody.token).toBe('string')
    expect(issuedBody.feedUrl).toContain(`/member-feed/${issuedBody.token}`)
    expect((await feedRequest(membersShow.slug, issuedBody.token)).status).toBe(200)
    // Issuing replaced the module-issued token from the earlier tests.
    expect((await feedRequest(membersShow.slug, tokenA)).status).toBe(404)
    tokenA = issuedBody.token

    // List: metadata only — no token, no hash anywhere in the payload.
    const listRes = await apiListTokens(
      new Request(
        `http://localhost:3000/api/podcast-studio/member-feeds?showId=${membersShow.id}`,
        { headers: authed().headers },
      ),
    )
    expect(listRes.status).toBe(200)
    const listText = await listRes.text()
    expect(listText).not.toContain(tokenA)
    expect(listText).not.toContain(hashFeedToken(tokenA))
    const listBody = JSON.parse(listText)
    expect(listBody.tokens.some((row: any) => row.active)).toBe(true)

    // Rotate via API: old dies, new works.
    const rotateRes = await apiRotateToken(
      new Request('http://localhost:3000/api/podcast-studio/member-feeds/rotate', {
        method: 'POST',
        ...authed(),
        body: JSON.stringify({ showId: membersShow.id }),
      }),
    )
    expect(rotateRes.status).toBe(200)
    const rotateBody = await rotateRes.json()
    expect(rotateBody.token).not.toBe(tokenA)
    expect((await feedRequest(membersShow.slug, tokenA)).status).toBe(404)
    expect((await feedRequest(membersShow.slug, rotateBody.token)).status).toBe(200)
    tokenA = rotateBody.token

    // Revoke via API: feed + enclosure die immediately.
    const revokeRes = await apiRevokeToken(
      new Request('http://localhost:3000/api/podcast-studio/member-feeds/revoke', {
        method: 'POST',
        ...authed(),
        body: JSON.stringify({ showId: membersShow.id }),
      }),
    )
    expect(revokeRes.status).toBe(200)
    expect((await revokeRes.json()).revoked).toBe(1)
    expect((await feedRequest(membersShow.slug, tokenA)).status).toBe(404)
    expect((await enclosureRequest(membersShow.slug, tokenA, epMembersOnly.id)).status).toBe(404)
  })
})
