import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { getPayload } from 'payload'
import sharp from 'sharp'
import { chromium } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import {
  GET as index,
  POST as create,
} from '../../src/app/(frontend)/api/creator-studio/submissions/route'
import {
  DELETE as cancel,
  GET as get,
  PATCH as patch,
  POST as change,
} from '../../src/app/(frontend)/api/creator-studio/submissions/[id]/route'
import { loadConfig } from '../../src/modules/core/config'
import { cleanupExpiredUploadSessions } from '../../src/modules/media/upload-sessions'
import { creatorAssetDirectory, uploadDirectory } from '../../src/modules/media/upload-staging'
import { finalizeSubmission } from '../../src/modules/creator-studio/submissions'
import { createRoom, setRoomLifecycle } from '../../src/modules/community/rooms'
import {
  buildRc2World,
  loginAsMember,
  teardownRc2World,
  type Rc2Principal,
  type Rc2SiteWorld,
} from '../fixtures/rc2-world'

let payload: Awaited<ReturnType<typeof getPayload>>
let world: Awaited<ReturnType<typeof buildRc2World>>
const route = '/api/creator-studio/submissions'
const ids: string[] = []
const services = loadConfig()
const capability = ['media.upload', 'media.submit', 'media.edit-own', 'media.publish-own']
let png: Buffer
let document: Buffer
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(async () => {
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
  png = await sharp({ create: { width: 90, height: 30, channels: 3, background: '#699' } })
    .withExif({ IFD0: { Copyright: 'private source metadata' } })
    .png()
    .toBuffer()
  document = Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nCommunity subtitles\n')
}, 240_000)

afterAll(async () => {
  for (const id of ids) {
    await payload.delete({ collection: 'media-upload-sessions', id, overrideAccess: true })
    await rm(uploadDirectory(services, id), { recursive: true, force: true })
    await rm(creatorAssetDirectory(services, id), { recursive: true, force: true })
  }
  if (world) await teardownRc2World(payload, world)
  await payload?.db.destroy?.()
})

function request(
  site: Rc2SiteWorld,
  method = 'GET',
  suffix = '',
  headers?: Headers,
  body?: BodyInit,
) {
  const scoped = new Headers(headers)
  scoped.set('host', site.host)
  // Browsers always send Origin on writes, and the fixture registers
  // site.origin as the site's canonical origin — send it like a browser.
  if (!['GET', 'HEAD'].includes(method)) scoped.set('origin', site.origin)
  return new Request(site.origin + route + suffix, { method, body, headers: scoped })
}

async function principal(site: Rc2SiteWorld, actor: Rc2Principal, reviewer = false) {
  const role = (
    await payload.find({
      collection: 'member-site-roles',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { and: [{ site: { equals: site.siteId } }, { member: { equals: actor.memberId } }] },
    })
  ).docs[0]!
  await payload.update({
    collection: 'member-site-roles',
    id: role.id,
    overrideAccess: true,
    data: reviewer ? { role: 'moderator' } : { creatorCapabilities: capability },
  })
  const session = await loginAsMember(payload, actor)
  const headers = new Headers(session.headers)
  headers.set('cookie', `${headers.get('cookie')}; renegade-member-csrf=cre02-token`)
  headers.set('x-member-csrf', 'cre02-token')
  return headers
}

async function enable(site: Rc2SiteWorld, target: string | string[]) {
  await payload.update({
    collection: 'sites',
    id: site.siteId,
    overrideAccess: true,
    data: {
      creatorPolicy: {
        enabled: true,
        submissionTargets: typeof target === 'string' ? (target ? [target] : []) : target,
        quotas: { bytes: 20_000_000, uploadCount: 20 },
      },
    },
  })
}

async function start(
  site: Rc2SiteWorld,
  headers: Headers,
  target: string,
  filename: string,
  size: number,
  mimeType: string,
) {
  const response = await create(
    request(
      site,
      'POST',
      '',
      headers,
      JSON.stringify({
        key: randomUUID(),
        size,
        filename,
        title: filename,
        altText: 'A blue-green rectangle',
        target,
        mimeType,
      }),
    ),
  )
  if (!response.ok)
    return { status: response.status, error: (await response.json()).error, id: '', chunkSize: 0 }
  const data = await response.json()
  ids.push(data.id)
  return { ...data, status: response.status } as {
    id: string
    chunkSize: number
    status: number
    error?: string
  }
}

const act = (site: Rc2SiteWorld, headers: Headers, id: string, action: string, reason?: string) =>
  change(request(site, 'POST', '/' + id, headers, JSON.stringify({ action, reason })), ctx(id))

function chunk(
  site: Rc2SiteWorld,
  member: Headers,
  id: string,
  bytes: Buffer,
  index: number,
  start = 0,
  total = bytes.length,
  advertisedLength?: number,
) {
  const headers = new Headers(member)
  headers.set('content-range', `bytes ${start}-${start + bytes.length - 1}/${total}`)
  headers.set('x-upload-chunk-index', String(index))
  if (advertisedLength) headers.set('content-length', String(advertisedLength))
  return patch(request(site, 'PATCH', '/' + id, headers, new Uint8Array(bytes)), ctx(id))
}

describe('CRE-02 member submissions', () => {
  it('persists a batch, recovers interrupted chunks, gates publication and rejects invalid sources', async () => {
    const a = world.siteA
    const b = world.siteB
    const target = 'content:' + a.publishedArticleId
    const member = await principal(a, a.subscriber)
    const other = await principal(a, a.member)
    const reviewer = await principal(a, a.admin, true)
    const appealReviewer = await principal(a, a.editor, true)
    await enable(a, target)
    await enable(b, target)
    const crossMember = await principal(b, b.subscriber)
    expect((await start(b, crossMember, target, 'cross.png', png.length, 'image/png')).status).toBe(
      404,
    )
    expect(
      (
        await start(
          a,
          member,
          target,
          'large.png',
          services.storage.maxUploadBytes + 1,
          'image/png',
        )
      ).status,
    ).toBe(413)

    const photo = await start(a, member, target, 'photo.png', png.length, 'image/png')
    const text = Buffer.concat([document, Buffer.alloc(300_000, 32)])
    const transcript = await start(a, member, target, 'captions.vtt', text.length, 'text/vtt')
    expect(photo).toMatchObject({ status: 200 })
    expect(transcript).toMatchObject({ status: 200 })
    expect(
      (await get(request(a, 'GET', '/' + photo.id + '?status', other), ctx(photo.id))).status,
    ).toBe(404)
    expect(
      (await get(request(b, 'GET', '/' + photo.id + '?status', member), ctx(photo.id))).status,
    ).toBe(404)
    expect((await chunk(a, other, photo.id, png, 0)).status).toBe(404)
    expect((await chunk(a, member, photo.id, png, 0, 0, png.length, png.length + 1)).status).toBe(
      413,
    )
    expect((await chunk(a, member, photo.id, png, 0)).status).toBe(200)
    expect(
      (
        await chunk(
          a,
          member,
          transcript.id,
          text.subarray(0, transcript.chunkSize),
          0,
          0,
          text.length,
        )
      ).status,
    ).toBe(200)
    expect((await act(a, member, transcript.id, 'finalize')).status).toBe(409)
    expect(
      (
        await chunk(
          a,
          member,
          transcript.id,
          text.subarray(0, transcript.chunkSize),
          0,
          0,
          text.length,
        )
      ).status,
    ).toBe(200)
    const changedChunk = Buffer.from(text.subarray(0, transcript.chunkSize))
    changedChunk[100] ^= 1
    expect((await chunk(a, member, transcript.id, changedChunk, 0, 0, text.length)).status).toBe(
      409,
    )
    expect(
      (
        await chunk(
          a,
          member,
          transcript.id,
          text.subarray(transcript.chunkSize),
          1,
          transcript.chunkSize,
          text.length,
        )
      ).status,
    ).toBe(200)
    const stored = await payload.findByID({
      collection: 'media-upload-sessions',
      id: transcript.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(stored).toMatchObject({
      receivedBytes: text.length,
      receivedChunks: [0, 1],
      chunkManifest: { 0: expect.stringMatching(/^sha256:/), 1: expect.stringMatching(/^sha256:/) },
    })
    await payload.update({
      collection: 'media-upload-sessions',
      id: transcript.id,
      overrideAccess: true,
      data: { state: 'finalizing' },
    })
    expect(await (await act(a, member, transcript.id, 'finalize')).json()).toMatchObject({
      reviewStatus: 'pending',
      kind: 'document',
    })
    expect(await (await act(a, member, photo.id, 'finalize')).json()).toMatchObject({
      reviewStatus: 'pending',
      kind: 'image',
    })
    const raw = await sharp(
      await readFile(path.join(creatorAssetDirectory(services, photo.id), 'original')),
    ).metadata()
    expect(raw.exif).toBeDefined()
    expect((await get(request(a, 'GET', '/' + photo.id), ctx(photo.id))).status).toBe(404)
    expect(
      (await get(request(a, 'GET', '/' + photo.id + '?preview', other), ctx(photo.id))).status,
    ).toBe(404)
    const preview = await get(
      request(a, 'GET', '/' + photo.id + '?preview', reviewer),
      ctx(photo.id),
    )
    expect(preview.status).toBe(200)
    expect((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).exif).toBeUndefined()
    expect((await act(a, member, photo.id, 'publish')).status).toBe(409)
    expect((await act(a, member, photo.id, 'approve', 'Self approval')).status).toBe(403)
    expect((await act(a, reviewer, photo.id, 'reject', 'Please clarify this image.')).status).toBe(
      200,
    )
    expect((await act(a, member, photo.id, 'appeal', 'The caption provides context.')).status).toBe(
      200,
    )
    expect((await act(a, reviewer, photo.id, 'approve', 'Same reviewer')).status).toBe(403)
    expect((await act(a, appealReviewer, photo.id, 'approve', 'Context verified.')).status).toBe(
      200,
    )
    const queue = await (await index(request(a, 'GET', '', reviewer))).json()
    expect(queue.queue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: transcript.id, reviewStatus: 'pending' }),
      ]),
    )
    const notices = await payload.find({
      collection: 'notifications',
      overrideAccess: true,
      where: { recipientMember: { equals: a.subscriber.memberId } },
    })
    expect(
      notices.docs.filter(
        (entry) =>
          typeof entry.activityEvent === 'object' &&
          entry.activityEvent.type === 'creator.submission.reviewed',
      ),
    ).toHaveLength(2)
    await enable(a, '')
    expect((await act(a, member, photo.id, 'publish')).status).toBe(404)
    await enable(a, target)
    expect((await act(a, member, photo.id, 'publish')).status).toBe(200)
    expect(await (await index(request(a, 'GET', '?target=' + target))).json()).toMatchObject({
      items: [{ id: photo.id, url: route + '/' + photo.id }],
    })
    const partial = await get(
      request(a, 'GET', '/' + photo.id, new Headers({ range: 'bytes=0-3' })),
      ctx(photo.id),
    )
    expect(partial.status).toBe(206)
    expect(Buffer.from(await partial.arrayBuffer()).toString()).toBe('RIFF')
    expect((await get(request(b, 'GET', '/' + photo.id), ctx(photo.id))).status).toBe(404)

    const bomb = Buffer.from(png)
    bomb.writeUInt32BE(100_000, 16)
    bomb.writeUInt32BE(100_000, 20)
    for (const [name, bytes, mime] of [
      ['active.png', Buffer.from('<html><p>active markup</p></html>'), 'image/png'],
      ['drawing.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'],
      ['spoof.pdf', png, 'application/pdf'],
      ['bomb.png', bomb, 'image/png'],
    ] as const) {
      const session = await start(a, member, target, name, bytes.length, mime)
      expect((await chunk(a, member, session.id, bytes, 0)).status).toBe(200)
      expect((await act(a, member, session.id, 'finalize')).status).toBe(415)
      expect(
        (await get(request(a, 'GET', '/' + session.id + '?preview', member), ctx(session.id)))
          .status,
      ).toBe(404)
      expect(
        (await cancel(request(a, 'DELETE', '/' + session.id, member), ctx(session.id))).status,
      ).toBe(204)
    }
    const quarantined = await start(a, member, target, 'quarantine.png', png.length, 'image/png')
    await chunk(a, member, quarantined.id, png, 0)
    await expect(
      finalizeSubmission(
        payload,
        services,
        { siteId: a.siteId, memberId: a.subscriber.memberId },
        quarantined.id,
        async () => 'infected',
      ),
    ).rejects.toMatchObject({ status: 422 })
    expect(
      await (
        await get(request(a, 'GET', '/' + quarantined.id + '?status', member), ctx(quarantined.id))
      ).json(),
    ).toMatchObject({ state: 'failed', reviewStatus: 'quarantined' })
    await payload.update({
      collection: 'media-upload-sessions',
      id: quarantined.id,
      overrideAccess: true,
      data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
    })
    await cleanupExpiredUploadSessions(payload, services, a.siteId)
    await expect(access(creatorAssetDirectory(services, quarantined.id))).resolves.toBeUndefined()
    await cleanupExpiredUploadSessions(payload, services)
    await expect(access(uploadDirectory(services, quarantined.id))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(access(creatorAssetDirectory(services, quarantined.id))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    const interrupted = await start(a, member, target, 'interrupted.png', png.length, 'image/png')
    await chunk(a, member, interrupted.id, png, 0)
    await expect(
      finalizeSubmission(
        payload,
        services,
        { siteId: a.siteId, memberId: a.subscriber.memberId },
        interrupted.id,
        async () => {
          throw new Error('Interrupted after assembling original')
        },
      ),
    ).rejects.toThrow()
    expect(
      await readFile(path.join(creatorAssetDirectory(services, interrupted.id), 'original')),
    ).toEqual(png)
    expect(
      await (
        await get(request(a, 'GET', '/' + interrupted.id + '?status', member), ctx(interrupted.id))
      ).json(),
    ).toMatchObject({ state: 'failed', reason: 'Upload finalization failed. Retry the upload.' })
    expect((await act(a, member, interrupted.id, 'finalize')).status).toBe(200)

    const crashed = await start(a, member, target, 'crashed.png', png.length, 'image/png')
    await chunk(a, member, crashed.id, png, 0)
    const child = `
      import { getPayload } from 'payload'
      import config from './src/payload.config.ts'
      import { loadConfig } from './src/modules/core/config.ts'
      import { finalizeSubmission } from './src/modules/creator-studio/submissions.ts'
      const [siteId, memberId, id] = process.argv.slice(1)
      const payload = await getPayload({ config })
      await finalizeSubmission(payload, loadConfig(), { siteId, memberId }, id, async () => process.exit(74))
    `
    await expect(
      promisify(execFile)(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          child,
          a.siteId,
          a.subscriber.memberId,
          crashed.id,
        ],
        { timeout: 45_000, maxBuffer: 512 * 1024 },
      ),
    ).rejects.toMatchObject({ code: 74 })
    expect(
      await readFile(path.join(creatorAssetDirectory(services, crashed.id), 'original')),
    ).toEqual(png)
    expect(
      await (
        await get(request(a, 'GET', '/' + crashed.id + '?status', member), ctx(crashed.id))
      ).json(),
    ).toMatchObject({ state: 'finalizing' })
    expect((await act(a, member, crashed.id, 'finalize')).status).toBe(200)
  }, 180_000)

  it('binds the gallery, theater, and room to their canonical destination and audience', async () => {
    const site = world.siteA
    const writer = await principal(site, site.subscriber)
    const moderator = await principal(site, site.admin, true)
    const gallery = await payload.create({
      collection: 'albums',
      overrideAccess: true,
      data: {
        site: site.siteId,
        title: 'Submission gallery',
        kind: 'album',
        slug: `cre02-gallery-${world.suffix}`,
        visibility: 'public',
        moderationState: 'clear',
        exifPolicy: 'strip',
        originalDownloadPolicy: 'disallowed',
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        retentionHold: 'none',
      } as never,
    })
    const theater = await payload.create({
      collection: 'videos',
      overrideAccess: true,
      data: {
        site: site.siteId,
        title: 'Submission theater',
        slug: `cre02-theater-${world.suffix}`,
        status: 'published',
        visibility: 'public',
        availability: 'available',
        provider: 'youtube',
        externalId: `cre02-${world.suffix}`,
        embedUrl: 'https://www.youtube-nocookie.com/embed/unused',
        publishedAt: new Date().toISOString(),
        structuredDataMode: 'inherit-source',
      } as never,
    })
    const room = await createRoom(payload, {
      siteId: site.siteId,
      creatorMemberId: site.admin.memberId,
      title: 'Submission room',
    })
    try {
      const targets = [`gallery:${gallery.id}`, `theater:${theater.id}`, `room:${room.id}`]
      await enable(site, targets)
      const studio = await (await index(request(site, 'GET', '', writer))).json()
      expect(studio.targets.map((target: { key: string }) => target.key)).toEqual(targets)
      for (const target of targets) {
        const upload = await start(
          site,
          writer,
          target,
          `${target.split(':')[0]}.vtt`,
          document.length,
          'text/vtt',
        )
        expect(upload.status, upload.error).toBe(200)
        expect((await chunk(site, writer, upload.id, document, 0)).status).toBe(200)
        expect((await act(site, writer, upload.id, 'finalize')).status).toBe(200)
        expect(
          (await act(site, moderator, upload.id, 'approve', 'Approved for this destination.'))
            .status,
        ).toBe(200)
        expect((await act(site, writer, upload.id, 'publish')).status).toBe(200)
        const listing = await index(
          request(
            site,
            'GET',
            '?target=' + target,
            target.startsWith('room:') ? writer : undefined,
          ),
        )
        expect(await listing.json()).toMatchObject({
          target: { key: target },
          items: [{ id: upload.id }],
        })
        if (target.startsWith('room:')) {
          expect((await index(request(site, 'GET', '?target=' + target))).status).toBe(404)
          expect((await get(request(site, 'GET', '/' + upload.id), ctx(upload.id))).status).toBe(
            404,
          )
          expect(
            (await get(request(site, 'GET', '/' + upload.id, writer), ctx(upload.id))).status,
          ).toBe(200)
        }
      }
    } finally {
      await setRoomLifecycle(payload, {
        siteId: site.siteId,
        conversationId: room.id,
        actorMemberId: site.admin.memberId,
        lifecycle: 'closed',
      })
      await payload.delete({ collection: 'videos', id: theater.id, overrideAccess: true })
      await payload.delete({ collection: 'albums', id: gallery.id, overrideAccess: true })
    }
  }, 120_000)

  it.runIf(Boolean(process.env.CRE02_BROWSER_ORIGIN))(
    'uploads from the mobile picker and drop zone, retries a lost chunk, and reopens persisted status',
    async () => {
      const origin = process.env.CRE02_BROWSER_ORIGIN!
      const a = world.siteA
      const target = 'content:' + a.publishedArticleId
      const member = await principal(a, a.subscriber)
      await enable(a, target)
      await payload.updateGlobal({
        slug: 'site-settings',
        overrideAccess: true,
        data: {
          canonicalOrigin: origin,
          canonicalOriginsBySite: { [a.siteId]: origin, [world.siteB.siteId]: world.siteB.origin },
        },
      })
      for (const suffix of ['', '/00000000-0000-4000-8000-000000000001?status']) {
        await expect
          .poll(async () => (await fetch(origin + route + suffix)).status, {
            timeout: 60_000,
            interval: 1000,
          })
          .toBe(401)
      }
      const browser = await chromium.launch()
      try {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        })
        await context.addCookies(
          member
            .get('cookie')!
            .split('; ')
            .map((cookie) => {
              const [name, value] = cookie.split('=')
              return { name, value, url: origin }
            }),
        )
        const page = await context.newPage()
        const transferredParts: { index: string; url: string }[] = []
        let interrupted = false
        await page.route('**/api/creator-studio/submissions/*', async (route) => {
          const req = route.request()
          if (req.method() !== 'PATCH') return route.continue()
          const index = req.headers()['x-upload-chunk-index']
          transferredParts.push({ index, url: req.url() })
          if (index === '1' && !interrupted) {
            interrupted = true
            return route.abort()
          }
          return route.continue()
        })
        await page.goto(origin + '/studio/submissions', {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        })
        await page.locator('input[type=file]').setInputFiles(
          [
            { name: 'mobile.png', mimeType: 'image/png', buffer: png },
            {
              name: 'mobile.vtt',
              mimeType: 'text/vtt',
              buffer: Buffer.concat([document, Buffer.alloc(300_000, 32)]),
            },
          ],
          { timeout: 120_000 },
        )
        await page.getByLabel('Alt text for images').first().fill('Blue-green rectangle')
        await page.getByRole('button', { name: 'Upload batch' }).click()
        await page.getByText('mobile.vtt · open').waitFor({ timeout: 90_000 })
        const resumed = page.waitForResponse(
          (response) =>
            response.url().endsWith('/api/creator-studio/submissions') &&
            response.request().method() === 'POST' &&
            response.request().postDataJSON()?.filename === 'mobile.vtt',
        )
        await page.getByRole('button', { name: 'Upload batch' }).click()
        const resumedSession = await (await resumed).json()
        expect(resumedSession).toMatchObject({
          filename: 'mobile.vtt',
          receivedChunks: [0],
          manifest: { 0: expect.stringMatching(/^sha256:/) },
        })
        await page.getByText('mobile.png · pending').waitFor({ timeout: 90_000 })
        await page.getByText('mobile.vtt · pending').waitFor()
        expect(
          transferredParts
            .filter((part) => part.url.endsWith('/' + resumedSession.id))
            .map((part) => part.index),
          JSON.stringify(transferredParts),
        ).toEqual(['0', '1', '1'])
        const files = await page.evaluateHandle(() => {
          const transfer = new DataTransfer()
          transfer.items.add(
            new File(['WEBVTT\n\n00:00.000 --> 00:02.000\nDrop zone\n'], 'drop.vtt', {
              type: 'text/vtt',
            }),
          )
          return transfer
        })
        await page
          .getByText('Drop files here or choose files')
          .dispatchEvent('drop', { dataTransfer: files })
        await page.getByRole('button', { name: 'Upload batch' }).click()
        await page.getByText('drop.vtt · pending').waitFor()
        await page.reload()
        await page.getByText('mobile.png · pending').waitFor()
        const rows = await payload.find({
          collection: 'media-upload-sessions',
          overrideAccess: true,
          where: {
            and: [
              { site: { equals: a.siteId } },
              { filename: { in: ['mobile.png', 'mobile.vtt', 'drop.vtt'] } },
            ],
          },
        })
        ids.push(...rows.docs.map((row) => row.id))
        expect(rows.docs).toHaveLength(3)
        expect(rows.docs.every((row) => row.reviewStatus === 'pending')).toBe(true)
        const image = rows.docs.find((row) => row.filename === 'mobile.png')!
        const reviewer = await principal(a, a.admin, true)
        const browserSite = { ...a, origin, host: new URL(origin).host }
        expect(
          (await act(browserSite, reviewer, image.id, 'approve', 'Approved for the article.'))
            .status,
        ).toBe(200)
        await page.getByRole('button', { name: 'Refresh status' }).click()
        await page.getByText('mobile.png · approved').waitFor()
        await page.getByRole('button', { name: 'Publish', exact: true }).click()
        await page.getByText('mobile.png · published').waitFor()
        await page
          .getByRole('listitem')
          .filter({ hasText: 'mobile.png · published' })
          .getByRole('link', { name: 'View published submissions' })
          .click()
        const derivative = page.getByRole('img', { name: 'Blue-green rectangle', exact: true })
        await derivative.waitFor()
        await expect
          .poll(() => derivative.evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBeGreaterThan(0)
      } finally {
        await browser.close()
      }
    },
    240_000,
  )
})
