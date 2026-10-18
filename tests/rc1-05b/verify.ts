/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator fixture across polymorphic collections */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage, localMediaStorage } from '../../src/modules/media/storage'
import { mediaVariantUrl, standardRecipes } from '../../src/modules/media/variant-contracts'
import { reconcileMediaUsages } from '../../src/modules/media/workflow'

assert.equal(process.env.RC1_05B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5444/rc105b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(path.resolve(process.env.MEDIA_DIR!), path.resolve('scratch/rc105b-20261018/media'))
const payload = await getPayload({ config })
const base = 'http://localhost:38960'
const out = 'docs/rc/evidence/rc1/18-pass/05B'
const checks: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(`PASS ${checks.length}: ${name}`)
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const restart = process.argv.includes('--restart')
const api = async (route: string, cookie = '', method = 'GET', data?: any) => {
  const headers: Record<string, string> = { origin: base }
  if (cookie) headers.cookie = cookie
  if (data && !(data instanceof FormData)) headers['content-type'] = 'application/json'
  return fetch(`${base}${route}`, {
    method,
    headers,
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(180000),
  })
}
const json = async (route: string, cookie: string, method: string, data: any, status = 200) => {
  const response = await api(route, cookie, method, data)
  const body = await response.text()
  assert.equal(response.status, status, `${route}: ${body.slice(0, 2000)}`)
  return JSON.parse(body)
}
const session = async (user: any) => {
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
  return `renegade-passkey=${result.token}`
}
const upload = async (cookie: string, site: string, bytes: Buffer, name = '05b.png') => {
  const form = new FormData()
  form.set('siteId', site)
  form.set('title', '05B retained original')
  form.set('altText', '05B purple sky')
  form.set('file', new File([new Uint8Array(bytes)], name))
  return (await json('/api/media/upload', cookie, 'POST', form, 201)).asset
}
const record = async (collection: string, id: any) =>
  payload.findByID({
    collection,
    id: typeof id === 'object' ? id.id : id,
    depth: 0,
    overrideAccess: true,
  } as never) as any
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await mkdir(out, { recursive: true })
  if (restart) {
    const saved = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    for (const item of saved.objects) {
      const disk = await localMediaStorage(process.env.MEDIA_DIR!).get(item.key)
      check(`restart disk hash ${item.label}`, disk && hash(disk) === item.hash)
      const response = await api(
        item.url,
        item.private ? await session(await record('users', saved.owner)) : '',
      )
      check(
        `restart delivered hash ${item.label}`,
        response.ok && hash(new Uint8Array(await response.arrayBuffer())) === item.hash,
      )
    }
    const asset = await record('media-assets', saved.asset)
    check(
      'governance and consent metadata survive restart',
      asset.creatorCredit === '05B Photographer' &&
        asset.consentReference === '05B-local-consent' &&
        asset.altText === '05B purple sky' &&
        asset.licenseType === 'owned',
    )
    const article = await api(saved.articlePath)
    check(
      'published article and responsive image survive restart',
      article.ok && (await article.text()).includes('variant=hero'),
    )
    for (const suffix of ['', '?download=true', '?variant=hero&format=avif&v=1']) {
      const denied = await api(`/media/${saved.privateAsset}${suffix}`)
      check(
        `restart anonymous private denial ${suffix}`,
        denied.status === 404 && (await denied.text()) === 'Not found',
      )
    }
    const jobs = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'media-variant-generate' } },
      limit: 100,
      depth: 0,
    } as never)
    check(
      'durable variant worker completions survive restart',
      jobs.docs.some((job: any) => job.completedAt && job.input?.mediaAssetId === saved.asset),
    )
  } else {
    const stamp = Date.now()
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '05B Alpha', slug: `alpha-05b-${stamp}`, lifecycle: 'active' } as never,
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '05B Beta', slug: `beta-05b-${stamp}`, lifecycle: 'active' } as never,
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@05b.test`, role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@05b.test`, role: 'staff' },
    })
    const memberId = typeof staff.member === 'string' ? staff.member : staff.member!.id
    await payload.create({
      collection: 'member-site-roles',
      data: { member: memberId, site: beta.id, role: 'contributor' },
    })
    const cookie = await session(owner),
      foreign = await session(staff)
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://beta.05b.test:38960' },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })
    const original = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#7136af' },
    })
      .png()
      .toBuffer()
    const asset = await upload(cookie, alpha.id, original)
    check(
      'ordinary upload API persists original and queues worker',
      asset.id && asset.checksum === `sha256:${hash(original)}`,
    )
    const patch = {
      siteId: alpha.id,
      creatorCredit: '05B Photographer',
      licenseType: 'owned',
      copyrightOwner: '05B Operator',
      rightsStatus: 'approved',
      governanceEnabled: true,
      consentReference: '05B-local-consent',
      modelReleaseReference: '05B-model-release',
    }
    await json(`/api/media/${asset.id}`, cookie, 'PATCH', patch)
    check(
      'metadata API persists rights, credit and consent',
      (await record('media-assets', asset.id)).consentReference === patch.consentReference,
    )
    const originalResponse = await api(`/media/${asset.id}`, cookie)
    check(
      'authenticated original exact bytes and private cache policy',
      originalResponse.ok &&
        originalResponse.headers.get('cache-control') === 'private, no-store' &&
        hash(new Uint8Array(await originalResponse.arrayBuffer())) === hash(original),
    )
    const unpublished = await api(`/media/${asset.id}`)
    check(
      'unpublished anonymous original has no leaked bytes',
      unpublished.status === 404 && (await unpublished.text()) === 'Not found',
    )
    await payload.jobs.run({ queue: 'media', limit: 20 })
    const variants = (
      await json(`/api/media/${asset.id}/variants?siteId=${alpha.id}`, cookie, 'GET', undefined)
    ).variants
    check(
      'real queued Sharp worker generated every approved format',
      variants.length === 20 && variants.every((v: any) => v.processingState === 'ready'),
    )
    const publication = (
      await payload.find({
        collection: 'publications',
        where: { site: { equals: alpha.id } },
        limit: 1,
      })
    ).docs[0]!
    const content = (
      await json(
        '/api/content',
        cookie,
        'POST',
        {
          site: alpha.id,
          publication: publication.id,
          title: '05B public photograph',
          slug: `photograph-${stamp}`,
          contentType: 'article',
          status: 'draft',
          visibility: 'public',
          heroMedia: asset.id,
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
                      text: 'Original and derivatives retained.',
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
    await json(`/api/content/${content.id}`, cookie, 'PATCH', { status: 'published' })
    const article = await record('content', content.id)
    const objects: any[] = []
    const storage = mediaStorage(loadConfig())
    const assetRow = await record('media-assets', asset.id),
      blob = await record(
        'media-blobs',
        typeof assetRow.originalBlob === 'string'
          ? assetRow.originalBlob
          : assetRow.originalBlob.id,
      )
    objects.push({
      label: 'original',
      key: blob.storageKey,
      hash: hash(original),
      url: `/media/${asset.id}`,
    })
    for (const v of variants) {
      const response = await api(v.url)
      const bytes = new Uint8Array(await response.arrayBuffer())
      const metadata = await sharp(bytes).metadata()
      check(
        `public ${v.recipeKey}/${v.format} dimensions and cache`,
        response.ok &&
          metadata.width === v.width &&
          metadata.height === v.height &&
          response.headers.get('content-type') === `image/${v.format}` &&
          response.headers.get('cache-control') === 'public, max-age=0, must-revalidate',
      )
      const row = await record('media-variants', v.id),
        b = await record('media-blobs', typeof row.blob === 'string' ? row.blob : row.blob.id)
      check(
        `disk and delivery hash ${v.recipeKey}/${v.format}`,
        hash((await storage.get(b.storageKey))!) === hash(bytes) &&
          b.checksum === `sha256:${hash(bytes)}`,
      )
      objects.push({
        label: `${v.recipeKey}-${v.format}`,
        key: b.storageKey,
        hash: hash(bytes),
        url: v.url,
      })
    }
    const publicOriginal = await api(`/media/${asset.id}`)
    const etag = publicOriginal.headers.get('etag')!
    check(
      'published original remains byte-identical',
      hash(new Uint8Array(await publicOriginal.arrayBuffer())) === hash(original),
    )
    const conditional = await fetch(`${base}/media/${asset.id}`, {
      headers: { 'if-none-match': etag },
    })
    check(
      'conditional 304 retains revalidation policy',
      conditional.status === 304 &&
        conditional.headers.get('cache-control') === 'public, max-age=0, must-revalidate',
    )
    const suffix = await fetch(`${base}/media/${asset.id}`, { headers: { range: 'bytes=-10' } })
    check(
      'suffix range returns exact last ten original bytes',
      suffix.status === 206 &&
        Buffer.from(await suffix.arrayBuffer()).equals(original.subarray(-10)),
    )
    const badFormat = await api(`/media/${asset.id}?variant=hero&format=png&v=1`)
    check(
      'unsupported format reports unavailable without silently serving different bytes',
      badFormat.status === 503,
    )
    const page = await api(article.canonicalPath)
    check(
      'public article renders responsive formats and alt text',
      page.ok && (await page.text()).includes('05B purple sky'),
    )
    browser = await chromium.launch({ headless: true })
    const tab = await browser.newPage()
    await tab.goto(`${base}${article.canonicalPath}`, { waitUntil: 'networkidle', timeout: 180000 })
    const image = tab.locator(`picture img[alt="05B purple sky"]`)
    await image.waitFor()
    check(
      'Chromium decodes actual public article derivative',
      await image.evaluate(async (img: any) => {
        const bitmap = await createImageBitmap(await (await fetch(img.currentSrc)).blob())
        return (
          img.complete &&
          img.naturalWidth > 0 &&
          bitmap.width === 1600 &&
          bitmap.height === 900 &&
          img.currentSrc.includes('variant=hero')
        )
      }),
    )
    await tab.screenshot({ path: `${out}/article.png`, fullPage: true })
    await browser.close()
    browser = undefined
    const privateAsset = await upload(
      cookie,
      alpha.id,
      await sharp(original).tint('#112233').png().toBuffer(),
    )
    await payload.jobs.run({ queue: 'media', limit: 20 })
    await json(`/api/media-assets/${privateAsset.id}`, cookie, 'PATCH', { publicPolicy: 'private' })
    const privateBlob = await record('media-blobs', privateAsset.originalBlob)
    objects.push({
      label: 'private-original',
      key: privateBlob.storageKey,
      hash: hash((await storage.get(privateBlob.storageKey))!),
      url: `/media/${privateAsset.id}`,
      private: true,
    })
    const privateVariants = (
      await json(`/api/media/${privateAsset.id}/variants`, cookie, 'GET', undefined)
    ).variants
    for (const v of privateVariants) {
      const r = await api(v.url, cookie)
      const bytes = new Uint8Array(await r.arrayBuffer())
      const variant = await record('media-variants', v.id),
        blob = await record('media-blobs', variant.blob)
      check(
        `authorized private rendition ${v.recipeKey}/${v.format} retains exact disk bytes`,
        r.ok &&
          r.headers.get('cache-control') === 'private, no-store' &&
          hash(bytes) === hash((await storage.get(blob.storageKey))!),
      )
      objects.push({
        label: `private-${v.recipeKey}-${v.format}`,
        key: blob.storageKey,
        hash: hash(bytes),
        url: v.url,
        private: true,
      })
    }
    const before = await record('media-assets', privateAsset.id)
    for (const suffix of [
      '',
      '?download=true',
      ...privateVariants.map((v: any) => new URL(v.url, base).search),
      '?v=thumbnail&fmt=jpeg',
    ]) {
      for (const [name, actor] of [
        ['anonymous', ''],
        ['foreign-site staff', foreign],
      ]) {
        const denied = await api(`/media/${privateAsset.id}${suffix}`, actor)
        check(
          `${name} cannot read private bytes ${suffix}`,
          denied.status === 404 &&
            (await denied.text()) === 'Not found' &&
            denied.headers.get('cache-control') === 'private, no-store',
        )
      }
    }
    const forged = await api(`/api/media/${privateAsset.id}/variants?siteId=${beta.id}`, foreign)
    check('foreign site hint cannot read private variant metadata', forged.status === 403)
    const mutation = await api(`/api/media/${privateAsset.id}/variants`, foreign, 'POST', {
      siteId: beta.id,
      focalPoint: { x: 0, y: 0 },
    })
    check(
      'foreign site hint cannot mutate crop or enqueue work',
      mutation.status === 403 &&
        JSON.stringify(await record('media-assets', privateAsset.id)) === JSON.stringify(before),
    )
    const unknown = await api(`/media/${privateAsset.id}?variant=hero`, '', 'HEAD')
    check(
      'anonymous private HEAD denies without content',
      unknown.status === 404 && (await unknown.arrayBuffer()).byteLength === 0,
    )
    // Stale usage projections must never override current article visibility.
    await reconcileMediaUsages(payload, alpha.id)
    await json(`/api/content/${content.id}`, cookie, 'PATCH', { visibility: 'private' })
    const hidden = await api(`/media/${asset.id}`)
    check('private article withdraws original despite stale approved usage', hidden.status === 404)
    await json(`/api/content/${content.id}`, cookie, 'PATCH', { visibility: 'public' })
    await json(`/api/media/${asset.id}`, cookie, 'PATCH', {
      siteId: alpha.id,
      rightsExpiresAt: '2000-01-01T00:00:00.000Z',
    })
    const expired = await api(mediaVariantUrl(asset.id, 'hero', 'avif'))
    check('expired rights withdraw previously public variant immediately', expired.status === 404)
    await json(`/api/media/${asset.id}`, cookie, 'PATCH', {
      siteId: alpha.id,
      rightsExpiresAt: null,
    })
    const retry = await json(
      `/api/media/${asset.id}/variants`,
      cookie,
      'POST',
      { siteId: alpha.id, recipeKeys: Object.keys(standardRecipes), force: true },
      202,
    )
    await payload.jobs.run({ queue: 'media', limit: 20 })
    check(
      'operator retry runs real queue successfully',
      Boolean((await record('payload-jobs', retry.job.id)).completedAt),
    )
    const book = (
      await json(
        '/api/books',
        cookie,
        'POST',
        {
          site: alpha.id,
          title: '05B illustrated book',
          slug: `book-${stamp}`,
          status: 'published',
          visibility: 'public',
          cover: asset.id,
        },
        201,
      )
    ).doc
    check('enabled Media Studio book persists a governed cover', book.cover)
    const bookPage = await api(book.canonicalPath)
    check(
      'published book is rendered by public route',
      bookPage.ok && (await bookPage.text()).includes('05B illustrated book'),
    )
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          owner: owner.id,
          asset: asset.id,
          privateAsset: privateAsset.id,
          articlePath: article.canonicalPath,
          objects,
        },
        null,
        2,
      ),
    )
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}.json`,
    JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, checks }, null, 2),
  )
} catch (error) {
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-failure.json`,
    JSON.stringify({ passed: checks.length, failed: 1, checks, error: String(error) }, null, 2),
  )
  throw error
} finally {
  await browser?.close()
  await payload.db.destroy?.()
}
process.exit(0)
