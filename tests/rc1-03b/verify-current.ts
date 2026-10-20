/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import { randomUUID } from 'node:crypto'
import {
  createEditorialPreviewToken,
  restoreEditorialRevision,
} from '../../src/modules/editorial/persistence'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'

assert.equal(process.env.RC1_03B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5462/rc103b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/03B/current'
const base = 'http://localhost:39032'
const trace: any[] = []
let checks = 0
let succeeded = false
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(180000)
const dismissConsent = async () => {
  const reject = page.getByRole('button', { name: 'Reject non-essential', exact: true })
  await reject.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await reject.isVisible()) await reject.click()
}
const restart = process.argv.includes('--restart')

const api = async (
  route: string,
  method = 'GET',
  data?: any,
  cookie = '',
  status: number | number[] = 200,
  headers: Record<string, string> = {},
) => {
  const raw = await new Promise<{ status: number; headers: Headers; text: string }>(
    (resolve, reject) => {
      const request = http.request(
        `${base}${route}`,
        {
          method,
          headers: {
            origin: base,
            ...(cookie ? { cookie } : {}),
            ...(data ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
        },
        (response) => {
          let text = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => {
            text += chunk
          })
          response.on('end', () =>
            resolve({
              status: response.statusCode!,
              headers: new Headers(
                Object.entries(response.headers).flatMap(([key, value]) =>
                  value === undefined ? [] : [[key, String(value)] as [string, string]],
                ),
              ),
              text,
            }),
          )
          response.on('error', reject)
        },
      )
      request.setTimeout(180000, () => request.destroy(new Error('request timed out')))
      request.on('error', reject)
      request.end(data ? JSON.stringify(data) : undefined)
    },
  )
  const response = { status: raw.status, headers: raw.headers }
  const text = raw.text
  trace.push({
    route,
    method,
    status: response.status,
    bytes: text.length,
    etag: response.headers.get('etag'),
    location: response.headers.get('location'),
    contentType: response.headers.get('content-type'),
    robots: response.headers.get('x-robots-tag'),
  })
  assert.ok(
    (Array.isArray(status) ? status : [status]).includes(response.status),
    `${method} ${route}: ${text.slice(0, 600)}`,
  )
  return { response, text, json: () => JSON.parse(text) }
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
const body = (text: string) => ({
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
          { type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' },
        ],
      },
    ],
  },
})

const read = (collection: string, id: string) => payload.findByID({ collection, id, depth: 0 })
const all = async (collection: string, where: any) =>
  (await payload.find({ collection, where, depth: 0, pagination: false, limit: 0 })).docs
const native = async (collection: string, data: any, cookie: string) =>
  (await api(`/api/${collection}`, 'POST', data, cookie, 201)).json().doc
const history = async (id: string, cookie: string) =>
  (await api(`/api/admin/workflow/revisions?contentId=${id}`, 'GET', undefined, cookie)).json()
const setSession = async (context: any, cookie: string, site: string) =>
  context.addCookies([
    {
      name: 'renegade-passkey',
      value: cookie.split(';')[0].slice('renegade-passkey='.length),
      url: base,
    },
    { name: 'renegade-active-site', value: site, url: base },
  ])
const editorFor = async (p: any, id: string) => {
  await p.goto(`${base}/admin/collections/content/${id}`, { timeout: 180000 })
  const consent = p.getByRole('button', { name: 'Reject non-essential', exact: true })
  await consent.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {})
  if (await consent.isVisible()) await consent.click()
  await p
    .locator('[data-lexical-editor="true"]')
    .first()
    .waitFor({ state: 'visible', timeout: 180000 })
  return p.locator('[data-lexical-editor="true"]').first()
}
const append = async (editor: any, value: string) => {
  await editor.locator('p').last().click()
  await editor.press('Control+End')
  await editor.press('Enter')
  await editor.press('Control+b')
  await editor.pressSequentially(value)
  await editor.press('Control+b')
}
try {
  await mkdir(out, { recursive: true })
  if (restart) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const own = await session(await read('users', state.owner))
    for (const saved of state.records) {
      const row = await read('content', saved.id)
      check(
        `restart: exact persisted body/authors/status ${saved.id}`,
        JSON.stringify(row.body) === JSON.stringify(saved.body) &&
          JSON.stringify(row.authors) === JSON.stringify(saved.authors) &&
          row.status === saved.status,
      )
      const publicResult = await api(row.canonicalPath, 'GET', undefined, '', 404)
      check(
        `restart: draft/private ${row.slug} still not public`,
        !publicResult.text.includes('UNPUBLISHED original'),
      )
    }
    const h = await history(state.records[0].id, own)
    check(
      'restart: append-only restored revision history retained',
      h.revisions.some((r: any) => r.reason === 'restored') &&
        h.revisions.length === state.revisionCount,
    )
    await setSession(page.context(), own, state.site)
    const preview = await api(state.preview, 'GET', undefined, own)
    check(
      'restart: original saved preview remains authorized and no-indexed',
      preview.text.includes('UNPUBLISHED original') &&
        preview.response.headers.get('robots') === null &&
        preview.response.headers.get('x-robots-tag')?.includes('noindex'),
    )
    await page.goto(`${base}${state.preview}`, { timeout: 180000 })
    await page
      .getByText('UNPUBLISHED original', { exact: false })
      .first()
      .waitFor({ state: 'visible' })
    check(
      'restart: preview renders actual original media bytes',
      await page
        .locator('img')
        .evaluateAll((imgs: any[]) => imgs.some((img) => img.complete && img.naturalWidth > 0)),
    )
    const editor = await editorFor(page, state.records[0].id)
    check(
      'restart: native Lexical editor reopens restored draft',
      (await editor.innerText()).includes('UNPUBLISHED original'),
    )
    await page.screenshot({ path: `${out}/editor-restart.png`, fullPage: true })
  } else {
    const stamp = Date.now()
    const site = await payload.create({
      collection: 'sites',
      data: { name: '03B Current Alpha', slug: `editor-alpha-${stamp}`, lifecycle: 'active' },
    })
    const foreign = await payload.create({
      collection: 'sites',
      data: { name: '03B Current Beta', slug: `editor-beta-${stamp}`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@rc103b.test`, role: 'owner' },
    })
    const author = await payload.create({
      collection: 'users',
      data: { email: `author-${stamp}@rc103b.test`, role: 'staff' },
    })
    const outsider = await payload.create({
      collection: 'users',
      data: { email: `outsider-${stamp}@rc103b.test`, role: 'staff' },
    })
    const regular = await payload.create({
      collection: 'users',
      data: { email: `ungranted-${stamp}@rc103b.test`, role: 'staff' },
    })
    const member = (u: any) => (typeof u.member === 'string' ? u.member : u.member.id)
    const grant = await payload.create({
      collection: 'member-site-roles',
      data: { member: member(author), site: site.id, role: 'contributor' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: { member: member(outsider), site: foreign.id, role: 'contributor' },
    })
    const own = await session(owner),
      staff = await session(author),
      other = await session(outsider),
      denied = await session(regular)
    await api(
      '/api/globals/site-settings',
      'POST',
      {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [site.id]: base, [foreign.id]: 'http://beta.rc103b.test:39032' },
        launchState: 'live',
        indexingMode: 'index',
      },
      own,
    )
    const pub = (await all('publications', { site: { equals: site.id } }))[0]
    const jane = await native('authors', { displayName: 'Jane Lead', slug: `jane-${stamp}` }, own)
    const mark = await native('authors', { displayName: 'Mark Editor', slug: `mark-${stamp}` }, own)
    const form = new FormData()
    form.set('siteId', site.id)
    form.set('title', '03B original media')
    form.set('altText', 'Blue editorial fixture')
    const sharp = (await import('sharp')).default
    const png = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#2255bb' },
    })
      .png()
      .toBuffer()
    form.set('file', new File([png], 'editor-original.png', { type: 'image/png' }))
    const upload = await fetch(`${base}/api/media/upload`, {
      method: 'POST',
      headers: { cookie: own, origin: base },
      body: form,
    })
    assert.equal(upload.status, 201, await upload.clone().text())
    const media = (await upload.json()).asset
    const text = (value: string, format = 0) => ({
      type: 'text',
      version: 1,
      text: value,
      format,
      detail: 0,
      mode: 'normal',
      style: '',
    })
    const paragraph = (children: any[]) => ({
      type: 'paragraph',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children,
    })
    const rich = () => ({
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [
          {
            type: 'heading',
            version: 1,
            tag: 'h2',
            format: '',
            indent: 0,
            direction: 'ltr',
            children: [text('UNPUBLISHED original')],
          },
          paragraph([
            text('Combined marked copy', 31),
            text(' plus '),
            {
              type: 'link',
              version: 3,
              format: '',
              indent: 0,
              direction: 'ltr',
              fields: { url: 'https://example.com/report', linkType: 'custom', newTab: false },
              children: [text('Source link', 3)],
            },
          ]),
          {
            type: 'quote',
            version: 1,
            format: '',
            indent: 0,
            direction: 'ltr',
            children: [text('Verified quoted original')],
          },
          {
            type: 'relationship',
            version: 2,
            relationTo: 'media-assets',
            value: media.id,
            format: '',
          },
          {
            type: 'block',
            version: 2,
            format: '',
            fields: {
              id: randomUUID(),
              blockType: 'editorialCallout',
              title: 'Context block',
              text: 'Preserved callout original',
            },
          },
          paragraph([text('End of original draft')]),
        ],
      },
    })
    const records: any[] = []
    for (const [index, type] of ['article', 'article', 'page'].entries()) {
      records.push(
        await native(
          'content',
          {
            site: site.id,
            publication: pub.id,
            owner: member(author),
            title: `03B ${type} ${index} ${stamp}`,
            slug: `draft-${index}-${stamp}`,
            contentType: type,
            status: 'draft',
            visibility: index === 1 ? 'private' : 'public',
            body: rich(),
            heroMedia: media.id,
            authors: [
              { author: mark.id, displayOrder: 2, role: 'Editor' },
              { author: jane.id, displayOrder: 1, role: 'Lead reporter' },
            ],
          },
          staff,
        ),
      )
    }
    for (const doc of records) {
      const row = await read('content', doc.id)
      check(
        `native API creates and reloads ${doc.contentType} with rich blocks/media/authors`,
        row.status === 'draft' &&
          JSON.stringify(row.body).includes('Preserved callout original') &&
          JSON.stringify(row.body).includes(media.id) &&
          row.authors.length === 2,
      )
    }
    const first = records[0]
    const initial = await history(first.id, own)
    const original = initial.currentRevision
    await setSession(page.context(), own, site.id)
    let editor = await editorFor(page, first.id)
    await page.screenshot({ path: `${out}/editor-loaded.png`, fullPage: true })
    await writeFile(`${out}/editor-loaded.txt`, await page.locator('body').innerText())
    await writeFile(
      `${out}/editor-fields.json`,
      JSON.stringify(
        {
          text: await editor.innerText(),
          controls: await page
            .locator('input,textarea')
            .evaluateAll((nodes: (HTMLInputElement | HTMLTextAreaElement)[]) =>
              nodes.map((n) => ({ name: n.name, value: n.value })),
            ),
        },
        null,
        2,
      ),
    )
    check(
      'ordinary native editor loads real Lexical body, inline media and callout controls',
      (await editor.innerText()).includes('UNPUBLISHED original') &&
        (await page
          .locator('input')
          .evaluateAll((nodes: HTMLInputElement[]) =>
            nodes.some((n) => n.value === 'Context block'),
          )) &&
        (await page
          .locator('textarea')
          .evaluateAll((nodes: HTMLTextAreaElement[]) =>
            nodes.some((node) => node.value === 'Preserved callout original'),
          )) &&
        (await page.getByText('03B original media', { exact: true }).first().isVisible()),
    )
    await append(editor, 'BROWSER AUTOSAVE EDIT')
    await page
      .getByText('Draft saved automatically.', { exact: true })
      .waitFor({ state: 'visible' })
    const edited = await read('content', first.id)
    check(
      'browser Lexical typing autosaves to real canonical content',
      JSON.stringify(edited.body).includes('BROWSER AUTOSAVE EDIT'),
    )
    check(
      'autosave creates canonical saved revision',
      (await history(first.id, own)).revisions.length > initial.revisions.length,
    )
    await page.reload({ timeout: 180000 })
    editor = page.locator('[data-lexical-editor="true"]').first()
    await editor.waitFor({ state: 'visible' })
    check(
      'reload retains browser-authored bold draft and original blocks',
      (await editor.innerText()).includes('BROWSER AUTOSAVE EDIT') &&
        (await editor.innerText()).includes('UNPUBLISHED original'),
    )
    const beforeFailure = await read('content', first.id)
    let inject = true
    await page.route(`**/api/content/${first.id}*`, async (route) => {
      if (inject && ['PATCH', 'POST'].includes(route.request().method())) {
        inject = false
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Isolated storage unavailable' }] }),
        })
      } else await route.continue()
    })
    await append(editor, 'BROWSER RETRY EDIT')
    await page
      .getByRole('button', { name: 'Retry draft save', exact: true })
      .waitFor({ state: 'visible' })
    check(
      'failed autosave keeps editor text while persisted state is unchanged',
      (await editor.innerText()).includes('BROWSER RETRY EDIT') &&
        JSON.stringify((await read('content', first.id)).body) ===
          JSON.stringify(beforeFailure.body),
    )
    await page.unroute(`**/api/content/${first.id}*`)
    await page.getByRole('button', { name: 'Retry draft save', exact: true }).click()
    await page
      .getByText('Draft saved automatically.', { exact: true })
      .waitFor({ state: 'visible' })
    check(
      'ordinary Retry draft save persists retained text',
      JSON.stringify((await read('content', first.id)).body).includes('BROWSER RETRY EDIT'),
    )
    await page.goto(`${base}/admin/posts`, { timeout: 180000 })
    // The native lock API is the same supported resource used by the editor heartbeat.
    const lock = await native(
      'payload-locked-documents',
      {
        document: { relationTo: 'content', value: first.id },
        user: { relationTo: 'users', value: owner.id },
      },
      own,
    )
    const beforeLock = await read('content', first.id),
      beforeLockHistory = await history(first.id, own)
    const second = await browser.newContext()
    await setSession(second, staff, site.id)
    const secondPage = await second.newPage()
    secondPage.setDefaultTimeout(180000)
    await secondPage.goto(`${base}/admin/collections/content/${first.id}`, { timeout: 180000 })
    await secondPage
      .getByText(/locked|currently.*edit|being.*edit/i)
      .first()
      .waitFor({ state: 'visible' })
    check('second real browser session receives visible document-lock feedback', true)
    await api(
      `/api/content/${first.id}?overrideLock=true`,
      'PATCH',
      { title: 'Forbidden concurrent replacement', overrideLock: true },
      staff,
      [409, 423],
    )
    await api(
      '/api/admin/workflow/revisions',
      'POST',
      { contentId: first.id, revisionId: original },
      staff,
      [409, 423],
    )
    check(
      'native save and restore both honor another editor lock with no partial revisions',
      JSON.stringify(beforeLock) === JSON.stringify(await read('content', first.id)) &&
        JSON.stringify(beforeLockHistory) === JSON.stringify(await history(first.id, own)),
    )
    await second.close()
    await api(`/api/payload-locked-documents/${lock.id}`, 'DELETE', undefined, own)
    // Simulate a genuine persistence failure after revision and companion writes; require complete rollback.
    const article = (await all('article-family-content', { content: { equals: first.id } }))[0]
    const beforeFault = {
      content: await read('content', first.id),
      article: await read('article-family-content', article.id),
      history: await history(first.id, own),
    }
    const faulty = new Proxy(payload, {
      get(target, key) {
        if (key === 'update')
          return async (input: any) => {
            if (input.collection === 'content') throw new Error('03B isolated persistence failure')
            return target.update(input)
          }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    await assert.rejects(
      restoreEditorialRevision(faulty, {
        articleId: article.id,
        revisionId: original,
        actor: { id: owner.id, role: 'publisher' },
        actorUserId: owner.id,
      }),
      /isolated persistence failure/,
    )
    check(
      'restore storage failure rolls back body, companion and appended revision',
      JSON.stringify(beforeFault) ===
        JSON.stringify({
          content: await read('content', first.id),
          article: await read('article-family-content', article.id),
          history: await history(first.id, own),
        }),
    )
    await page.goto(`${base}/admin/history?contentId=${first.id}`, { timeout: 180000 })
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Restore revision 1', exact: true }).click()
    await page.getByText(/was restored as a new saved revision/).waitFor({ state: 'visible' })
    const restored = await read('content', first.id),
      restoredHistory = await history(first.id, own)
    check(
      'ordinary history UI restores original body and appends a new revision',
      !JSON.stringify(restored.body).includes('BROWSER AUTOSAVE EDIT') &&
        !JSON.stringify(restored.body).includes('BROWSER RETRY EDIT') &&
        JSON.stringify(restored.body).includes('UNPUBLISHED original') &&
        restoredHistory.revisions[0].reason === 'restored' &&
        restoredHistory.revisions.length === beforeFault.history.revisions.length + 1,
    )
    await page.screenshot({ path: `${out}/revision-restore.png`, fullPage: true })
    for (const doc of records.slice(1)) {
      const before = await read('content', doc.id)
      const revisions = await history(doc.id, own)
      const changed = structuredClone(before.body)
      changed.root.children.push(body('OPERATOR EDIT BEFORE RESTORE').root.children[0])
      await api(`/api/content/${doc.id}`, 'PATCH', { body: changed }, own)
      check(
        `supported API edit persists ${doc.contentType} without losing media/blocks`,
        JSON.stringify((await read('content', doc.id)).body).includes(
          'OPERATOR EDIT BEFORE RESTORE',
        ) &&
          JSON.stringify((await read('content', doc.id)).body).includes(
            'Preserved callout original',
          ),
      )
      await api(
        '/api/admin/workflow/revisions',
        'POST',
        { contentId: doc.id, revisionId: revisions.currentRevision },
        own,
      )
      check(
        `supported API restore recovers exact original ${doc.contentType} and appends history`,
        JSON.stringify((await read('content', doc.id)).body) === JSON.stringify(before.body) &&
          (await history(doc.id, own)).revisions.length === revisions.revisions.length + 2,
      )
    }
    const previews: string[] = []
    for (const doc of records) {
      const result = (await api('/api/admin/content/preview', 'POST', { id: doc.id }, own)).json()
      previews.push(result.url)
      const preview = await api(result.url, 'GET', undefined, own)
      check(
        `saved unpublished ${doc.contentType} preview is authorized and no-index/no-store`,
        preview.text.includes('UNPUBLISHED original') &&
          preview.text.includes('Preserved callout original') &&
          preview.response.headers.get('x-robots-tag')?.includes('noindex') &&
          preview.response.headers.get('cache-control')?.includes('no-store'),
      )
      check(
        `draft/private ${doc.contentType} excluded from anonymous public URL`,
        !(await api(doc.canonicalPath, 'GET', undefined, '', 404)).text.includes(
          'UNPUBLISHED original',
        ),
      )
    }
    await page.goto(`${base}${previews[0]}`, { timeout: 180000 })
    check(
      'preview honors author display order',
      (await page.locator('body').innerText()).indexOf('Jane Lead') <
        (await page.locator('body').innerText()).indexOf('Mark Editor'),
    )
    check(
      'preview renders combined formatting, real link fields and original media bytes',
      (await page.locator('strong em s u code').count()) > 0 &&
        (await page.getByRole('link', { name: 'Source link' }).count()) > 0 &&
        (await page
          .locator('img')
          .evaluateAll((imgs: any[]) => imgs.some((img) => img.complete && img.naturalWidth > 0))),
    )
    await page.screenshot({ path: `${out}/unpublished-preview.png`, fullPage: true })
    for (const cookie of ['', other, denied]) await api(previews[0], 'GET', undefined, cookie, 404)
    await api(previews[0] + 'tampered', 'GET', undefined, own, 404)
    await api(previews[0], 'GET', undefined, own, 404, { host: 'beta.rc103b.test:39032' })
    const expired = await createEditorialPreviewToken(payload, {
      articleId: article.id,
      revisionId: original,
      createdBy: owner.id,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    await api(`/preview/article/${expired.token}`, 'GET', undefined, own, 404)
    check(
      'anonymous, foreign creator/site, ungranted, tampered and expired preview URLs denied',
      true,
    )
    const beforeDenied = {
      row: await read('content', first.id),
      history: await history(first.id, own),
    }
    for (const cookie of ['', other, denied]) {
      await api(
        `/api/content/${first.id}`,
        'PATCH',
        { title: 'Unauthorized edit' },
        cookie,
        [403, 404],
      )
      await api(
        '/api/admin/workflow/revisions',
        'POST',
        { contentId: first.id, revisionId: original },
        cookie,
        403,
      )
      await api('/api/admin/content/preview', 'POST', { id: first.id }, cookie, [403, 404])
    }
    await api(
      '/api/admin/workflow/revisions',
      'POST',
      { contentId: first.id, revisionId: (await history(records[1].id, own)).currentRevision },
      own,
      404,
    )
    check(
      'unauthorized edits/restores/previews and foreign revision substitution leave content/history unchanged',
      JSON.stringify(beforeDenied) ===
        JSON.stringify({
          row: await read('content', first.id),
          history: await history(first.id, own),
        }),
    )
    const staffPreview = (
      await api('/api/admin/content/preview', 'POST', { id: first.id }, staff)
    ).json().url
    await api(`/api/member-site-roles/${grant.id}`, 'DELETE', undefined, own)
    await api(staffPreview, 'GET', undefined, staff, 404)
    check('revoking the creator site grant immediately denies its existing preview', true)
    const sitemap = await api('/sitemap.xml')
    const feed = await api('/feed.json')
    check(
      'draft/private paths stay absent from public sitemap and feed',
      records.every(
        (doc) => !sitemap.text.includes(doc.canonicalPath) && !feed.text.includes(doc.title),
      ),
    )
    const saved = await Promise.all(records.map((doc) => read('content', doc.id)))
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          owner: owner.id,
          site: site.id,
          records: saved,
          revisionCount: restoredHistory.revisions.length,
          preview: previews[0],
        },
        null,
        2,
      ),
    )
    await writeFile(
      `${out}/persistence.json`,
      JSON.stringify(
        { records: saved, history: restoredHistory, media: await read('media-assets', media.id) },
        null,
        2,
      ),
    )
  }
  succeeded = true
} finally {
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ checks, succeeded, trace }, null, 2),
  )
  await browser.close()
  await payload.db.destroy()
}
console.log(`03B ${restart ? 'restart' : 'journey'}: ${checks} passed`)
process.exit(0)
