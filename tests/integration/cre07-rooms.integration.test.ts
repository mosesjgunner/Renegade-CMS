import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPayload, type Payload } from 'payload'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { POST as create } from '../../src/app/(frontend)/api/rooms/route'
import { GET as read, POST as act } from '../../src/app/(frontend)/api/rooms/[roomId]/route'
import { GET as token } from '../../src/app/(frontend)/api/rooms/[roomId]/token/route'
import { GET as media } from '../../src/app/(frontend)/api/rooms/[roomId]/playback/[file]/route'
import { GET as communityMessages } from '../../src/app/(frontend)/api/community/messages/route'
import { roomTransaction } from '../../src/modules/community/rooms'
import { resolveLiveRoomBinding } from '../../src/modules/podcast-studio/live/live-room'
import { setLiveRoomBinding } from '../../src/modules/podcast-studio/live/live-service'
import {
  buildRc2World,
  loginAsMember,
  teardownRc2World,
  type Rc2SiteWorld,
  type Rc2World,
} from '../fixtures/rc2-world'

let payload: Payload
let world: Rc2World
let root: string
let priorRoot: string | undefined
const csrf = 'theater-integration'
const sessions = new Map<string, string>()

beforeAll(async () => {
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
  priorRoot = process.env.ROOM_MEDIA_DIR
  root = await mkdtemp(join(tmpdir(), 'cre07-rooms-'))
  process.env.ROOM_MEDIA_DIR = root
  for (const site of [world.siteA, world.siteB]) {
    for (const actor of [site.admin, site.member]) {
      const session = await loginAsMember(payload, actor)
      sessions.set(actor.memberId, session.headers.get('cookie')!)
    }
  }
}, 240_000)

afterAll(async () => {
  if (priorRoot === undefined) delete process.env.ROOM_MEDIA_DIR
  else process.env.ROOM_MEDIA_DIR = priorRoot
  if (payload && world) {
    const sites = [world.siteA.siteId, world.siteB.siteId]
    await roomTransaction(payload, async (query) => {
      // The disposable fixture owns these two sites. Restore the guard before committing.
      await query('ALTER TABLE messages DISABLE TRIGGER system_messages_immutable_delete')
      await query('DELETE FROM conversations WHERE site_id=ANY($1::uuid[])', [sites])
      await query('ALTER TABLE messages ENABLE TRIGGER system_messages_immutable_delete')
    })
    for (const collection of [
      'podcast-episodes',
      'podcast-shows',
      'entitlements',
      'supporters',
    ] as const)
      await payload.delete({ collection, where: { site: { in: sites } }, overrideAccess: true })
    await teardownRc2World(payload, world)
  }
  if (root) await rm(root, { recursive: true, force: true })
  await payload?.db.destroy?.()
})

function request(
  site: Rc2SiteWorld,
  path: string,
  options: { memberId?: string; playback?: string; body?: unknown; range?: string } = {},
) {
  const headers = new Headers({ host: new URL(site.origin).host, origin: site.origin })
  if (options.memberId)
    headers.set('cookie', `${sessions.get(options.memberId)}; renegade-member-csrf=${csrf}`)
  if (options.playback)
    headers.set('cookie', [headers.get('cookie'), options.playback].filter(Boolean).join('; '))
  if (options.range) headers.set('range', options.range)
  if (options.body) {
    headers.set('x-member-csrf', csrf)
    headers.set('content-type', 'application/json')
  }
  return new Request(`${site.origin}${path}`, {
    headers,
    ...(options.body ? { method: 'POST', body: JSON.stringify(options.body) } : {}),
  })
}

const route = (roomId: string) => ({ params: Promise.resolve({ roomId }) })
const endpoint = (roomId: string) => `/api/rooms/${roomId}`
const overview = (site: Rc2SiteWorld, roomId: string, memberId?: string, view = '') =>
  read(
    request(site, `${endpoint(roomId)}${view ? `?view=${view}` : ''}`, { memberId }),
    route(roomId),
  )
const action = (site: Rc2SiteWorld, roomId: string, memberId: string, body: unknown) =>
  act(request(site, endpoint(roomId), { memberId, body }), route(roomId))
const issue = (site: Rc2SiteWorld, roomId: string, memberId?: string) =>
  token(request(site, `${endpoint(roomId)}/token`, { memberId }), route(roomId))
const fetchMedia = (
  site: Rc2SiteWorld,
  roomId: string,
  file: string,
  memberId?: string,
  playback?: string,
  range?: string,
) =>
  media(request(site, `${endpoint(roomId)}/playback/${file}`, { memberId, playback, range }), {
    params: Promise.resolve({ roomId, file }),
  })
const cookie = (response: Response) => response.headers.get('set-cookie')?.split(';')[0]

async function theater(
  site: Rc2SiteWorld,
  accessPolicy: string,
  options: Record<string, unknown> = {},
) {
  const response = await create(
    request(site, '/api/rooms', {
      memberId: site.admin.memberId,
      body: {
        title: `${accessPolicy} theater ${world.suffix}`,
        mode: 'theater',
        accessPolicy,
        ...options,
      },
    }),
  )
  const room = await response.json()
  expect(response.status, JSON.stringify(room)).toBe(201)
  return room.id as string
}

async function files(
  site: Rc2SiteWorld,
  roomId: string,
  playlist = '#EXTM3U\n#EXTINF:2,\npart.ts\n',
) {
  const folder = join(root, site.siteId, roomId)
  await mkdir(folder, { recursive: true })
  await Promise.all([
    writeFile(join(folder, 'live.m3u8'), playlist),
    writeFile(join(folder, 'part.ts'), 'hls segment'),
    writeFile(join(folder, 'replay.mp4'), 'replay bytes'),
  ])
}

async function grant(site: Rc2SiteWorld, resource: string, capability: string) {
  const existing = await payload.find({
    collection: 'supporters',
    where: { site: { equals: site.siteId }, member: { equals: site.member.memberId } },
    overrideAccess: true,
  })
  const supporter =
    existing.docs[0] ??
    (await payload.create({
      collection: 'supporters',
      data: {
        site: site.siteId,
        member: site.member.memberId,
        displayName: 'Theater supporter',
        visibilityPreference: 'public',
      },
      overrideAccess: true,
    }))
  return payload.create({
    collection: 'entitlements',
    data: {
      site: site.siteId,
      supporter: supporter.id,
      entitlement: `${resource}.${capability}`,
      source: 'cre07-gate',
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      resource,
      capability,
      grantKey: randomUUID(),
    },
    overrideAccess: true,
  })
}

describe('CRE-07 canonical Rooms and protected Theater', () => {
  it('keeps public and member theaters, chat, authentication, and every media request site-scoped', async () => {
    const a = world.siteA
    const b = world.siteB
    const publicRoom = await theater(a, 'public')
    const memberRoom = await theater(b, 'members', { participantLimit: 1 })
    await Promise.all([files(a, publicRoom), files(b, memberRoom)])
    expect((await overview(a, publicRoom)).status).toBe(200)
    expect((await overview(b, memberRoom)).status).toBe(403)
    expect((await overview(a, memberRoom, a.member.memberId)).status).toBe(403)
    const publicToken = await issue(a, publicRoom)
    expect(await publicToken.json()).toEqual({
      live: `${endpoint(publicRoom)}/playback/live.m3u8`,
      replay: `${endpoint(publicRoom)}/playback/replay.mp4`,
    })
    expect(
      (await fetchMedia(a, publicRoom, 'live.m3u8', undefined, cookie(publicToken))).status,
    ).toBe(200)
    expect((await issue(b, memberRoom)).status).toBe(403)
    expect((await issue(b, memberRoom, a.member.memberId)).status).toBe(403)
    expect((await issue(a, memberRoom, b.member.memberId)).status).toBe(403)
    const memberToken = await issue(b, memberRoom, b.member.memberId)
    expect(memberToken.status).toBe(200)
    const playback = cookie(memberToken)
    for (const file of ['live.m3u8', 'part.ts', 'replay.mp4']) {
      expect((await fetchMedia(b, memberRoom, file, undefined, playback)).status).toBe(403)
      expect((await fetchMedia(b, memberRoom, file, b.admin.memberId, playback)).status).toBe(403)
      expect(
        (await fetchMedia(b, memberRoom, file, b.member.memberId, cookie(publicToken))).status,
      ).toBe(403)
      expect((await fetchMedia(b, memberRoom, file, b.member.memberId, playback)).status).toBe(200)
    }
    const range = await fetchMedia(
      b,
      memberRoom,
      'replay.mp4',
      b.member.memberId,
      playback,
      'bytes=1-3',
    )
    expect(range.status).toBe(206)
    expect(await range.text()).toBe('epl')
    const send = {
      action: 'send',
      body: 'Site B question',
      question: true,
      idempotencyKey: 'theater-first',
    }
    expect((await action(b, memberRoom, b.member.memberId, send)).status).toBe(409)
    expect((await action(b, memberRoom, b.member.memberId, { action: 'join' })).status).toBe(200)
    expect((await action(b, memberRoom, b.admin.memberId, { action: 'join' })).status).toBe(409)
    const sent = await action(b, memberRoom, b.member.memberId, send)
    expect(sent.status).toBe(201)
    const { id } = await sent.json()
    expect((await action(b, memberRoom, b.member.memberId, send)).status).toBe(200)
    expect(
      (await action(b, memberRoom, b.member.memberId, { action: 'pin', targetId: id })).status,
    ).toBe(403)
    expect(
      (await action(a, publicRoom, a.admin.memberId, { action: 'pin', targetId: id })).status,
    ).toBe(404)
    expect(
      (await action(b, memberRoom, b.admin.memberId, { action: 'pin', targetId: id })).status,
    ).toBe(200)
    const chat = await (await overview(b, memberRoom, b.member.memberId, 'chat')).json()
    expect(chat.pinned).toMatchObject({ id })
    expect(chat.messages.filter((message: { id: string }) => message.id === id)).toEqual([
      expect.objectContaining({ body_html: send.body, room_question: true }),
    ])
    expect(await (await overview(a, publicRoom, undefined, 'chat')).text()).not.toContain(send.body)
    expect(
      (
        await communityMessages(
          request(a, `/api/community/messages?siteId=${a.siteId}&conversationId=${memberRoom}`, {
            memberId: a.member.memberId,
          }),
        )
      ).status,
    ).toBe(403)
    expect(
      (await action(b, memberRoom, b.member.memberId, { action: 'request-speaker' })).status,
    ).toBe(200)
    expect(
      (
        await action(b, memberRoom, b.admin.memberId, {
          action: 'approve-speaker',
          targetId: b.member.memberId,
        })
      ).status,
    ).toBe(200)
    expect(
      await (await overview(b, memberRoom, b.member.memberId, 'attendees')).json(),
    ).toMatchObject({
      presentCount: 1,
      speakerRequests: [{ member_id: b.member.memberId, status: 'approved' }],
    })
    expect(
      (await action(b, memberRoom, b.admin.memberId, { action: 'remove', targetId: id })).status,
    ).toBe(200)
    const moderated = await (await overview(b, memberRoom, b.member.memberId, 'chat')).json()
    expect(moderated.pinned).toBeNull()
    expect(JSON.stringify(moderated.messages)).not.toContain(send.body)
    expect((await action(b, memberRoom, b.member.memberId, send)).status).toBe(409)
    await files(
      b,
      memberRoom,
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://external.invalid/key"\npart.ts\n',
    )
    expect((await fetchMedia(b, memberRoom, 'live.m3u8', b.member.memberId, playback)).status).toBe(
      502,
    )
    expect((await overview(b, memberRoom, b.member.memberId, 'chat')).status).toBe(200)
  })

  it('rechecks paid and invitation access on issued tokens and resolves a real podcast room', async () => {
    const a = world.siteA
    const b = world.siteB
    const paid = await theater(a, 'paid', {
      entitlementResource: 'theater:test',
      entitlementCapability: 'watch',
    })
    await files(a, paid)
    expect((await issue(a, paid, a.member.memberId)).status).toBe(403)
    const paidGrant = await grant(a, 'theater:test', 'watch')
    const paidToken = await issue(a, paid, a.member.memberId)
    expect(paidToken.status).toBe(200)
    await payload.update({
      collection: 'entitlements',
      id: paidGrant.id,
      data: { revokedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    expect((await overview(a, paid, a.member.memberId, 'chat')).status).toBe(403)
    expect(
      (await fetchMedia(a, paid, 'part.ts', a.member.memberId, cookie(paidToken))).status,
    ).toBe(403)

    const invited = await theater(b, 'invite')
    await files(b, invited)
    expect((await issue(b, invited, b.member.memberId)).status).toBe(403)
    expect(
      (
        await action(b, invited, b.admin.memberId, {
          action: 'invite',
          memberId: b.member.memberId,
        })
      ).status,
    ).toBe(200)
    const inviteToken = await issue(b, invited, b.member.memberId)
    expect(inviteToken.status).toBe(200)
    expect(
      (
        await action(b, invited, b.admin.memberId, {
          action: 'revoke-invite',
          memberId: b.member.memberId,
        })
      ).status,
    ).toBe(200)
    expect(
      (await fetchMedia(b, invited, 'replay.mp4', b.member.memberId, cookie(inviteToken))).status,
    ).toBe(403)

    const show = await payload.create({
      collection: 'podcast-shows',
      data: {
        site: b.siteId,
        title: 'Room show',
        slug: `cre07-show-${world.suffix}`,
        status: 'published',
        structuredDataMode: 'none',
        feedVisibility: 'public',
        guestConsentPolicy: 'off',
      },
      overrideAccess: true,
    })
    const episode = await payload.create({
      collection: 'podcast-episodes',
      data: {
        site: b.siteId,
        show: show.id,
        title: 'Room episode',
        slug: `cre07-episode-${world.suffix}`,
        status: 'published',
        structuredDataMode: 'none',
        productionState: 'published',
      },
      overrideAccess: true,
    })
    await expect(
      setLiveRoomBinding(payload, {
        episodeId: episode.id,
        binding: { roomId: paid, access: 'members' },
      }),
    ).rejects.toMatchObject({ code: 'LIVE_ROOM_NOT_FOUND' })
    await expect(
      resolveLiveRoomBinding(payload, b.siteId, { roomId: 'old-placeholder', access: 'members' }),
    ).rejects.toMatchObject({ code: 'LIVE_ROOM_NOT_FOUND' })
    const bound = await theater(b, 'members')
    const result = await setLiveRoomBinding(payload, {
      episodeId: episode.id,
      binding: { roomId: bound, access: 'members' },
    })
    expect(await resolveLiveRoomBinding(payload, b.siteId, result.liveRoom)).toMatchObject({
      href: `/rooms/${bound}`,
    })
    expect((await issue(b, bound, b.member.memberId)).status).toBe(403)
    await grant(b, `podcast-show:${show.id}`, 'listen')
    expect((await issue(b, bound, b.member.memberId)).status).toBe(200)
  })

  it('keeps content ownership and persistent discussion links within the site', async () => {
    const a = world.siteA
    const b = world.siteB
    const body = {
      mode: 'content-attached',
      title: 'Article chat',
      accessPolicy: 'public',
      contentId: a.publishedArticleId,
      discussionId: a.discussionId,
    }
    const wrongSite = await create(request(b, '/api/rooms', { memberId: b.admin.memberId, body }))
    expect(wrongSite.status).toBe(404)
    const created = await create(request(a, '/api/rooms', { memberId: a.admin.memberId, body }))
    expect(created.status).toBe(201)
    const { id } = await created.json()
    const discussion = await payload.findByID({
      collection: 'discussions',
      id: a.discussionId!,
      overrideAccess: true,
    })
    expect(await (await overview(a, id)).json()).toMatchObject({
      mode: 'content-attached',
      discussionPath: discussion.canonicalPath,
    })
    await roomTransaction(payload, async (query) => {
      await query("UPDATE content SET visibility='private' WHERE id=$1", [a.publishedArticleId])
    })
    expect((await overview(a, id)).status).toBe(403)
    expect((await overview(a, id, a.member.memberId, 'chat')).status).toBe(403)
  })

  it.skipIf(!process.env.CRE07_BROWSER_PORT)(
    'plays real HLS while chat is down and retains member Q&A when the video is down',
    async () => {
      const browserRoot = process.env.CRE07_BROWSER_MEDIA_DIR!
      const source = process.env.CRE07_BROWSER_MEDIA_SOURCE!
      const roomA = await theater(world.siteA, 'public')
      const roomB = await theater(world.siteB, 'members')
      const locations = [
        { site: world.siteA, id: roomA },
        { site: world.siteB, id: roomB },
      ].map(({ site, id }) => ({
        site,
        id,
        origin: `http://${site.host.replace('.rc2-a04.test', '.localhost')}:${process.env.CRE07_BROWSER_PORT}`,
        mediaDir: join(browserRoot, site.siteId, id),
      }))
      for (const location of locations) {
        await mkdir(location.mediaDir, { recursive: true })
        await cp(source, location.mediaDir, { recursive: true })
      }
      await payload.updateGlobal({
        slug: 'site-settings',
        data: {
          canonicalOrigin: locations[0].origin,
          canonicalOriginsBySite: Object.fromEntries(
            locations.map(({ site, origin }) => [site.siteId, origin]),
          ),
        },
        overrideAccess: true,
      })
      const browser = await chromium.launch({
        args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1', '--no-proxy-server'],
      })
      try {
        const publicPage = await browser.newPage()
        const pageErrors: string[] = []
        publicPage.on('pageerror', (error) => pageErrors.push(error.message))
        publicPage.on('response', (response) => {
          const path = new URL(response.url()).pathname
          if (path.startsWith('/_next/') && response.status() >= 400)
            pageErrors.push(`${response.status()} ${path}`)
        })
        await publicPage.route(
          (url) => url.pathname === endpoint(roomA) && url.searchParams.get('view') === 'chat',
          (route) => route.fulfill({ status: 503 }),
        )
        const publicResponse = await publicPage.goto(`${locations[0].origin}/rooms/${roomA}`, {
          timeout: 90_000,
        })
        expect(publicResponse?.status()).toBe(200)
        try {
          await publicPage.getByText('Chat is temporarily unavailable.', { exact: false }).waitFor()
        } catch (error) {
          throw new Error(
            `${error}\nBrowser errors: ${pageErrors.join('; ')}\nPage: ${(await publicPage.locator('body').innerText()).slice(0, 500)}`,
          )
        }
        const video = publicPage.getByLabel('Live stream', { exact: true })
        await video.evaluate((element: HTMLVideoElement) => {
          element.muted = true
          return element.play()
        })
        await publicPage.waitForFunction(() => document.querySelector('video')!.currentTime > 1)
        await publicPage.getByRole('link', { name: 'Watch replay' }).click()
        const replay = publicPage.getByLabel('Replay', { exact: true })
        await replay.evaluate((element: HTMLVideoElement) => {
          element.muted = true
          return element.play()
        })
        await publicPage.waitForFunction(() => document.querySelector('video')!.currentTime > 1)

        const deniedPage = await browser.newPage()
        const denied = await deniedPage.goto(`${locations[1].origin}/rooms/${roomB}`)
        expect(denied?.status()).toBe(404)
        await deniedPage.getByRole('heading', { name: 'Room unavailable' }).waitFor()
        expect(await deniedPage.getByLabel('Theater player').count()).toBe(0)

        const memberContext = await browser.newContext()
        await memberContext.addCookies([
          {
            name: 'renegade-member',
            value: sessions.get(world.siteB.member.memberId)!.split('=')[1],
            url: locations[1].origin,
          },
          { name: 'renegade-member-csrf', value: csrf, url: locations[1].origin },
        ])
        const memberPage = await memberContext.newPage()
        await memberPage.route(`**/api/rooms/${roomB}/playback/live.m3u8`, (route) =>
          route.fulfill({ status: 502 }),
        )
        await memberPage.goto(`${locations[1].origin}/rooms/${roomB}`)
        await memberPage.getByRole('button', { name: 'Join chat' }).click()
        await memberPage.getByRole('button', { name: 'Questions', exact: true }).click()
        await memberPage.getByLabel('Your question').fill('Browser Q&A remains available')
        await memberPage.getByRole('button', { name: 'Send question' }).click()
        await memberPage.getByText('Browser Q&A remains available', { exact: true }).waitFor()
        await memberPage.getByRole('button', { name: 'Retry playback' }).waitFor()
        await memberPage.unroute(`**/api/rooms/${roomB}/playback/live.m3u8`)
        await memberPage.getByRole('button', { name: 'Retry playback' }).click()
        await memberPage
          .getByLabel('Live stream', { exact: true })
          .evaluate((element: HTMLVideoElement) => {
            element.muted = true
            return element.play()
          })
        await memberPage.waitForFunction(() => document.querySelector('video')!.currentTime > 1)
      } finally {
        await browser.close()
        for (const { mediaDir } of locations) await rm(mediaDir, { recursive: true, force: true })
      }
    },
    180_000,
  )
})
