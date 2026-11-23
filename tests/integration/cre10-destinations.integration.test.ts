import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { getPayload } from 'payload'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import config from '../../src/payload.config'
import { createRoom, roomQuery } from '../../src/modules/community/rooms'
import { buildRc2World, loginAsMember } from '../fixtures/rc2-world'

const port = process.env.CRE10_GATEWAY_PORT
const origin = `http://b.localhost:${port}`
const exec = promisify(execFile)
const docker = (...args: string[]) => exec('docker', args, { maxBuffer: 32 * 1024 * 1024 })
const wait = { timeout: 45000, interval: 1000 }
const csrf = 'cre10-fixture-csrf'

function localFetch(
  address: string,
  init?: { method: string; headers: Record<string, string>; body: string },
) {
  const url = new URL(address)
  return new Promise<Response>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port: url.port,
        path: url.pathname + url.search,
        method: init?.method ?? 'GET',
        headers: { ...init?.headers, host: url.host },
        timeout: 90000,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('error', reject)
        response.on('end', () =>
          resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })),
        )
      },
    )
    request.on('timeout', () => request.destroy(new Error('HTTP request timed out')))
    request.on('error', reject)
    request.end(init?.body)
  })
}

it.skipIf(!port)(
  'isolates receiver failure, preserves Theater playback and recording, and revokes credentials',
  async () => {
    const payload = await getPayload({ config })
    const world = await buildRc2World(payload)
    const site = world.siteB
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: origin,
        canonicalOriginsBySite: {
          [site.siteId]: origin,
          [world.siteA.siteId]: origin.replace('b.localhost', 'a.localhost'),
        },
      },
      overrideAccess: true,
    })
    const room = await createRoom(payload, {
      siteId: site.siteId,
      creatorMemberId: site.admin.memberId,
      title: 'CRE-10 relay fixture',
      mode: 'theater',
      accessPolicy: 'public',
    })
    const host = await loginAsMember(payload, site.admin)
    const member = await loginAsMember(payload, site.member)
    const other = await loginAsMember(payload, world.siteA.admin)
    const base = `${origin}/api/rooms/${room.id}/broadcast`
    const endpoint = `${base}/destinations`
    const keys = [randomUUID(), randomUUID(), randomUUID()]
    const ingests = [
      'rtmp://cre10-receiver-a:1935/live',
      process.env.CRE10_RECEIVER_B_INGEST ?? 'rtmp://cre10-receiver-b:1935/live',
    ]
    function redacted(text: string) {
      // Assert on a boolean so a failure never prints the marked secret.
      expect([...keys, ...ingests].every((secret) => !text.includes(secret))).toBe(true)
    }
    async function request(url: string, body?: object, actor = host, status = 202, token = csrf) {
      const session = actor.headers.get('cookie')
      const response = await localFetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          cookie: `${session}; renegade-member-csrf=${csrf}`,
          origin,
          ...(token ? { 'x-member-csrf': token } : {}),
          ...(body
            ? {
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(JSON.stringify(body))),
              }
            : {}),
        },
        body: body ? JSON.stringify(body) : '',
      })
      const raw = await response.text()
      redacted(raw)
      expect(response.status, raw.slice(0, 300)).toBe(status)
      return JSON.parse(raw)
    }
    const action = (body: object) => request(endpoint, body)
    async function destination(id: string) {
      const value = await request(endpoint, undefined, host, 200)
      return value.destinations.find((item: { id: string }) => item.id === id)
    }
    async function receiverBytes(name: string): Promise<number> {
      const result = await docker(
        'exec',
        'cre10-relay',
        'node',
        '-e',
        "fetch('http://'+process.argv[1]+':9997/v3/paths/list').then(r=>{ if(!r.ok) throw new Error('Receiver status unavailable'); return r.json() }).then(x=>console.log(x.items?.find(y=>y.ready)?.bytesReceived ?? 0))",
        name,
      )
      return Number(result.stdout.trim())
    }
    const browser = await chromium.launch({
      args: [
        '--no-proxy-server',
        '--host-resolver-rules=MAP *.localhost 127.0.0.1',
        '--autoplay-policy=no-user-gesture-required',
      ],
    })
    try {
      const start = await request(
        base,
        { action: 'start', provider: 'mediamtx', recording: true },
        host,
        200,
      )
      const sessionId = start.session.id as string
      spawn(
        'docker',
        [
          'run',
          '--rm',
          '--name',
          'cre10-fixture-publisher',
          '--network',
          'cre10-proof',
          '--entrypoint',
          'ffmpeg',
          process.env.CRE10_FIXTURE_IMAGE ?? 'renegade-cms:local',
          '-nostdin',
          '-loglevel',
          'error',
          '-re',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=640x360:rate=24',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:sample_rate=48000',
          '-c:v',
          'libx264',
          '-threads',
          '2',
          '-preset',
          'ultrafast',
          '-tune',
          'zerolatency',
          '-g',
          '48',
          '-c:a',
          'aac',
          '-f',
          'rtsp',
          '-rtsp_transport',
          'tcp',
          `rtsp://cre10-source:8554/${sessionId}`,
        ],
        { stdio: 'ignore' },
      ).on('error', () => undefined)
      const settings = (index: number) => ({
        action: 'create',
        provider: 'custom',
        privacy: 'public',
        ingest: ingests[index],
        streamKey: keys[index],
        termsVersion: 1,
        authorized: true,
        retryBudget: 1,
        minutes: 2,
        mebibytes: 32,
      })
      await request(endpoint, { ...settings(0), authorized: false }, host, 422)
      await request(endpoint, settings(0), host, 403, '')
      await request(endpoint, settings(0), member, 403)
      // Resolve the other tenant by its own Host rather than transplanting a cookie.
      const cross = await localFetch(endpoint.replace('b.localhost', 'a.localhost'), {
        method: 'GET',
        body: '',
        headers: { cookie: other.headers.get('cookie')! },
      })
      expect(cross.status).toBe(404)
      redacted(await cross.text())
      const [{ id: a }, { id: b }] = await Promise.all([action(settings(0)), action(settings(1))])
      const stored = await roomQuery(payload)<{ credential: Buffer }>(
        'SELECT credential FROM live_destination_credentials WHERE destination_id=ANY($1::uuid[])',
        [[a, b]],
      )
      expect(stored.rows).toHaveLength(2)
      stored.rows.forEach(({ credential }) => redacted(credential.toString()))
      await action({ action: 'test', destinationId: a })
      await expect.poll(async () => (await destination(a)).probe, wait).toBe('reachable')
      await action({ action: 'test', destinationId: b })
      await expect.poll(async () => (await destination(b)).probe, wait).toBe('reachable')
      const startA = { action: 'start', destinationId: a, sessionId, idempotencyKey: randomUUID() }
      const runA = await action(startA)
      expect(await action(startA)).toEqual(runA)
      await action({ action: 'start', destinationId: b, sessionId, idempotencyKey: randomUUID() })
      await expect.poll(async () => (await destination(a)).status, wait).toBe('sending')
      await expect.poll(async () => (await destination(b)).status, wait).toBe('sending')
      const firstA = await receiverBytes('cre10-receiver-a')
      const firstB = await receiverBytes('cre10-receiver-b')
      expect(firstA).toBeGreaterThan(0)
      expect(firstB).toBeGreaterThan(0)
      const telemetry: string[] = []
      const owner = await browser.newContext()
      owner.on('request', (request) => telemetry.push(request.url(), request.postData() ?? ''))
      owner.on('console', (message) => telemetry.push(message.text()))
      await owner.addCookies([
        { name: 'renegade-member', value: host.headers.get('cookie')!.split('=')[1], url: origin },
        { name: 'renegade-member-csrf', value: csrf, url: origin },
      ])
      const ownerPage = await owner.newPage()
      await ownerPage.goto(`${origin}/rooms/${room.id}`, { timeout: 90000 })
      await ownerPage.getByText('Broadcast from this browser', { exact: true }).click()
      await ownerPage.getByText('External destinations', { exact: true }).click()
      const reachable = ownerPage
        .getByRole('status')
        .filter({ hasText: /Connected.*sending.*endpoint reachable/ })
      await expect.poll(() => reachable.count(), wait).toBe(2)
      redacted(await ownerPage.content())
      const viewer = await browser.newPage()
      viewer.on('request', (request) => telemetry.push(request.url(), request.postData() ?? ''))
      viewer.on('console', (message) => telemetry.push(message.text()))
      const roomResponse = await viewer.goto(`${origin}/rooms/${room.id}`, { timeout: 90000 })
      expect(roomResponse?.status()).toBe(200)
      const video = viewer.getByLabel('Live stream', { exact: true })
      await expect
        .poll(() => video.evaluate((node) => (node as HTMLVideoElement).readyState), wait)
        .toBeGreaterThanOrEqual(2)
      await video.evaluate((node) => {
        const player = node as HTMLVideoElement
        player.muted = true
        return player.play()
      })
      const playback = () => video.evaluate((node) => (node as HTMLVideoElement).currentTime)
      await expect.poll(playback, wait).toBeGreaterThan(1)
      const beforeFailure = await playback()
      await docker('kill', 'cre10-receiver-a')
      await expect.poll(async () => (await destination(a)).status, wait).toBe('failed')
      expect((await destination(a)).attempt).toBe(2)
      expect(
        (await destination(a)).audit.some(({ event }: { event: string }) => event === 'retrying'),
      ).toBe(true)
      expect((await destination(b)).status).toBe('sending')
      await expect.poll(() => receiverBytes('cre10-receiver-b'), wait).toBeGreaterThan(firstB)
      await expect.poll(playback, wait).toBeGreaterThan(beforeFailure + 1)
      await action({ action: 'stop', destinationId: b, runId: (await destination(b)).run_id })
      await expect.poll(async () => (await destination(b)).status, wait).toBe('stopped')
      await expect.poll(() => receiverBytes('cre10-receiver-b'), wait).toBe(0)
      await action({ action: 'start', destinationId: b, sessionId, idempotencyKey: randomUUID() })
      await expect.poll(() => receiverBytes('cre10-receiver-b'), wait).toBeGreaterThan(0)
      await action({ action: 'revoke', destinationId: b })
      await expect.poll(async () => (await destination(b)).status, wait).toBe('stopped')
      await expect.poll(() => receiverBytes('cre10-receiver-b'), wait).toBe(0)
      expect((await destination(b)).connected).toBe(false)
      await request(
        endpoint,
        { action: 'start', destinationId: b, sessionId, idempotencyKey: randomUUID() },
        host,
        409,
      )
      const afterRevoke = await playback()
      await expect.poll(playback, wait).toBeGreaterThan(afterRevoke + 1)
      const { id: capped } = await action({ ...settings(1), streamKey: keys[2], mebibytes: 1 })
      await action({
        action: 'start',
        destinationId: capped,
        sessionId,
        idempotencyKey: randomUUID(),
      })
      await expect
        .poll(async () => (await destination(capped)).status, wait)
        .toBe('budget_exhausted')
      const cappedBytes = Number((await destination(capped)).bytes_sent)
      expect(cappedBytes).toBeGreaterThan(0)
      expect(cappedBytes).toBeLessThanOrEqual(1024 * 1024)
      await action({ action: 'disconnect', destinationId: capped })
      expect((await destination(capped)).connected).toBe(false)
      await docker('stop', '-t', '1', 'cre10-fixture-publisher')
      await request(base, { action: 'end', sessionId }, host, 200)
      const replay = await request(`${origin}/api/rooms/${room.id}/token`, undefined, host, 200)
      expect(replay.replays[0].href).toContain('replay?')
      const durations = (await fetch(`http://127.0.0.1:4596/list?path=${sessionId}`).then((r) =>
        r.json(),
      )) as { duration: number }[]
      const recordingSeconds = durations.reduce((total, item) => total + item.duration, 0)
      expect(recordingSeconds).toBeGreaterThan(afterRevoke + 1)
      redacted(telemetry.join('\n'))
      if (process.env.CRE10_WEB_LOG) redacted(await readFile(process.env.CRE10_WEB_LOG, 'utf8'))
      const dump = await docker(
        'exec',
        'cre10-proof-db',
        'sh',
        '-ec',
        'pg_dump -U postgres -d cre10_release_acceptance -Fc --exclude-table-data=public.live_destination_credentials >/tmp/cre10-proof.dump; pg_restore -f - /tmp/cre10-proof.dump',
      )
      redacted(dump.stdout)
      expect(dump.stdout.includes('COPY public.live_destination_credentials')).toBe(false)
      for (const container of [
        'cre10-relay',
        'cre10-gateway',
        'cre10-source',
        'cre10-receiver-a',
        'cre10-receiver-b',
      ]) {
        const logs = await docker('logs', container)
        redacted(logs.stdout + logs.stderr)
      }
      console.info({ beforeFailure, afterRevoke, recordingSeconds, cappedBytes, firstA, firstB })
    } finally {
      await browser.close()
      await docker('stop', '-t', '1', 'cre10-fixture-publisher').catch(() => undefined)
      await payload.db.destroy?.()
    }
  },
  180000,
)
