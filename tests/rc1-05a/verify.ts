/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator verification across polymorphic collections */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { localMediaStorage } from '../../src/modules/media/storage'

assert.equal(process.env.RC1_05A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5443/rc105a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(path.resolve(process.env.MEDIA_DIR!), path.resolve('scratch/rc105a-20261018/media'))

const payload = await getPayload({ config })
const base = 'http://localhost:38950'
const out = 'docs/rc/evidence/rc1/18-pass/05A'
const checks: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(`PASS ${checks.length}: ${name}`)
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const restart = process.argv.includes('--restart')

const api = async (
  route: string,
  cookie = '',
  method = 'GET',
  data?: any,
  extraHeaders: Record<string, string> = {},
) => {
  const headers: Record<string, string> = { origin: base, ...extraHeaders }
  if (cookie) headers.cookie = cookie
  if (data && !(data instanceof FormData) && !(data instanceof Uint8Array) && !Buffer.isBuffer(data)) {
    headers['content-type'] = 'application/json'
  }
  const body =
    data instanceof FormData
      ? data
      : data instanceof Uint8Array || Buffer.isBuffer(data)
        ? new Uint8Array(data)
        : data !== undefined
          ? JSON.stringify(data)
          : undefined
  return fetch(`${base}${route}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(180000),
  })
}

const json = async (
  route: string,
  cookie: string,
  method = 'GET',
  data?: any,
  expectedStatus = 200,
  extraHeaders: Record<string, string> = {},
) => {
  const response = await api(route, cookie, method, data, extraHeaders)
  const text = await response.text()
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${text.slice(0, 1500)}`,
  )
  return text ? JSON.parse(text) : {}
}

const createSessionCookie = async (user: any) => {
  const result = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return { cookie: `renegade-passkey=${result.token}`, token: result.token }
}

const record = async (collection: string, id: any) =>
  payload.findByID({
    collection: collection as never,
    id: typeof id === 'object' ? id.id : id,
    depth: 0,
    overrideAccess: true,
  }) as Promise<any>

function makePdfFixture(label: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n% ${label}\n%%EOF\n`,
    'utf8',
  )
}

function makeWavFixture(sampleCount = 64): Buffer {
  const dataSize = sampleCount * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(44100, 24)
  buf.writeUInt32LE(88200, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < sampleCount; i++) {
    buf.writeInt16LE((i % 16) * 200, 44 + i * 2)
  }
  return buf
}

function makeMp4Fixture(): Buffer {
  const buf = Buffer.alloc(64)
  buf.writeUInt32BE(32, 0)
  buf.write('ftyp', 4, 'ascii')
  buf.write('isom', 8, 'ascii')
  buf.writeUInt32BE(512, 12)
  buf.write('isomiso2mp41', 16, 'ascii')
  buf.writeUInt32BE(32, 32)
  buf.write('mdat', 36, 'ascii')
  return buf
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

try {
  await mkdir(out, { recursive: true })
  const storage = localMediaStorage(process.env.MEDIA_DIR!)

  if (restart) {
    const saved = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const owner = await record('users', saved.ownerId)
    const { cookie } = await createSessionCookie(owner)

    // 1. Verify disk blobs survive restart
    for (const item of saved.diskObjects) {
      const diskBytes = await storage.get(item.storageKey)
      check(
        `restart disk blob intact for ${item.label}`,
        Boolean(diskBytes) && hash(diskBytes!) === item.sha256,
      )
    }

    // 2. Verify stable hero asset ID still serves replaced image bytes on public route after restart
    const publicHeroRes = await api(`/media/${saved.heroOriginalId}`)
    const publicHeroBytes = new Uint8Array(await publicHeroRes.arrayBuffer())
    check(
      'restart public delivery of replaced hero asset retains replacement bytes under original ID',
      publicHeroRes.status === 200 && hash(publicHeroBytes) === saved.heroReplacementSha256,
    )

    // 3. Verify public article renders replaced hero caption and image URL after restart
    const articleRes = await api(saved.articlePath)
    const articleHtml = await articleRes.text()
    check(
      'restart public article renders replaced hero media URL and updated caption',
      articleRes.status === 200 &&
        articleHtml.includes(`/media/${saved.heroOriginalId}`) &&
        articleHtml.includes('Updated replacement caption 05A'),
    )

    // 4. Verify tombstoned asset remains withdrawn from public delivery (404) and default discovery
    const tombstonedDelivery = await api(`/media/${saved.tombstonedId}`)
    check(
      'restart tombstoned asset remains withdrawn from public delivery with 404',
      tombstonedDelivery.status === 404,
    )
    const activeList = await json(`/api/media?siteId=${saved.siteAlphaId}`, cookie)
    check(
      'restart default library discovery excludes tombstoned and deleted assets',
      !activeList.docs.some((d: any) => d.id === saved.tombstonedId || d.id === saved.deletedOrphanId),
    )
    const tombstoneList = await json(
      `/api/media?siteId=${saved.siteAlphaId}&retentionMode=tombstone`,
      cookie,
    )
    check(
      'restart tombstone filter returns tombstoned asset with tombstoneLabel intact',
      tombstoneList.docs.some(
        (d: any) =>
          d.id === saved.tombstonedId &&
          d.retentionMode === 'tombstone' &&
          d.tombstoneLabel === 'Withdrawn per editorial review 05A',
      ),
    )

    // 5. Verify detail refetch of replaced hero asset preserves version history and usages after restart
    const detail = await json(
      `/api/media/${saved.heroOriginalId}?siteId=${saved.siteAlphaId}`,
      cookie,
    )
    check(
      'restart detail refetch preserves versionCount=1, replaceGloballyWith, and usages',
      detail.asset.versionCount === 1 &&
        detail.asset.replaceGloballyWith === saved.heroReplacementId &&
        detail.asset.usageCount >= 1,
    )
  } else {
    const stamp = Date.now()

    // 1. Provision isolated Sites & Users
    const siteAlpha = await payload.create({
      collection: 'sites',
      data: { name: '05A Editorial Alpha', slug: `alpha-05a-${stamp}`, lifecycle: 'active' } as never,
    })
    const siteBeta = await payload.create({
      collection: 'sites',
      data: { name: '05A Foreign Beta', slug: `beta-05a-${stamp}`, lifecycle: 'active' } as never,
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-05a-${stamp}@renegade.test`, role: 'owner' } as never,
    })
    const betaStaff = await payload.create({
      collection: 'users',
      data: { email: `beta-staff-05a-${stamp}@renegade.test`, role: 'staff' } as never,
    })
    const betaMemberId =
      typeof betaStaff.member === 'string' ? betaStaff.member : (betaStaff.member as any).id
    await payload.create({
      collection: 'member-site-roles',
      data: { member: betaMemberId, site: siteBeta.id, role: 'contributor' } as never,
    })

    const { cookie: alphaCookie, token: alphaToken } = await createSessionCookie(owner)
    const { cookie: betaCookie } = await createSessionCookie(betaStaff)

    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: {
          [siteAlpha.id]: base,
          [siteBeta.id]: 'http://beta.05a.test:38950',
        },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })

    const publication = (
      await payload.find({
        collection: 'publications',
        where: { site: { equals: siteAlpha.id } },
        limit: 1,
      })
    ).docs[0]!

    // 2. Prepare fixtures (image, replacement image, PDF, WAV, MP4)
    const imageOriginalBytes = await sharp({
      create: { width: 960, height: 640, channels: 3, background: '#1e40af' },
    })
      .png()
      .toBuffer()
    const imageReplacementBytes = await sharp({
      create: { width: 960, height: 640, channels: 3, background: '#15803d' },
    })
      .png()
      .toBuffer()
    const pdfBytes = makePdfFixture('05A Editorial Dossier')
    const wavBytes = makeWavFixture(128)
    const mp4Bytes = makeMp4Fixture()

    const uploadAsset = async (
      actorCookie: string,
      siteId: string,
      bytes: Buffer,
      filename: string,
      fields: Record<string, string>,
      expectedStatus = 201,
    ) => {
      const form = new FormData()
      form.set('siteId', siteId)
      for (const [k, v] of Object.entries(fields)) form.set(k, v)
      form.set('file', new File([new Uint8Array(bytes)], filename))
      return json('/api/media/upload', actorCookie, 'POST', form, expectedStatus)
    }

    // 3. Upload Image, Document, Audio, and Video fixtures
    const heroOriginal = (
      await uploadAsset(alphaCookie, siteAlpha.id, imageOriginalBytes, 'hero-original-05a.png', {
        title: '05A Hero Image Original',
        altText: 'Blue editorial masthead',
        caption: 'Initial hero caption 05A',
      })
    ).asset
    check(
      'uploaded image fixture persists originalFilename, caption, and kind=image',
      heroOriginal.id &&
        heroOriginal.kind === 'image' &&
        heroOriginal.originalFilename === 'hero-original-05a.png' &&
        heroOriginal.caption === 'Initial hero caption 05A',
    )

    const docAsset = (
      await uploadAsset(alphaCookie, siteAlpha.id, pdfBytes, 'editorial-brief-05a.pdf', {
        title: '05A Editorial Brief PDF',
        caption: 'Primary source PDF attachment',
      })
    ).asset
    check(
      'uploaded PDF document fixture persists kind=document and application/pdf',
      docAsset.id &&
        docAsset.kind === 'document' &&
        docAsset.mimeType === 'application/pdf' &&
        docAsset.originalFilename === 'editorial-brief-05a.pdf',
    )

    const audioAsset = (
      await uploadAsset(alphaCookie, siteAlpha.id, wavBytes, 'interview-clip-05a.wav', {
        title: '05A Interview Audio Clip',
        caption: 'Field interview recording',
      })
    ).asset
    check(
      'uploaded WAV audio fixture persists kind=audio and audio/wav',
      audioAsset.id &&
        audioAsset.kind === 'audio' &&
        audioAsset.mimeType === 'audio/wav' &&
        audioAsset.originalFilename === 'interview-clip-05a.wav',
    )

    const videoAsset = (
      await uploadAsset(alphaCookie, siteAlpha.id, mp4Bytes, 'b-roll-clip-05a.mp4', {
        title: '05A B-Roll Video Clip',
        caption: 'Newsroom B-roll clip',
      })
    ).asset
    check(
      'uploaded MP4 video fixture persists kind=video and video/mp4',
      videoAsset.id &&
        videoAsset.kind === 'video' &&
        videoAsset.mimeType === 'video/mp4' &&
        videoAsset.originalFilename === 'b-roll-clip-05a.mp4',
    )

    // 4. Negative file type & size protections
    const badExe = await uploadAsset(
      alphaCookie,
      siteAlpha.id,
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'binary'),
      'payload.exe',
      { title: 'Malicious Executable' },
      415,
    )
    check('unsupported executable upload is rejected with 415', Boolean(badExe.error))

    const oversizedSession = await json(
      '/api/media/sessions',
      alphaCookie,
      'POST',
      {
        siteId: siteAlpha.id,
        filename: 'oversized-image.png',
        size: 105 * 1024 * 1024,
      },
      413,
    )
    check('oversized upload session (>100 MiB) is rejected with 413', Boolean(oversizedSession.error))

    const unsupportedSession = await json(
      '/api/media/sessions',
      alphaCookie,
      'POST',
      {
        siteId: siteAlpha.id,
        filename: 'script.exe',
        size: 2048,
      },
      415,
    )
    check('unsupported extension in upload session is rejected with 415', Boolean(unsupportedSession.error))

    // 5. Chunked upload session creation, interruption, failed-state recovery, and expired cleanup
    const multiChunkPng = Buffer.concat([
      imageOriginalBytes,
      Buffer.alloc(270 * 1024, 0),
    ])
    const multiChunkSha = `sha256:${hash(multiChunkPng)}`
    const sessionRes = await json(
      '/api/media/sessions',
      alphaCookie,
      'POST',
      {
        siteId: siteAlpha.id,
        filename: 'chunked-infographic-05a.png',
        title: '05A Chunked Infographic',
        altText: 'Resumed infographic',
        caption: 'Uploaded via resumable chunked session',
        size: multiChunkPng.byteLength,
        checksum: multiChunkSha,
      },
      201,
    )
    const sessionId = sessionRes.session.id
    const chunkSize = Number(sessionRes.session.chunkSize)
    check(
      'created multi-chunk upload session with chunkSize=262144',
      sessionId && chunkSize === 256 * 1024 && multiChunkPng.byteLength > chunkSize,
    )

    // Upload chunk 0 only
    const chunk0 = multiChunkPng.subarray(0, chunkSize)
    const putChunk0 = await json(
      `/api/media/sessions/${sessionId}`,
      alphaCookie,
      'PATCH',
      chunk0,
      200,
      {
        'x-upload-chunk-index': '0',
        'content-range': `bytes 0-${chunk0.byteLength - 1}/${multiChunkPng.byteLength}`,
      },
    )
    check('uploaded first chunk of resumable session', putChunk0.receivedBytes === chunk0.byteLength)

    // Premature finalize must fail with 409
    const prematureFinalize = await json(
      `/api/media/sessions/${sessionId}`,
      alphaCookie,
      'POST',
      {},
      409,
    )
    check('premature finalization of incomplete session is rejected with 409', Boolean(prematureFinalize.error))

    // Simulate interrupted/failed state and verify readUploadSession + recovery on remaining chunk
    await payload.update({
      collection: 'media-upload-sessions',
      id: sessionId,
      data: { state: 'failed', failureReason: 'Simulated connection drop' } as never,
      overrideAccess: true,
    })
    const resumedStatus = await json(`/api/media/sessions/${sessionId}`, alphaCookie, 'GET')
    check(
      'resumable session status reports failed state and receivedChunks=[0]',
      resumedStatus.session.state === 'failed' &&
        JSON.stringify(resumedStatus.session.receivedChunks) === '[0]',
    )

    const chunk1 = multiChunkPng.subarray(chunkSize)
    const putChunk1 = await json(
      `/api/media/sessions/${sessionId}`,
      alphaCookie,
      'PATCH',
      chunk1,
      200,
      {
        'x-upload-chunk-index': '1',
        'content-range': `bytes ${chunkSize}-${multiChunkPng.byteLength - 1}/${multiChunkPng.byteLength}`,
      },
    )
    check('resumed failed session with remaining chunk 1', putChunk1.complete === true)

    const finalizedRes = await json(
      `/api/media/sessions/${sessionId}`,
      alphaCookie,
      'POST',
      {},
      200,
    )
    const chunkedAsset = finalizedRes.asset
    check(
      'finalized recovered chunked session produces governed asset with matching checksum',
      chunkedAsset.id &&
        chunkedAsset.checksum === multiChunkSha &&
        chunkedAsset.originalFilename === 'chunked-infographic-05a.png',
    )

    // Create an abandoned session, write chunk 0, expire it, and exercise cleanup
    const abandonedSessionRes = await json(
      '/api/media/sessions',
      alphaCookie,
      'POST',
      {
        siteId: siteAlpha.id,
        filename: 'abandoned-upload-05a.png',
        size: imageOriginalBytes.byteLength,
      },
      201,
    )
    const abandonedId = abandonedSessionRes.session.id
    await json(
      `/api/media/sessions/${abandonedId}`,
      alphaCookie,
      'PATCH',
      imageOriginalBytes,
      200,
      {
        'x-upload-chunk-index': '0',
        'content-range': `bytes 0-${imageOriginalBytes.byteLength - 1}/${imageOriginalBytes.byteLength}`,
      },
    )
    const abandonedStagingDir = path.join(process.env.MEDIA_DIR!, '.upload-sessions', abandonedId)
    check('abandoned session staged chunk directory exists before cleanup', (await stat(abandonedStagingDir)).isDirectory())

    await payload.update({
      collection: 'media-upload-sessions',
      id: abandonedId,
      data: { expiresAt: new Date(Date.now() - 120_000).toISOString() } as never,
      overrideAccess: true,
    })
    const cleanupRes = await json(
      `/api/media/sessions?siteId=${siteAlpha.id}`,
      alphaCookie,
      'DELETE',
    )
    let dirRemoved = false
    try {
      await stat(abandonedStagingDir)
    } catch {
      dirRemoved = true
    }
    const expiredSessionDoc = await record('media-upload-sessions', abandonedId)
    check(
      'expired upload session cleanup removes staging directory and marks session expired',
      cleanupRes.cleaned >= 1 && dirRemoved && expiredSessionDoc.state === 'expired',
    )

    // 6. Browse, search, filter, and detail refetch
    const allAlpha = await json(`/api/media?siteId=${siteAlpha.id}`, alphaCookie)
    check('scoped media library lists all 5 ingested assets', allAlpha.docs.length === 5)

    for (const [kind, expectedFilename] of [
      ['image', 'hero-original-05a.png'],
      ['document', 'editorial-brief-05a.pdf'],
      ['audio', 'interview-clip-05a.wav'],
      ['video', 'b-roll-clip-05a.mp4'],
    ] as const) {
      const filtered = await json(`/api/media?siteId=${siteAlpha.id}&kind=${kind}`, alphaCookie)
      check(
        `library filter kind=${kind} returns matching asset`,
        filtered.docs.some((d: any) => d.originalFilename === expectedFilename && d.kind === kind),
      )
    }

    const searchByFilename = await json(
      `/api/media?siteId=${siteAlpha.id}&q=editorial-brief-05a.pdf`,
      alphaCookie,
    )
    check(
      'library search by filename finds exact document asset',
      searchByFilename.docs.length === 1 && searchByFilename.docs[0].id === docAsset.id,
    )

    const searchByCaption = await json(
      `/api/media?siteId=${siteAlpha.id}&q=Field%20interview%20recording`,
      alphaCookie,
    )
    check(
      'library search by caption finds exact audio asset',
      searchByCaption.docs.length === 1 && searchByCaption.docs[0].id === audioAsset.id,
    )

    // 7. Create published article using heroOriginal and attach PDF document inline
    const article = (
      await json(
        '/api/content',
        alphaCookie,
        'POST',
        {
          site: siteAlpha.id,
          publication: publication.id,
          title: '05A Governed Media Lifecycle Investigation',
          slug: `media-lifecycle-05a-${stamp}`,
          contentType: 'article',
          status: 'published',
          visibility: 'public',
          heroMedia: heroOriginal.id,
          excerpt: 'Proving upload, reuse, stable replacement, and tombstone governance.',
          body: {
            root: {
              type: 'root',
              version: 1,
              format: '',
              indent: 0,
              direction: 'ltr',
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  format: '',
                  indent: 0,
                  direction: 'ltr',
                  children: [
                    {
                      type: 'text',
                      version: 1,
                      text: 'Body copy with governed hero and attached source dossier.',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                    },
                  ],
                },
              ],
            },
          },
        },
        201,
      )
    ).doc
    check('created published article with heroMedia reference', article.id && article.canonicalPath)

    const attachedDoc = await json('/api/media/attach', alphaCookie, 'POST', {
      siteId: siteAlpha.id,
      mediaId: docAsset.id,
      contentId: article.id,
      purpose: 'inline',
      field: 'body.attachments',
    })
    check(
      'attached PDF document inline to article via POST /api/media/attach',
      attachedDoc.content.id === article.id,
    )

    const usedList = await json(`/api/media?siteId=${siteAlpha.id}&usage=used`, alphaCookie)
    check(
      'usage=used filter returns both hero image and inline-attached PDF document',
      usedList.docs.some((d: any) => d.id === heroOriginal.id) &&
        usedList.docs.some((d: any) => d.id === docAsset.id),
    )

    const unusedList = await json(`/api/media?siteId=${siteAlpha.id}&usage=unused`, alphaCookie)
    check(
      'usage=unused filter excludes attached assets and includes unattached audio/video',
      !unusedList.docs.some((d: any) => d.id === heroOriginal.id) &&
        unusedList.docs.some((d: any) => d.id === audioAsset.id),
    )

    // Verify public article renders original hero image and initial caption before replacement
    const initialArticleHtml = await (await api(article.canonicalPath)).text()
    const initialHeroDelivery = await api(`/media/${heroOriginal.id}`)
    const initialHeroBytes = new Uint8Array(await initialHeroDelivery.arrayBuffer())
    check(
      'public article and /media/:id serve original hero image before replacement',
      initialArticleHtml.includes(`/media/${heroOriginal.id}`) &&
        initialArticleHtml.includes('Initial hero caption 05A') &&
        hash(initialHeroBytes) === hash(imageOriginalBytes),
    )

    // 8. Replacement safety: refuse kind mismatch and invalid selected-usages, then perform all-usages replacement
    const unsafeKindForm = new FormData()
    unsafeKindForm.set('siteId', siteAlpha.id)
    unsafeKindForm.set('mode', 'all-usages')
    unsafeKindForm.set('title', 'Unsafe PDF replacement for image')
    unsafeKindForm.set('file', new File([new Uint8Array(pdfBytes)], 'wrong-kind.pdf'))
    const unsafeKindRes = await json(
      `/api/media/${heroOriginal.id}`,
      alphaCookie,
      'PUT',
      unsafeKindForm,
      409,
    )
    check(
      'replacing referenced image with PDF in all-usages mode is refused with 409',
      unsafeKindRes.error.includes('Unsafe replacement refused'),
    )

    const invalidUsageForm = new FormData()
    invalidUsageForm.set('siteId', siteAlpha.id)
    invalidUsageForm.set('mode', 'selected-usages')
    invalidUsageForm.set('usageIds', 'non-existent-usage-id')
    invalidUsageForm.set('file', new File([new Uint8Array(imageReplacementBytes)], 'rep.png'))
    const invalidUsageRes = await json(
      `/api/media/${heroOriginal.id}`,
      alphaCookie,
      'PUT',
      invalidUsageForm,
      409,
    )
    check(
      'selected-usages replacement with invalid usageId is refused with 409',
      Boolean(invalidUsageRes.error),
    )

    // Valid all-usages replacement
    const validReplaceForm = new FormData()
    validReplaceForm.set('siteId', siteAlpha.id)
    validReplaceForm.set('mode', 'all-usages')
    validReplaceForm.set('title', '05A Hero Image Replaced v2')
    validReplaceForm.set('altText', 'Green editorial masthead v2')
    validReplaceForm.set('caption', 'Updated replacement caption 05A')
    validReplaceForm.set(
      'file',
      new File([new Uint8Array(imageReplacementBytes)], 'hero-replacement-05a.png'),
    )
    const replaceRes = await json(
      `/api/media/${heroOriginal.id}`,
      alphaCookie,
      'PUT',
      validReplaceForm,
      201,
    )
    const heroReplacement = replaceRes.replacement
    const detailAfterReplace = await json(
      `/api/media/${heroOriginal.id}?siteId=${siteAlpha.id}`,
      alphaCookie,
    )
    check(
      'all-usages replacement creates replacement asset and records version history (versionCount=1)',
      heroReplacement.id &&
        detailAfterReplace.asset.versionCount === 1 &&
        heroReplacement.caption === 'Updated replacement caption 05A',
    )

    // Verify article reference stability and public delivery after replacement
    const articleAfterReplace = await record('content', article.id)
    const articleHeroId =
      typeof articleAfterReplace.heroMedia === 'string'
        ? articleAfterReplace.heroMedia
        : articleAfterReplace.heroMedia?.id
    check(
      'content.heroMedia reference remains stable on original asset ID after global replacement',
      articleHeroId === heroOriginal.id,
    )

    const replacedHeroDelivery = await api(`/media/${heroOriginal.id}`)
    const replacedHeroBytes = new Uint8Array(await replacedHeroDelivery.arrayBuffer())
    check(
      'public /media/:originalId serves replacement image bytes after global replacement',
      replacedHeroDelivery.status === 200 &&
        hash(replacedHeroBytes) === hash(imageReplacementBytes),
    )

    const replacedArticleHtml = await (await api(article.canonicalPath)).text()
    check(
      'public article page renders updated replacement caption and alt text while keeping /media/:originalId URL stable',
      replacedArticleHtml.includes(`/media/${heroOriginal.id}`) &&
        replacedArticleHtml.includes('Updated replacement caption 05A') &&
        replacedArticleHtml.includes('Green editorial masthead v2'),
    )

    // Refuse hard-deleting replacement asset while it serves as active replacement for referenced original
    const deleteActiveReplacement = await json(
      `/api/media/${heroReplacement.id}?siteId=${siteAlpha.id}`,
      alphaCookie,
      'DELETE',
      undefined,
      409,
    )
    check(
      'hard-deleting active replacement target of referenced asset is refused with 409',
      Boolean(deleteActiveReplacement.error),
    )

    // 9. Deletion & Tombstone lifecycle semantics
    const deleteReferencedDoc = await json(
      `/api/media/${docAsset.id}?siteId=${siteAlpha.id}`,
      alphaCookie,
      'DELETE',
      undefined,
      409,
    )
    check(
      'hard-deleting referenced PDF asset is refused with 409',
      deleteReferencedDoc.error.includes('Referenced media cannot be deleted'),
    )

    // Tombstone the referenced PDF asset
    const tombstoneRes = await json(
      `/api/media/${docAsset.id}?siteId=${siteAlpha.id}&mode=tombstone`,
      alphaCookie,
      'DELETE',
      { tombstoneLabel: 'Withdrawn per editorial review 05A' },
      200,
    )
    check(
      'tombstoning referenced asset sets retentionMode=tombstone and removeFromDiscovery=true',
      tombstoneRes.tombstoned === true &&
        tombstoneRes.asset.retentionMode === 'tombstone' &&
        tombstoneRes.asset.removeFromDiscovery === true &&
        tombstoneRes.asset.tombstoneLabel === 'Withdrawn per editorial review 05A',
    )

    const tombstonedGet = await api(`/media/${docAsset.id}`, alphaCookie)
    check(
      'tombstoned asset returns 404 on /media/:id even for authenticated operator',
      tombstonedGet.status === 404,
    )

    const reattachTombstoned = await json(
      '/api/media/attach',
      alphaCookie,
      'POST',
      {
        siteId: siteAlpha.id,
        mediaId: docAsset.id,
        contentId: article.id,
      },
      409,
    )
    check('attaching a tombstoned asset to content is refused with 409', Boolean(reattachTombstoned.error))

    // Hard-delete unreferenced orphan asset (chunkedAsset)
    const chunkedAssetDoc = await record('media-assets', chunkedAsset.id)
    const chunkedBlobDoc = await record('media-blobs', chunkedAssetDoc.originalBlob)
    await json(
      `/api/media/${chunkedAsset.id}?siteId=${siteAlpha.id}`,
      alphaCookie,
      'DELETE',
      undefined,
      204,
    )
    const deletedDiskBlob = await storage.get(chunkedBlobDoc.storageKey)
    check(
      'hard-deleting unreferenced orphan asset removes record and underlying storage blob',
      !deletedDiskBlob,
    )

    // 10. Unauthorized cross-site access denials (Site Beta editor vs Site Alpha assets)
    const crossSiteList = await api(`/api/media?siteId=${siteAlpha.id}`, betaCookie)
    check('foreign site editor denied listing Site Alpha media with 403', crossSiteList.status === 403)

    const crossSiteDetail = await api(
      `/api/media/${heroOriginal.id}?siteId=${siteAlpha.id}`,
      betaCookie,
    )
    const crossSiteForgedHint = await api(
      `/api/media/${heroOriginal.id}?siteId=${siteBeta.id}`,
      betaCookie,
    )
    check(
      'foreign site editor denied asset detail refetch (both direct and forged siteId hint) with 403',
      crossSiteDetail.status === 403 && crossSiteForgedHint.status === 403,
    )

    const crossSitePatch = await api(`/api/media/${heroOriginal.id}`, betaCookie, 'PATCH', {
      siteId: siteBeta.id,
      title: 'Cross-site hijack',
    })
    check('foreign site editor denied metadata update with 403', crossSitePatch.status === 403)

    const crossSiteAttach = await api('/api/media/attach', betaCookie, 'POST', {
      siteId: siteBeta.id,
      mediaId: heroOriginal.id,
      contentId: article.id,
    })
    check('foreign site editor denied media attachment with 403', crossSiteAttach.status === 403)

    const crossSiteDelete = await api(
      `/api/media/${audioAsset.id}?siteId=${siteBeta.id}`,
      betaCookie,
      'DELETE',
    )
    check('foreign site editor denied media deletion with 403', crossSiteDelete.status === 403)

    const crossSiteSessionRead = await api(`/api/media/sessions/${sessionId}`, betaCookie)
    check('foreign site editor denied reading foreign upload session with 403', crossSiteSessionRead.status === 403)

    // 11. Real Browser UI Verification (/admin/media and public article page)
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    await context.addCookies([
      {
        name: 'renegade-passkey',
        value: alphaToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ])
    const page = await context.newPage()
    page.setDefaultTimeout(90000)

    await page.goto(`${base}/admin/media-library?siteId=${siteAlpha.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 180000,
    })
    await page.getByTestId('media-search-input').waitFor({ state: 'visible', timeout: 120000 })
    check('Media Library UI renders search and filter controls in Chromium', true)

    // Verify assets appear in UI grid and select the original hero asset
    const heroCard = page.getByTestId(`media-card-${heroOriginal.id}`)
    await heroCard.waitFor({ state: 'visible', timeout: 90000 })
    await heroCard.click()

    // Verify detail sidebar displays filename, versions, and usages
    await page.getByTestId('selected-media-summary').waitFor({ state: 'visible', timeout: 60000 })
    const bodyText = await page.locator('body').innerText()
    check(
      'Media Library UI detail sidebar displays filename, versions, and usages for selected asset',
      bodyText.includes('hero-original-05a.png') &&
        bodyText.includes('Version history:') &&
        bodyText.includes('active reference(s)'),
    )

    // Filter by kind=audio in UI and verify audio card is visible
    await page.getByTestId('media-filter-kind').selectOption('audio')
    await page.getByTestId(`media-card-${audioAsset.id}`).waitFor({ state: 'visible', timeout: 60000 })
    check('Media Library UI kind=audio filter isolates audio fixture in browser', true)

    // Reset filter to all
    await page.getByTestId('media-filter-kind').selectOption('all')
    await heroCard.waitFor({ state: 'visible', timeout: 60000 })
    await heroCard.click()
    await page.screenshot({ path: `${out}/media-library-desktop.png`, fullPage: true })

    // Visit public article page in browser and verify replaced image & caption render
    await page.goto(`${base}${article.canonicalPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 180000,
    })
    await page.locator('article').first().waitFor({ state: 'visible', timeout: 60000 })
    const publicBodyText = await page.locator('body').innerText()
    check(
      'Public article page in Chromium renders article title and updated replacement caption',
      publicBodyText.includes('05A Governed Media Lifecycle Investigation') &&
        publicBodyText.includes('Updated replacement caption 05A'),
    )
    await page.screenshot({ path: `${out}/article-replaced-hero.png`, fullPage: true })

    await context.close()
    await browser.close()
    browser = undefined

    // 12. Save state for container restart verification
    const origDoc = await record('media-assets', heroOriginal.id)
    const origBlob = await record('media-blobs', origDoc.originalBlob)
    const repDoc = await record('media-assets', heroReplacement.id)
    const repBlob = await record('media-blobs', repDoc.originalBlob)
    const audioDoc = await record('media-assets', audioAsset.id)
    const audioBlob = await record('media-blobs', audioDoc.originalBlob)
    const videoDoc = await record('media-assets', videoAsset.id)
    const videoBlob = await record('media-blobs', videoDoc.originalBlob)

    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          ownerId: owner.id,
          siteAlphaId: siteAlpha.id,
          siteBetaId: siteBeta.id,
          heroOriginalId: heroOriginal.id,
          heroReplacementId: heroReplacement.id,
          heroReplacementSha256: hash(imageReplacementBytes),
          tombstonedId: docAsset.id,
          deletedOrphanId: chunkedAsset.id,
          articleId: article.id,
          articlePath: article.canonicalPath,
          diskObjects: [
            {
              label: 'hero-original',
              storageKey: origBlob.storageKey,
              sha256: hash(imageOriginalBytes),
            },
            {
              label: 'hero-replacement',
              storageKey: repBlob.storageKey,
              sha256: hash(imageReplacementBytes),
            },
            {
              label: 'audio-wav',
              storageKey: audioBlob.storageKey,
              sha256: hash(wavBytes),
            },
            {
              label: 'video-mp4',
              storageKey: videoBlob.storageKey,
              sha256: hash(mp4Bytes),
            },
          ],
        },
        null,
        2,
      ),
    )
    check('saved state.json for post-restart verification', true)
  }

  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-checks.json`,
    JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, checks }, null, 2),
  )
} catch (error) {
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-failure.json`,
    JSON.stringify({ passed: checks.length, failed: 1, checks, error: String(error) }, null, 2),
  )
  console.error('VERIFICATION ERROR:', error)
  throw error
} finally {
  await browser?.close()
  await payload.db.destroy?.()
}
process.exit(0)
