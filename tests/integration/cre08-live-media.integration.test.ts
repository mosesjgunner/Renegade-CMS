import { execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { getPayload, type Payload } from 'payload'
import { chromium, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { createRoom, roomQuery, roomTransaction } from '../../src/modules/community/rooms'
import {
  buildRc2World,
  loginAsMember,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

const port = process.env.CRE08_GATEWAY_PORT
const origin = `http://b.localhost:${port}`
const control = process.env.LIVE_MEDIAMTX_CONTROL_URL
const minutes = Number(process.env.CRE08_WATCH_MINUTES ?? 0.1)
const outage = Number(process.env.CRE08_OUTAGE_SECONDS ?? 4)
const remote = process.env.CRE08_VIEWER_WS
const viewerGateway = process.env.CRE08_VIEWER_GATEWAY_IP ?? '127.0.0.1'
const csrf = 'cre08-browser-fixture'
let payload: Payload
let world: Rc2World
let roomId: string

if (port && control) {
  beforeAll(async () => {
    payload = await getPayload({ config })
    world = await buildRc2World(payload)
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: origin,
        canonicalOriginsBySite: {
          [world.siteA.siteId]: `http://a.localhost:${port}`,
          [world.siteB.siteId]: origin,
        },
      },
      overrideAccess: true,
    })
    const room = await createRoom(payload, {
      siteId: world.siteB.siteId,
      creatorMemberId: world.siteB.admin.memberId,
      title: `CRE-08 broadcast ${world.suffix}`,
      mode: 'theater',
      accessPolicy: 'members',
    })
    roomId = room.id
  }, 240_000)

  afterAll(async () => {
    if (payload && world) {
      const sessions = roomId
        ? await roomQuery(payload)<{ id: string }>(
            'SELECT id FROM live_media_sessions WHERE room_id=$1',
            [roomId],
          )
        : { rows: [] }
      for (const { id } of sessions.rows)
        await fetch(`${control}/v3/config/paths/delete/${id}`, { method: 'DELETE' }).catch(
          () => undefined,
        )
      if (roomId)
        await roomTransaction(payload, async (query) => {
          await query('ALTER TABLE messages DISABLE TRIGGER system_messages_immutable_delete')
          await query('DELETE FROM conversations WHERE id=$1', [roomId])
          await query('ALTER TABLE messages ENABLE TRIGGER system_messages_immutable_delete')
        })
      await teardownRc2World(payload, world)
    }
    await payload?.db.destroy?.()
  })
}

async function counts(page: Page) {
  return page.locator('video[aria-label="Live stream"]').evaluate((node) => {
    const video = node as HTMLVideoElement & { webkitAudioDecodedByteCount: number }
    return {
      seconds: video.currentTime,
      frames: video.getVideoPlaybackQuality().totalVideoFrames,
      audioBytes: video.webkitAudioDecodedByteCount,
      droppedFrames: video.getVideoPlaybackQuality().droppedVideoFrames,
    }
  })
}

async function untilPlaying(page: Page, label = 'Live stream') {
  const player = page.getByLabel(label, { exact: true })
  await page.waitForFunction(
    (name) => {
      const player = Array.from(document.querySelectorAll('video')).find(
        (video) => video.ariaLabel === name,
      )
      return player && player.readyState >= 2
    },
    label,
    { timeout: 45_000 },
  )
  await player.evaluate((node) => {
    const video = node as HTMLVideoElement
    video.muted = true
    void video.play().catch(() => undefined)
  })
  await page.waitForFunction(
    (name) => {
      const player = Array.from(document.querySelectorAll('video')).find(
        (video) => video.ariaLabel === name,
      ) as (HTMLVideoElement & { webkitAudioDecodedByteCount: number }) | undefined
      return (
        player &&
        player.currentTime > 1 &&
        player.getVideoPlaybackQuality().totalVideoFrames > 0 &&
        player.webkitAudioDecodedByteCount > 0
      )
    },
    label,
    { timeout: 60_000 },
  )
}

function report(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }))
}

it.skipIf(!port || !control)(
  'broadcasts from the host controls to a protected Theater and reconnects one persisted show with replay',
  async () => {
    const site = world.siteB
    const hostSession = await loginAsMember(payload, site.admin)
    const memberSession = await loginAsMember(payload, site.member)
    const owner = await chromium.launch({
      args: [
        '--host-resolver-rules=MAP *.localhost 127.0.0.1',
        '--no-proxy-server',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    })
    const viewer = remote
      ? await chromium.connectOverCDP(remote, { timeout: 15000 })
      : await chromium.launch({
          args: [`--host-resolver-rules=MAP *.localhost ${viewerGateway}`, '--no-proxy-server'],
        })
    const ownerContext = await owner.newContext()
    const viewerContext = await viewer.newContext()
    try {
      for (const [context, actor] of [
        [ownerContext, hostSession],
        [viewerContext, memberSession],
      ] as const) {
        await context.addCookies([
          {
            name: 'renegade-member',
            value: actor.headers.get('cookie')!.split('=')[1],
            url: origin,
          },
          { name: 'renegade-member-csrf', value: csrf, url: origin },
        ])
      }
      const publicPage = await owner.newPage()
      const denied = await publicPage.goto(`${origin}/rooms/${roomId}`, { timeout: 90_000 })
      expect(denied?.status()).toBe(404)
      await publicPage.close()
      const host = async () => {
        const page = await ownerContext.newPage()
        await page.goto(`${origin}/rooms/${roomId}`, { timeout: 90_000 })
        await page.getByText('Broadcast from this browser', { exact: true }).click()
        await page.getByRole('button', { name: 'Check camera, microphone and provider' }).click()
        await page.waitForFunction(
          () => {
            const video = document.querySelector(
              '[aria-label="Camera preview"]',
            ) as HTMLVideoElement
            const tracks = (video?.srcObject as MediaStream | null)?.getTracks() ?? []
            return (
              tracks.some((track) => track.kind === 'video') &&
              tracks.some((track) => track.kind === 'audio')
            )
          },
          undefined,
          { timeout: 60_000 },
        )
        expect(await page.locator('select').getByText('MediaMTX · Ready').count()).toBe(1)
        return page
      }
      let publisher = await host()
      await publisher.getByLabel('Record a replay').check()
      await publisher.getByRole('button', { name: 'Start broadcast' }).click()
      const player = await viewerContext.newPage()
      const problems: string[] = []
      player.on('response', (response) => {
        const path = new URL(response.url()).pathname
        if (path.startsWith('/live-media/')) problems.push(`${path}: ${response.status()}`)
      })
      player.on('requestfailed', (request) => {
        if (new URL(request.url()).pathname.startsWith('/live-media/'))
          problems.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`)
      })
      const theater = await player.goto(`${origin}/rooms/${roomId}`, { timeout: 90_000 })
      const viewerAddress = await theater?.serverAddr()
      if (remote && process.env.CRE08_VIEWER_GATEWAY_IP)
        expect(viewerAddress?.ipAddress).toBe(viewerGateway)
      try {
        await player
          .getByText('Live · Playback may be several seconds behind the host.')
          .waitFor({ timeout: 65_000 })
        await untilPlaying(player)
      } catch (error) {
        const diagnostics = await player
          .evaluate(
            async (id) => {
              const options = { signal: AbortSignal.timeout(5000) }
              const url = `/live-media/${id}/hls/index.m3u8`
              const response = await fetch(url, options)
              const body = await response.text()
              return {
                status: response.status,
                type: response.headers.get('content-type'),
                body: body.slice(0, 280),
                codecs: MediaSource.isTypeSupported('video/mp4; codecs="avc1.42C01F,opus"'),
              }
            },
            (
              await roomQuery(payload)<{ id: string }>(
                'SELECT id FROM live_media_sessions WHERE room_id=$1',
                [roomId],
              )
            ).rows[0]?.id,
          )
          .catch((failure) => ({ error: failure.message }))
        throw new Error(
          `${error}\nMedia responses: ${problems.slice(-10).join(', ')}\nDiagnostic: ${JSON.stringify(diagnostics)}\nHost: ${(await publisher.locator('body').innerText()).slice(0, 1400)}\nViewer: ${(await player.locator('body').innerText()).slice(0, 900)}`,
        )
      }
      const readSessions = () =>
        roomQuery(payload)<{ id: string; state: string; recording: boolean }>(
          'SELECT id,state,recording FROM live_media_sessions WHERE room_id=$1',
          [roomId],
        )
      const [{ id }] = (await readSessions()).rows
      const localAsset = `http://127.0.0.1:${port}/live-media/${id}/hls/index.m3u8`
      const naked = await fetch(localAsset, { headers: { Host: `b.localhost:${port}` } })
      expect(naked.status).toBe(403)
      const viewerCookies = await viewerContext.cookies(`${origin}/live-media/${id}/hls/index.m3u8`)
      const signedCookies = viewerCookies
        .filter(({ name }) => name === 'renegade-live-playback' || name === 'renegade-member')
        .map(({ name, value }) => `${name}=${value}`)
        .join('; ')
      expect(signedCookies).toContain('renegade-live-playback=')
      const crossSite = await fetch(localAsset, {
        headers: { Host: `a.localhost:${port}`, Cookie: signedCookies },
      })
      expect(crossSite.status).toBe(403)
      const started = Date.now()
      let prior = await counts(player)
      report('watching', {
        session: id,
        minutes,
        viewer: remote ? 'browser on separate Docker network' : 'separate local browser',
        gateway: viewerAddress,
      })
      while (Date.now() < started + minutes * 60000) {
        await delay(Math.min(60000, started + minutes * 60000 - Date.now()))
        const current = await counts(player)
        expect(current.frames).toBeGreaterThan(prior.frames)
        expect(current.audioBytes).toBeGreaterThan(prior.audioBytes)
        prior = current
        const status = await (await fetch(`${control}/v3/paths/get/${id}`)).json()
        const stats = process.env.CRE08_MTX_CONTAINER
          ? JSON.parse(
              (
                await promisify(execFile)('docker', [
                  'stats',
                  '--no-stream',
                  '--format',
                  '{{json .}}',
                  process.env.CRE08_MTX_CONTAINER,
                ])
              ).stdout,
            )
          : undefined
        report('sample', {
          elapsedSeconds: (Date.now() - started) / 1000,
          playback: current,
          bytesReceived: status.bytesReceived,
          bytesSent: status.bytesSent,
          mediaNode: stats,
        })
      }
      const offline = Date.now()
      await publisher.close()
      report('encoder-offline', { session: id })
      await player
        .getByText('The host connection dropped. Waiting for the source to return.')
        .waitFor({ timeout: 45_000 })
      expect((await readSessions()).rows).toEqual([{ id, state: 'reconnecting', recording: true }])
      await delay(Math.max(0, outage * 1000 - (Date.now() - offline)))
      report('reconnect-attempt', { session: id, offlineSeconds: (Date.now() - offline) / 1000 })
      publisher = await host()
      await publisher.getByRole('button', { name: 'Reconnect camera' }).click()
      await player
        .getByText('Live · Playback may be several seconds behind the host.')
        .waitFor({ timeout: 55_000 })
      await untilPlaying(player)
      expect((await readSessions()).rows).toEqual([{ id, state: 'live', recording: true }])
      report('reconnected', { session: id, playback: await counts(player) })
      await publisher.getByRole('button', { name: 'End broadcast', exact: true }).click()
      await player.getByText('The broadcast has ended.').waitFor({ timeout: 30_000 })
      const replay = player.getByRole('link', { name: /Watch replay/ }).first()
      await replay.waitFor({ timeout: 30_000 })
      const oldReplay = await replay.getAttribute('href')
      expect(oldReplay).toContain(`/live-media/${id}/replay`)
      await replay.click()
      await untilPlaying(player, 'Replay')
      expect((await readSessions()).rows).toEqual([{ id, state: 'ended', recording: true }])
      report('replay', {
        session: id,
        parts: await player.getByRole('link', { name: /Watch replay/ }).count(),
      })
      await publisher.getByRole('button', { name: 'Revoke replay access' }).click()
      await expect
        .poll(() => player.evaluate(async (url) => (await fetch(url!)).status, oldReplay))
        .toBe(403)
      report('revoked', { session: id })
    } finally {
      await Promise.all([owner.close(), viewer.close()])
    }
  },
  (minutes * 60 + outage + 300) * 1000,
)
