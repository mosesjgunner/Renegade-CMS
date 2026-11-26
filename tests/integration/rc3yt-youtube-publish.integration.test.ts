/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-YT — YouTube publish-out: the operator journey against a faithful
 * YouTube stand-in (token, channels, resumable session, chunk PUT,
 * videos.list processing status). No real network is touched and no
 * live receipt is claimed: the stand-in proves the machinery up to the
 * live leg, which stays NOT RUN until a real channel is connected.
 *
 * Journeys:
 *  A. connect (self-serve OAuth completion) → Post-to-YouTube draft →
 *     approve → schedule → dispatch → processing-confirmed receipt.
 *  B. daily upload quota exhausted → plain-language 100/day failure
 *     with the retry set to the UTC-midnight reset.
 *  C. revoked refresh token → reconnect-required, nothing sent.
 *  D. disconnect revokes at Google and always clears locally
 *     (both provider outcomes, plus the no-token path).
 *  E. still-processing upload stays unknown with its video ID stored,
 *     then read-only reconcile settles it once YouTube finishes.
 */
import { mkdtemp, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { socialHash } from '../../src/modules/social/contracts'
import { encryptSecret } from '../../src/modules/social/security'
import { credentialsForSocialAccount } from '../../src/modules/social/provider-runtime'
import { executeSocialQueueItem } from '../../src/modules/social/tasks'
import { nextUtcMidnight, youtubeApprovedSettings } from '../../src/modules/social/adapters/youtube'
import {
  completeYouTubePublishConnect,
  disconnectYouTubePublishAccount,
} from '../../src/modules/social/youtube-publish-connect'
import { createYouTubePostDraft } from '../../src/modules/social/youtube-post'
import { localMediaStorage } from '../../src/modules/media/storage'
import { assertFixtureSafeDatabase } from '../fixtures/rc2-world'

const access = { overrideAccess: true, depth: 0 } as const
const channelId = 'UCabcdefghijklmnopqrstuv'
const videoId = 'testvideo01'
const publishRefresh = 'publish-refresh-token-fixture'
const accessToken = 'access-token-fixture'

const standin = {
  calls: [] as string[],
  revoked: new Set<string>(),
  revokeFails: false,
  beginError: null as null | { reason: string; status: number },
  uploadStatus: 'processed',
  // Mutable: external-posts are unique per (account, remoteId), so a
  // journey that must prove receipt creation needs its own video ID.
  videoId,
}

function installStandin() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input))
      standin.calls.push(`${init?.method ?? 'GET'} ${url.hostname}${url.pathname}`)
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
        const params = init?.body as URLSearchParams
        if (params.get('grant_type') === 'refresh_token') {
          const token = params.get('refresh_token') ?? ''
          if (standin.revoked.has(token))
            return Response.json({ error: 'invalid_grant' }, { status: 400 })
          return Response.json({
            access_token: accessToken,
            scope:
              'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload',
          })
        }
        return Response.json({
          access_token: accessToken,
          refresh_token: publishRefresh,
          scope:
            'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload',
        })
      }
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke') {
        if (standin.revokeFails) return Response.json({ error: 'server_error' }, { status: 500 })
        const token = (init?.body as URLSearchParams).get('token') ?? ''
        standin.revoked.add(token)
        return new Response(null, { status: 200 })
      }
      expect(url.hostname).toBe('www.googleapis.com')
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${accessToken}`)
      if (url.pathname === '/youtube/v3/channels')
        return Response.json({
          items: [{ id: channelId, contentDetails: { relatedPlaylists: { uploads: 'fixture' } } }],
        })
      if (url.pathname === '/youtube/v3/videos')
        return Response.json({
          items: [
            {
              id: standin.videoId,
              snippet: { channelId },
              status: { uploadStatus: standin.uploadStatus, privacyStatus: 'private' },
            },
          ],
        })
      if (url.searchParams.get('uploadType') === 'resumable') {
        if (standin.beginError)
          return Response.json(
            { error: { errors: [{ reason: standin.beginError.reason }] } },
            { status: standin.beginError.status },
          )
        return new Response(null, {
          headers: {
            location: `https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture-session`,
          },
        })
      }
      // Resumable transfer PUT: consume the bytes, then hand back the ID.
      await new Response(init?.body).arrayBuffer()
      return Response.json({ id: standin.videoId })
    }),
  )
}

let payload: Payload
let siteId: string
let assetId: string
let directory: string

async function seedApprovedItem(input: {
  accountId: string
  title: string
  description: string
}): Promise<{ draftId: string; variantId: string; queueId: string }> {
  const settings = {
    channelId,
    title: input.title,
    privacy: 'private' as const,
    madeForKids: 'no' as const,
    complianceConfirmed: true,
  }
  const draft = await (payload as any).create({
    collection: 'social-drafts',
    data: { site: siteId, title: input.title, status: 'approved' },
    ...access,
  })
  const approvalHash = socialHash({
    network: 'youtube',
    text: input.description,
    linkUrl: null,
    attachments: [{ mediaAssetId: assetId, role: 'image' }],
    ...youtubeApprovedSettings('youtube', settings),
  })
  const variant = await (payload as any).create({
    collection: 'social-network-variants',
    data: {
      draft: draft.id,
      account: input.accountId,
      network: 'youtube',
      label: 'YouTube',
      text: input.description,
      attachments: [assetId],
      youtubeUpload: settings,
      status: 'approved',
      approvalHash,
      approvedAt: new Date().toISOString(),
      idempotencyKey: randomUUID(),
    },
    ...access,
  })
  const queue = await (payload as any).create({
    collection: 'social-queue-items',
    data: {
      variant: variant.id,
      account: input.accountId,
      scheduledFor: new Date(Date.now() - 60_000).toISOString(),
      timeZone: 'UTC',
      status: 'scheduled',
      idempotencyKey: `scheduled:draft:${draft.id}:${variant.id}:${approvalHash}`,
    },
    ...access,
  })
  return { draftId: String(draft.id), variantId: String(variant.id), queueId: String(queue.id) }
}

async function seedAccount(refreshToken: string): Promise<string> {
  // social-accounts is unique on (site, network, externalAccountId) —
  // the same tuple the connect flow upserts — so reuse the row when an
  // earlier journey already created it and just swap the credential.
  const data = {
    capabilityState: 'available',
    credentialHealth: 'healthy',
    connectionReference: `enc:${encryptSecret(JSON.stringify({ refreshToken }))}`,
  }
  const existing = await (payload as any).find({
    collection: 'social-accounts',
    where: {
      and: [
        { site: { equals: siteId } },
        { network: { equals: 'youtube' } },
        { externalAccountId: { equals: channelId } },
      ],
    },
    limit: 1,
    ...access,
  })
  if (existing.docs.length) {
    const updated = await (payload as any).update({
      collection: 'social-accounts',
      id: existing.docs[0].id,
      data,
      ...access,
    })
    return String(updated.id)
  }
  const account = await (payload as any).create({
    collection: 'social-accounts',
    data: {
      site: siteId,
      network: 'youtube',
      actorType: 'site',
      displayName: 'Fixture channel',
      externalAccountId: channelId,
      ...data,
    },
    ...access,
  })
  return String(account.id)
}

beforeAll(async () => {
  assertFixtureSafeDatabase(process.env.DATABASE_URL)
  vi.stubEnv('CREATOR_YOUTUBE_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_UPLOAD_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_PUBLIC_UPLOADS_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_CLIENT_ID', 'test-client-id')
  vi.stubEnv('CREATOR_YOUTUBE_CLIENT_SECRET', 'test-client-secret')
  vi.stubEnv('CREATOR_YOUTUBE_ALLOWED_CHANNELS', channelId)
  vi.stubEnv(
    'CREATOR_YOUTUBE_REDIRECT_URI',
    'https://creator.example.org/api/creator-studio/external-video/callback',
  )
  vi.stubEnv('RENEGADE_ENCRYPTION_KEY', '9'.repeat(64))
  installStandin()
  payload = await getPayload({ config })
  const slug = 'rc3yt-' + randomUUID().slice(0, 8)
  const site = await (payload as any).create({
    collection: 'sites',
    data: {
      name: slug,
      slug,
      lifecycle: 'active',
      communityRegistrationPolicy: 'invite',
      commentReactionCodes: ['thumbs_up'],
    },
    ...access,
  })
  siteId = String(site.id)
  directory = await mkdtemp(path.join(tmpdir(), 'rc3yt-'))
  vi.stubEnv('MEDIA_DIR', directory)
  const store = localMediaStorage(directory)
  const bytes = new Uint8Array(128 * 1024).fill(11)
  await store.put('rc3yt-video.mp4', bytes, 'video/mp4')
  const asset = await (payload as any).create({
    collection: 'media-assets',
    data: {
      site: siteId,
      title: 'Finished Studio video',
      kind: 'video',
      storageLocation: 'rc3yt-video.mp4',
      storageProvider: 'local',
      originalFilename: 'rc3yt-video.mp4',
      sizeBytes: bytes.length,
      mimeType: 'video/mp4',
      processingState: 'ready',
      rightsStatus: 'approved',
    },
    ...access,
  })
  assetId = String(asset.id)
}, 240_000)

afterAll(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  if (directory) await rmdir(directory, { recursive: true }).catch(() => undefined)
})

describe('RC3-YT YouTube publish-out journey', () => {
  it('A. connect → post draft → approve → dispatch → processing-confirmed receipt', async () => {
    const connected = await completeYouTubePublishConnect(payload, {
      siteId,
      code: 'fixture-code',
      verifier: 'fixture-verifier',
    })
    expect(connected.channelId).toBe(channelId)
    const account: any = await (payload as any).findByID({
      collection: 'social-accounts',
      id: connected.accountId,
      ...access,
    })
    expect(account.credentialHealth).toBe('healthy')
    expect(account.connectionReference).toMatch(/^enc:/)
    expect(JSON.stringify(account)).not.toContain(publishRefresh)
    expect(credentialsForSocialAccount(account.connectionReference)).toMatchObject({
      refreshToken: publishRefresh,
    })

    const posted = await createYouTubePostDraft(payload, {
      siteId,
      mediaAssetId: assetId,
      title: 'Journey title',
      description: 'Journey description',
      privacy: 'private',
      madeForKids: 'no',
      complianceConfirmed: true,
    })
    expect(posted.accountId).toBe(connected.accountId)
    const variant: any = await (payload as any).findByID({
      collection: 'social-network-variants',
      id: posted.variantId,
      ...access,
    })
    expect(variant.status).toBe('draft')

    // Approval stays the explicit gate: hash the approved content and
    // schedule it exactly like the review flow does.
    const approvalHash = socialHash({
      network: 'youtube',
      text: 'Journey description',
      linkUrl: null,
      attachments: [{ mediaAssetId: assetId, role: 'image' }],
      ...youtubeApprovedSettings('youtube', variant.youtubeUpload),
    })
    await (payload as any).update({
      collection: 'social-network-variants',
      id: posted.variantId,
      data: { status: 'approved', approvalHash, approvedAt: new Date().toISOString() },
      ...access,
    })
    await (payload as any).update({
      collection: 'social-drafts',
      id: posted.draftId,
      data: { status: 'approved' },
      ...access,
    })
    const queue = await (payload as any).create({
      collection: 'social-queue-items',
      data: {
        variant: posted.variantId,
        account: connected.accountId,
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        timeZone: 'UTC',
        status: 'scheduled',
        idempotencyKey: `scheduled:draft:${posted.draftId}:${posted.variantId}:${approvalHash}`,
      },
      ...access,
    })

    standin.uploadStatus = 'processed'
    const result: any = await executeSocialQueueItem(payload, {
      queueItemId: String(queue.id),
      workerId: 'rc3yt-journey',
    })
    expect(result.output.status).toBe('published')
    expect(result.output.remoteId).toBe(videoId)
    const posts = await (payload as any).find({
      collection: 'external-posts',
      where: { variant: { equals: posted.variantId } },
      limit: 5,
      ...access,
    })
    expect(posts.docs).toHaveLength(1)
    expect(posts.docs[0].remoteId).toBe(videoId)
    expect(posts.docs[0].remoteUrl).toBe(`https://www.youtube.com/watch?v=${videoId}`)
    const attempts = await (payload as any).find({
      collection: 'social-publish-attempts',
      where: { queueItem: { equals: String(queue.id) } },
      limit: 5,
      ...access,
    })
    expect(attempts.docs).toHaveLength(1)
    expect(attempts.docs[0].response.receipt.rawResponse.processingStatus).toBe('processed')
    expect(JSON.stringify(attempts.docs)).not.toContain(publishRefresh)
  })

  it('B. daily upload quota names the 100/day bucket and retries at midnight UTC', async () => {
    const accountId = await seedAccount('quota-refresh-token')
    const item = await seedApprovedItem({
      accountId,
      title: 'Quota title',
      description: 'Quota description',
    })
    standin.beginError = { reason: 'uploadLimitExceeded', status: 403 }
    try {
      const result: any = await executeSocialQueueItem(payload, {
        queueItemId: item.queueId,
        workerId: 'rc3yt-journey',
      })
      expect(result.output.status).toBe('failed')
      const queue: any = await (payload as any).findByID({
        collection: 'social-queue-items',
        id: item.queueId,
        ...access,
      })
      expect(queue.deadLetterReason.kind).toBe('rate-limit')
      expect(queue.deadLetterReason.message).toContain('100 uploads per day')
      const nextAttempt = Date.parse(queue.nextAttemptAt)
      expect(Math.abs(nextAttempt - Date.parse(nextUtcMidnight()))).toBeLessThan(5 * 60_000)
      const posts = await (payload as any).find({
        collection: 'external-posts',
        where: { variant: { equals: item.variantId } },
        limit: 5,
        ...access,
      })
      expect(posts.docs).toHaveLength(0)
    } finally {
      standin.beginError = null
    }
  })

  it('C. a revoked refresh token fails as reconnect-required and sends nothing', async () => {
    standin.revoked.add('revoked-refresh-token')
    const accountId = await seedAccount('revoked-refresh-token')
    const item = await seedApprovedItem({
      accountId,
      title: 'Revoked title',
      description: 'Revoked description',
    })
    const callsBefore = standin.calls.length
    const result: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc3yt-journey',
    })
    expect(result.output.status).toBe('failed')
    expect(result.output.error.kind).toBe('reconnect-required')
    const sent = standin.calls
      .slice(callsBefore)
      .filter((call) => call.includes('/upload/') || call.startsWith('PUT'))
    expect(sent).toHaveLength(0)
  })

  it('D. disconnect revokes at Google when a token exists and always clears locally', async () => {
    const connected = await completeYouTubePublishConnect(payload, {
      siteId,
      code: 'fixture-code',
      verifier: 'fixture-verifier',
    })
    const first = await disconnectYouTubePublishAccount(payload, {
      accountId: connected.accountId,
    })
    expect(first.providerRevoked).toBe(true)
    expect(standin.revoked.has(publishRefresh)).toBe(true)
    let account: any = await (payload as any).findByID({
      collection: 'social-accounts',
      id: connected.accountId,
      ...access,
    })
    expect(account.connectionReference).toBeNull()
    expect(account.credentialHealth).toBe('revoked')

    // No token left: local-only path, honestly reported as null.
    const second = await disconnectYouTubePublishAccount(payload, {
      accountId: connected.accountId,
    })
    expect(second.providerRevoked).toBeNull()

    // Google unreachable/refusing: local still clears, outcome reported false.
    const reconnected = await completeYouTubePublishConnect(payload, {
      siteId,
      code: 'fixture-code',
      verifier: 'fixture-verifier',
    })
    standin.revokeFails = true
    try {
      const third = await disconnectYouTubePublishAccount(payload, {
        accountId: reconnected.accountId,
      })
      expect(third.providerRevoked).toBe(false)
    } finally {
      standin.revokeFails = false
    }
    account = await (payload as any).findByID({
      collection: 'social-accounts',
      id: reconnected.accountId,
      ...access,
    })
    expect(account.connectionReference).toBeNull()
    standin.revoked.delete(publishRefresh)
  })

  it('E. still-processing stays unknown with the video ID stored; reconcile settles it', async () => {
    standin.videoId = 'testvideo02'
    const accountId = await seedAccount('processing-refresh-token')
    const item = await seedApprovedItem({
      accountId,
      title: 'Processing title',
      description: 'Processing description',
    })
    const sessionsStarted = () =>
      standin.calls.filter((call) => call === 'POST www.googleapis.com/upload/youtube/v3/videos')
        .length
    const sessionsBefore = sessionsStarted()
    standin.uploadStatus = 'uploaded'
    const first: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc3yt-journey',
    })
    expect(first.output.status).toBe('unknown')
    const attempts = await (payload as any).find({
      collection: 'social-publish-attempts',
      where: { queueItem: { equals: item.queueId } },
      limit: 5,
      ...access,
    })
    expect(attempts.docs).toHaveLength(1)
    expect(attempts.docs[0].response).toMatchObject({ remoteId: 'testvideo02' })
    const postsBefore = await (payload as any).find({
      collection: 'external-posts',
      where: { variant: { equals: item.variantId } },
      limit: 5,
      ...access,
    })
    expect(postsBefore.docs).toHaveLength(0)

    standin.uploadStatus = 'processed'
    const settled: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc3yt-journey',
      mode: 'reconcile',
    })
    expect(settled.output.status).toBe('published')
    const posts = await (payload as any).find({
      collection: 'external-posts',
      where: { variant: { equals: item.variantId } },
      limit: 5,
      ...access,
    })
    expect(posts.docs).toHaveLength(1)
    expect(posts.docs[0].remoteId).toBe('testvideo02')
    // Reconcile is read-only: the dispatch began the only upload session.
    expect(sessionsStarted()).toBe(sessionsBefore + 1)
  })
})
