import { mkdtemp, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { GET, POST } from '../../src/app/(frontend)/api/creator-studio/external-video/route'
import {
  connectYouTube,
  publicExternalVideo,
  purgeExpiredVideoSnapshots,
  recheckYouTubeAuthorizations,
} from '../../src/modules/creator-studio/external-video'
import type { CreatorCapability } from '../../src/modules/creator-studio/policy'
import { creatorDraftBody } from '../../src/modules/creator-studio/workspace'
import { youtubeReadonly, youtubeUpload } from '../../src/modules/creator-studio/youtube-metadata'
import { consumeMagicLink, issueMagicLink } from '../../src/modules/identity/member-identity'

import { executeSocialQueueItem } from '../../src/modules/social/tasks'
import { youtubeApprovedSettings } from '../../src/modules/social/adapters/youtube'
import { socialHash } from '../../src/modules/social/contracts'
import { encryptSecret } from '../../src/modules/social/security'
import { localMediaStorage } from '../../src/modules/media/storage'

const access = { depth: 0, overrideAccess: true } as const
const channelId = 'UCabcdefghijklmnopqrstuv'
const unrelatedChannel = 'UCabcdefghijklmnopqrstuw'
const externalId = 'ownedVideo1'
const csrf = randomUUID()
const token = 'cre06-fixture-secret-access'
const refresh = 'cre06-fixture-secret-refresh'
let payload: Payload

beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_release_acceptance'))
    throw new Error('Use an isolated PostgreSQL release acceptance database.')
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload?.destroy()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubEnv('CREATOR_YOUTUBE_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_CLIENT_ID', 'fixture-client-id')
  vi.stubEnv('CREATOR_YOUTUBE_CLIENT_SECRET', 'fixture-client-secret')
  vi.stubEnv('CREATOR_YOUTUBE_ALLOWED_CHANNELS', channelId)
  vi.stubEnv(
    'CREATOR_YOUTUBE_REDIRECT_URI',
    'https://video.example.org/api/creator-studio/external-video/callback',
  )
  vi.stubEnv('RENEGADE_ENCRYPTION_KEY', '1'.repeat(64))
})

it('imports a channel video once, preserves local edits, hides private or missing remote data, and purges revoke data', async () => {
  const slug = 'cre06-' + randomUUID().slice(0, 8)
  const host = `${slug}.example.org`
  const origin = `https://${host}`
  const site = await payload.create({
    collection: 'sites',
    ...access,
    data: {
      name: slug,
      slug,
      lifecycle: 'active',
      visibility: 'public',
      communityRegistrationPolicy: 'invite',
      commentReactionCodes: ['thumbs_up'],
      creatorPolicy: { enabled: true, selfServiceSpaces: true },
    },
  })
  await payload.updateGlobal({
    slug: 'site-settings',
    ...access,
    data: { canonicalOrigin: origin, canonicalOriginsBySite: { [site.id]: origin } },
  })
  async function principal(role: string, creatorCapabilities: CreatorCapability[]) {
    const handle = `${slug}-${role}`
    const email = `${handle}@example.test`
    const member = await payload.create({
      collection: 'members',
      ...access,
      data: { email, displayName: handle, status: 'active' },
    })
    const profile = await payload.create({
      collection: 'profiles',
      ...access,
      data: { member: member.id, displayName: handle, handle, visibility: 'public' },
    })
    await payload.create({
      collection: 'member-site-roles',
      ...access,
      data: { site: site.id, member: member.id, role: 'contributor', creatorCapabilities },
    })
    const space = await payload.create({
      collection: 'spaces',
      ...access,
      data: {
        site: site.id,
        profile: profile.id,
        canonicalPath: `/spaces/${handle}`,
        moderationState: 'clear',
      },
    })
    const issued = await issueMagicLink(payload as never, email)
    const session = await consumeMagicLink(payload as never, issued.token!)
    return {
      siteId: site.id,
      memberId: member.id,
      spaceId: space.id,
      session: session!.sessionToken,
    }
  }
  const owner = await principal('maker', [
    'provider.connect',
    'content.draft-own',
    'media.publish-own',
  ])
  const outsider = await principal('outsider', ['provider.connect', 'content.draft-own'])
  const denied = await principal('denied', ['content.draft-own'])

  let revoked = false
  let removed = false
  let privateVideo = false
  let ownerChannel = channelId
  let title = 'Provider title'
  const requests: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(input)
      requests.push(url.pathname)
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
        const params = init?.body as URLSearchParams
        if (revoked)
          return Response.json(
            { error: 'invalid_grant', error_description: token },
            { status: 400 },
          )
        if (params.get('grant_type') === 'refresh_token')
          expect(params.get('refresh_token')).toBe(refresh)
        return Response.json({
          access_token: token,
          refresh_token: refresh,
          scope: youtubeReadonly,
        })
      }
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke') {
        expect((init?.body as URLSearchParams).get('token')).toBe(refresh)
        return new Response(null, { status: 200 })
      }
      expect(url.hostname).toBe('www.googleapis.com')
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`)
      if (url.pathname.endsWith('/channels'))
        return Response.json({
          items: [
            { id: channelId, contentDetails: { relatedPlaylists: { uploads: 'uploads-fixture' } } },
          ],
        })
      if (url.pathname.endsWith('/playlistItems'))
        return Response.json({ items: [{ contentDetails: { videoId: externalId } }] })
      if (url.pathname.endsWith('/videos'))
        return Response.json({
          items: removed
            ? []
            : [
                {
                  id: externalId,
                  snippet: { channelId: ownerChannel, title, description: 'Provider description' },
                  status: {
                    privacyStatus: privateVideo ? 'private' : 'public',
                    embeddable: true,
                    uploadStatus: 'processed',
                  },
                },
              ],
        })
      throw new Error('Unexpected fixture request.')
    }),
  )

  const endpoint = origin + '/api/creator-studio/external-video'
  function request(actor: typeof owner, body?: object, query = '') {
    const headers = {
      host,
      cookie: `renegade-member=${actor.session}; renegade-member-csrf=${csrf}`,
      'x-member-csrf': csrf,
      'content-type': 'application/json',
      // Browsers always send Origin on writes; the site settings above
      // register this origin as canonical, so send it like a browser.
      ...(body ? { origin } : {}),
    }
    return body
      ? POST(new Request(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }))
      : GET(new Request(endpoint + query, { headers }))
  }

  await expect(connectYouTube(payload, denied, 'code', 'verifier')).rejects.toMatchObject({
    status: 403,
  })
  expect(requests).toHaveLength(0)
  await connectYouTube(payload, owner, 'code', 'verifier')
  await expect(connectYouTube(payload, outsider, 'code', 'verifier')).rejects.toMatchObject({
    status: 409,
  })
  const claims = await payload.find({
    collection: 'youtube-channel-claims',
    ...access,
    where: { site: { equals: site.id } },
  })
  expect(claims.totalDocs).toBe(1)
  expect(claims.docs[0].credential).toBeTruthy()
  expect(claims.docs[0].credential).not.toContain(refresh)
  await expect(
    payload.find({ collection: 'youtube-channel-claims', overrideAccess: false }),
  ).rejects.toThrow()

  const catalog = await request(owner, { action: 'catalog' })
  expect(catalog.status).toBe(200)
  expect(await catalog.json()).toMatchObject({ items: [{ externalId, title }] })
  const importBody = { action: 'import', externalId, spaceId: owner.spaceId }
  const imported = await Promise.all([request(owner, importBody), request(owner, importBody)])
  expect(imported.map((result) => result.status)).toEqual([200, 200])
  const [first, duplicate] = await Promise.all(imported.map((result) => result.json()))
  expect(first.contentId).toBe(duplicate.contentId)
  expect(first.id).toBe(duplicate.id)
  expect(
    (
      await payload.count({
        collection: 'content',
        ...access,
        where: { site: { equals: site.id } },
      })
    ).totalDocs,
  ).toBe(1)

  expect(first.displayTitle).toBe(title)
  expect(await publicExternalVideo(payload, site.id, first.contentId)).toBeNull()
  const body = creatorDraftBody('Creator description stays here')
  await payload.update({
    collection: 'content',
    id: first.contentId,
    ...access,
    data: { title: 'Operator title', body, status: 'published', visibility: 'public' },
  })
  title = 'Updated provider title'
  const synced = await request(owner, { action: 'sync', id: first.id })
  expect(await synced.json()).toMatchObject({ title: 'Operator title', snapshot: { title } })
  expect(await publicExternalVideo(payload, site.id, first.contentId)).toMatchObject({
    provider: 'youtube',
    available: true,
  })
  expect((await request(outsider, { action: 'detach', id: first.id })).status).toBe(404)
  expect((await request(outsider, { action: 'sync', id: first.id })).status).toBe(404)
  ownerChannel = unrelatedChannel
  expect((await request(owner, { action: 'sync', id: first.id })).status).toBe(403)
  ownerChannel = channelId

  privateVideo = true
  expect(await (await request(owner, { action: 'sync', id: first.id })).json()).toMatchObject({
    availability: 'private',
    snapshot: { privacy: 'private' },
  })
  expect(await publicExternalVideo(payload, site.id, first.contentId)).toEqual({ available: false })
  removed = true
  expect(await (await request(owner, { action: 'sync', id: first.id })).json()).toMatchObject({
    availability: 'removed',
  })
  expect(await publicExternalVideo(payload, site.id, first.contentId)).toEqual({ available: false })

  revoked = true
  const revoke = await request(owner, { action: 'sync', id: first.id })
  expect(revoke.status).toBe(409)
  const result = await request(owner)
  const view = await result.text()
  for (const secret of [token, refresh, 'fixture-client-secret', 'credential'])
    expect(view + (await revoke.clone().text())).not.toContain(secret)
  expect(JSON.parse(view)).toMatchObject({
    connected: false,
    items: [{ availability: 'disconnected', snapshot: null }],
  })
  expect(
    (
      await payload.findByID({
        collection: 'youtube-channel-claims',
        ...access,
        id: claims.docs[0].id,
      })
    ).credential,
  ).toBeNull()
  expect(
    await payload.findByID({ collection: 'content', ...access, id: first.contentId }),
  ).toMatchObject({ title: 'Operator title', body })
  expect(
    (
      await payload.count({
        collection: 'content',
        ...access,
        where: { site: { equals: site.id } },
      })
    ).totalDocs,
  ).toBe(1)

  revoked = false
  removed = false
  privateVideo = false
  await connectYouTube(payload, owner, 'code-again', 'verifier')
  expect(await (await request(owner, importBody)).json()).toMatchObject({
    contentId: first.contentId,
  })
  await payload.update({
    collection: 'external-video-sources',
    ...access,
    id: first.id,
    data: { expiresAt: '2000-01-01T00:00:00Z' },
  })
  expect(await publicExternalVideo(payload, site.id, first.contentId)).toEqual({ available: false })
  await purgeExpiredVideoSnapshots(payload)
  expect(
    await payload.findByID({ collection: 'external-video-sources', ...access, id: first.id }),
  ).toMatchObject({ availability: 'stale', snapshot: null })
  expect(await (await request(owner, { action: 'disconnect' })).json()).toEqual({
    disconnected: true,
    providerRevoked: true,
  })
  expect(requests.at(-1)).toBe('/revoke')

  await connectYouTube(payload, owner, 'worker-recheck-code', 'verifier')
  expect((await request(owner, importBody)).status).toBe(200)
  revoked = true
  const future = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 24 * 60 * 60 * 1000)
  try {
    await recheckYouTubeAuthorizations(payload)
  } finally {
    future.mockRestore()
  }
  expect(await (await request(owner)).json()).toMatchObject({
    connected: false,
    items: [{ availability: 'disconnected', snapshot: null }],
  })

  const providerRequests = requests.length
  vi.stubEnv('CREATOR_DIRECT_VIDEO_ORIGINS', 'https://media.example.org')
  vi.stubEnv('CREATOR_CUSTOM_EMBED_ORIGINS', 'https://players.example.org')
  for (const [provider, url] of [
    ['vimeo', 'https://vimeo.com/12345'],
    ['direct-video', 'https://media.example.org/video.mp4'],
    ['custom-https', 'https://players.example.org/video/12345'],
  ]) {
    const response = await request(owner, {
      action: 'manual',
      provider,
      url,
      title: 'Manual title',
      spaceId: owner.spaceId,
    })
    expect(response.status).toBe(200)
    const manual = await response.json()
    await payload.update({
      collection: 'content',
      id: manual.contentId,
      ...access,
      data: { status: 'published', visibility: 'public' },
    })
    expect(await publicExternalVideo(payload, site.id, manual.contentId)).toMatchObject({
      provider,
      available: true,
    })
    expect(
      (
        await request(outsider, {
          action: 'manual',
          provider,
          url,
          title: 'Unowned title',
          spaceId: outsider.spaceId,
        })
      ).status,
    ).toBe(404)
    expect(
      await payload.findByID({ collection: 'content', id: manual.contentId, ...access }),
    ).toMatchObject({ title: 'Manual title' })
  }
  expect(
    (
      await request(owner, {
        action: 'manual',
        provider: 'custom-https',
        url: 'https://players.example.org/video/123?token=secret',
        title: 'Unsafe',
        spaceId: owner.spaceId,
      })
    ).status,
  ).toBe(400)
  const directory = await mkdtemp(path.join(tmpdir(), 'cre06-export-'))
  vi.stubEnv('MEDIA_DIR', directory)
  const storage = localMediaStorage(directory)
  const file = 'manual-source.webm'
  const bytes = new Uint8Array([26, 69, 223, 163, 0, 1, 2, 3])
  try {
    await storage.put(file, bytes, 'video/webm')
    const asset = await payload.create({
      collection: 'media-assets',
      ...access,
      data: {
        site: site.id,
        owner: owner.memberId,
        title: 'Manual handoff original',
        kind: 'video',
        storageLocation: file,
        storageProvider: 'local',
        originalFilename: file,
        sizeBytes: bytes.length,
        mimeType: 'video/webm',
        processingState: 'ready',
        rightsStatus: 'approved',
      } as never,
    })
    const query = `?download=${asset.id}`
    const exported = await request(owner, undefined, query)
    expect(exported.status).toBe(200)
    expect(exported.headers.get('content-disposition')).toBe(
      'attachment; filename="manual-source.webm"',
    )
    expect(new Uint8Array(await exported.arrayBuffer())).toEqual(bytes)
    expect((await request(outsider, undefined, query)).status).toBe(404)
  } finally {
    await storage.remove(file)
    await rmdir(directory)
  }
  expect(requests).toHaveLength(providerRequests)
})

it('dispatches an approved native video from disk and stages manual handoff when upload is disabled', async () => {
  vi.stubEnv('CREATOR_YOUTUBE_UPLOAD_AUTHORIZED', 'true')
  const directory = await mkdtemp(path.join(tmpdir(), 'cre06-stream-'))
  vi.stubEnv('MEDIA_DIR', directory)
  const store = localMediaStorage(directory)
  const bytes = new Uint8Array(128 * 1024).fill(23)
  const file = 'fixture-video.mp4'
  await store.put(file, bytes, 'video/mp4')
  try {
    const slug = 'cre06-outbound-' + randomUUID().slice(0, 8)
    const site = await payload.create({
      collection: 'sites',
      ...access,
      data: {
        name: slug,
        slug,
        lifecycle: 'active',
        communityRegistrationPolicy: 'invite',
        commentReactionCodes: ['thumbs_up'],
      },
    })
    const asset = await payload.create({
      collection: 'media-assets',
      ...access,
      data: {
        site: site.id,
        title: 'Owned synthetic video',
        kind: 'video',
        storageLocation: file,
        storageProvider: 'local',
        originalFilename: file,
        sizeBytes: bytes.length,
        mimeType: 'video/mp4',
        processingState: 'ready',
        rightsStatus: 'approved',
      } as never,
    })
    const account = await payload.create({
      collection: 'social-accounts',
      ...access,
      data: {
        site: site.id,
        network: 'youtube',
        actorType: 'site',
        displayName: 'Synthetic channel',
        externalAccountId: channelId,
        capabilityState: 'available',
        credentialHealth: 'healthy',
        connectionReference: `enc:${encryptSecret(JSON.stringify({ refreshToken: refresh }))}`,
      } as never,
    })
    const draft = await payload.create({
      collection: 'social-drafts',
      ...access,
      data: { site: site.id, title: 'Social video', status: 'scheduled' } as never,
    })
    const youtubeSettings = {
      channelId,
      title: 'YouTube title',
      complianceConfirmed: true,
      madeForKids: 'no',
      privacy: 'private',
    }
    async function queueVariant() {
      const text = 'Approved video description'
      const approvalHash = socialHash({
        network: 'youtube',
        text,
        linkUrl: null,
        attachments: [{ mediaAssetId: asset.id, role: 'image' }],
        ...youtubeApprovedSettings('youtube', youtubeSettings),
      })
      const variant = await payload.create({
        collection: 'social-network-variants',
        ...access,
        data: {
          draft: draft.id,
          account: account.id,
          network: 'youtube',
          text,
          label: 'YouTube test',
          attachments: [asset.id],
          approvalHash,
          status: 'scheduled',
          idempotencyKey: randomUUID(),
          youtubeUpload: youtubeSettings,
        },
      })
      const queue = await payload.create({
        collection: 'social-queue-items',
        ...access,
        data: {
          account: account.id,
          variant: variant.id,
          scheduledFor: new Date(0).toISOString(),
          timeZone: 'UTC',
          status: 'scheduled',
          idempotencyKey: `cre06:${variant.id}:${approvalHash}`,
        },
      })
      return queue.id
    }
    const calls: string[] = []
    const session = 'private-session-location'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const url = new URL(input)
        calls.push(url.pathname)
        if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token')
          return Response.json({
            access_token: token,
            scope: `${youtubeReadonly} ${youtubeUpload}`,
          })
        expect(url.hostname).toBe('www.googleapis.com')
        if (url.pathname === '/youtube/v3/channels')
          return Response.json({
            items: [
              { id: channelId, contentDetails: { relatedPlaylists: { uploads: 'fixture' } } },
            ],
          })
        if (init?.method === 'POST')
          return new Response(null, {
            headers: {
              location: `https://www.googleapis.com/upload/youtube/v3/videos?upload_id=${session}`,
            },
          })
        expect(new Headers(init?.headers).get('content-range')).toBe(
          `bytes 0-${bytes.length - 1}/${bytes.length}`,
        )
        expect(new Uint8Array(await new Response(init?.body).arrayBuffer())).toEqual(bytes)
        return Response.json({ id: externalId, session })
      }),
    )
    const live = await queueVariant()
    expect(
      (await executeSocialQueueItem(payload, { queueItemId: live, workerId: 'cre06-test' })).output,
    ).toMatchObject({ status: 'published' })
    const attempts = await payload.find({
      collection: 'social-publish-attempts',
      ...access,
      where: { queueItem: { equals: live } },
    })
    expect(attempts.totalDocs).toBe(1)
    expect(attempts.docs[0].response).toMatchObject({ remoteId: externalId })
    for (const secret of [session, token, refresh])
      expect(JSON.stringify(attempts.docs)).not.toContain(secret)
    expect(calls).toHaveLength(4)

    vi.stubEnv('CREATOR_YOUTUBE_UPLOAD_AUTHORIZED', 'false')
    const manual = await queueVariant()
    expect(
      (await executeSocialQueueItem(payload, { queueItemId: manual, workerId: 'cre06-test' }))
        .output,
    ).toMatchObject({
      status: 'manual-handoff',
      handoff: { network: 'youtube', attachments: [asset.id] },
    })
    expect(calls).toHaveLength(4)
  } finally {
    await store.remove(file)
    await rmdir(directory)
  }
})
