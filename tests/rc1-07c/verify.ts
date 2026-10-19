/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { requestDoubleOptIn, confirmDoubleOptIn } from '../../src/modules/audience/service'
import { emailDeliveryTask } from '../../src/modules/audience/tasks'
import { executeDatabaseStep } from '../../src/modules/releases/saga'
import { scheduleRelease } from '../../src/modules/releases/service'
import { localMailSinkReceipts } from '../../src/modules/email/delivery'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'

assert.equal(process.env.RC1_07C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5451/rc107c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/07C'
const base = 'http://localhost:38985'
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
page.setDefaultTimeout(20000)
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

// Independent local AT Protocol harness. Records survive the web/DB restart.
const fail = !restart
let loseResponse = restart
const records: Record<string, any> = restart
  ? JSON.parse(await readFile(`${out}/provider-records.json`, 'utf8'))
  : {}
let creates = 0
let reconciles = 0
const harness = http.createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://127.0.0.1')
  let raw = ''
  for await (const part of req) raw += part
  const data = raw ? JSON.parse(raw) : {}
  res.setHeader('content-type', 'application/json')
  if (url.pathname.endsWith('createSession'))
    return res.end(JSON.stringify({ accessJwt: 'isolated-harness', did: 'did:plc:rc107c' }))
  if (url.pathname.endsWith('getRecord')) {
    const record = records[url.searchParams.get('rkey')!]
    if (record) {
      reconciles++
      return res.end(JSON.stringify(record))
    }
    res.statusCode = 404
    return res.end('{}')
  }
  if (url.pathname.endsWith('createRecord')) {
    if (fail && data.record.text.includes('fail once')) {
      res.statusCode = 400
      return res.end(
        JSON.stringify({ error: 'InjectedValidation', message: '07C isolated adapter failure' }),
      )
    }
    assert.equal(records[data.rkey], undefined, 'harness rejects duplicate create')
    creates++
    records[data.rkey] = {
      uri: `at://did:plc:rc107c/app.bsky.feed.post/${data.rkey}`,
      value: data.record,
    }
    await writeFile(`${out}/provider-records.json`, JSON.stringify(records, null, 2))
    if (loseResponse && data.record.text.includes('fail once')) {
      loseResponse = false
      req.socket.destroy()
      return
    }
    return res.end(JSON.stringify(records[data.rkey]))
  }
  res.statusCode = 404
  res.end('{}')
})
await new Promise<void>((resolve) => harness.listen(38986, '127.0.0.1', resolve))
const read = (collection: string, id: string) => payload.findByID({ collection, id, depth: 0 })
const all = async (collection: string, where: any) =>
  (await payload.find({ collection, where, depth: 0, pagination: false, limit: 0 })).docs
const native = async (collection: string, data: any, cookie: string) =>
  (await api(`/api/${collection}`, 'POST', data, cookie, 201)).json().doc
const action = async (id: string, name: string, cookie: string, extra = {}, status = 200) =>
  (
    await api(`/api/admin/releases/${id}`, 'POST', { action: name, ...extra }, cookie, status)
  ).json()
const setBrowserSession = async (cookie: string, site: string) => {
  await page.context().addCookies([
    { name: 'renegade-passkey', value: cookie.split(';')[0].split('=')[1], url: base },
    { name: 'renegade-active-site', value: site, url: base },
  ])
}
const showRelease = async (name: string) => {
  await page.goto(`${base}/admin/releases`, { timeout: 180000 })
  await dismissConsent()
  await page.getByText(name, { exact: true }).first().click()
}
try {
  await mkdir(out, { recursive: true })
  if (restart) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const own = `${await session(await read('users', state.owner))}; renegade-active-site=${state.site}`
    const before = await read('content-releases', state.release)
    check(
      'restart retains partial failure and five completed actions',
      before.status === 'partially-failed' &&
        before.artifacts.filter((i: any) => i.status === 'succeeded').length === 5,
    )
    check(
      'restart retains article publication and exact revision',
      (await read('article-family-content', state.article)).latestPublishedRevision ===
        state.revision,
    )
    await setBrowserSession(own, state.site)
    await showRelease(state.name)
    const retry = page.getByRole('button', { name: /Retry Failed Steps/ })
    let response = page.waitForResponse(
      (r) => r.url().endsWith(`/releases/${state.release}`) && r.request().method() === 'POST',
    )
    await retry.click()
    assert.equal((await response).status(), 200)
    const unknown = await read('content-releases', state.release)
    check(
      'lost provider response remains unresolved rather than fabricated success',
      unknown.status === 'partially-failed',
    )
    const failedQueue = (
      await all('social-queue-items', { variant: { equals: state.variants[1] } })
    )[0]
    check(
      'lost response has persisted retryable outbox and two attempts',
      failedQueue.status === 'scheduled' && failedQueue.attemptCount === 2,
    )
    // Explicit retry reconciles the provider record with the stable key, rather than creating a duplicate.
    response = page.waitForResponse(
      (r) => r.url().endsWith(`/releases/${state.release}`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Retry Failed Steps/ }).click()
    assert.equal((await response).status(), 200)
    const done = await read('content-releases', state.release)
    check(
      'failed-only retry completes all six persisted release actions',
      done.status === 'completed' && done.artifacts.every((i: any) => i.status === 'succeeded'),
    )
    check(
      'five successful actions are byte-identical after retries',
      JSON.stringify(before.artifacts.slice(0, 5)) === JSON.stringify(done.artifacts.slice(0, 5)),
    )
    check('distribution alone increments release action attempts', done.artifacts[5].attempts === 3)
    const queues = await all('social-queue-items', {
      idempotencyKey: { contains: `release:${state.release}:` },
    })
    const posts = await all('external-posts', { variant: { in: state.variants } })
    check(
      'two outbox rows, two external-post records, no duplicates',
      queues.length === 2 &&
        posts.length === 2 &&
        queues.every((q: any) => q.status === 'published'),
    )
    check(
      'successful destination never resent; failed destination reconciled on third attempt',
      queues.find((q: any) => q.variant === state.variants[0]).attemptCount === 1 &&
        queues.find((q: any) => q.variant === state.variants[1]).attemptCount === 3,
    )
    check(
      'adapter harness persists exactly two records and creates only the missing record on retry',
      Object.keys(records).length === 2 && creates === 1 && reconciles >= 1,
    )
    const revisions = await all('revision-records', { article: { equals: state.article } })
    check(
      'no duplicate published content or revisions',
      revisions.length === state.revisionCount &&
        (await all('content', { slug: { equals: state.slug } })).length === 1,
    )
    const deliveries = await all('email-deliveries', { message: { equals: state.email } })
    check('newsletter has exactly one durable recipient outbox row', deliveries.length === 1)
    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: deliveries[0].id },
      req: { payload },
    })
    await (emailDeliveryTask.handler as any)({
      input: { deliveryId: deliveries[0].id },
      req: { payload },
    })
    const sent = await read('email-deliveries', deliveries[0].id)
    check(
      'actual email worker accepts one message into local sink and replay is inert',
      sent.status === 'accepted' &&
        sent.attempts === 1 &&
        localMailSinkReceipts().filter((r) => r.subject === '07C reviewed release mail').length ===
          1,
    )
    await action(state.release, 'execute', own)
    await action(state.release, 'retry', own)
    check(
      'completed execution and retry replays are inert',
      JSON.stringify(done.artifacts) ===
        JSON.stringify((await read('content-releases', state.release)).artifacts),
    )
    await action(state.release, 'cancel', own, {}, 400)
    await action(
      state.release,
      'pin-artifact',
      own,
      { artifact: { targetType: 'media', targetId: state.media } },
      400,
    )
    check('completed release cannot be cancelled or edited', true)
    const pending = await read('content-releases', state.pending)
    await payload.jobs.runByID({ id: pending.executionJob, silent: true })
    check(
      'scheduled worker job created before restart executes from persisted state',
      (await read('content-releases', state.pending)).status === 'completed',
    )
    const cancelled = await read('content-releases', state.cancelled)
    await payload.jobs.runByID({ id: cancelled.executionJob, silent: true })
    check(
      'cancelled scheduled job never creates its redirect',
      (await all('public-redirects', { fromPath: { equals: '/07c-cancelled' } })).length === 0 &&
        (await read('content-releases', state.cancelled)).status === 'cancelled',
    )
    await page.reload()
    await page.getByText(state.name, { exact: true }).first().click()
    await page.screenshot({ path: `${out}/completed.png`, fullPage: true })
    await writeFile(
      `${out}/persistence-final.json`,
      JSON.stringify(
        {
          release: done,
          queues,
          posts,
          delivery: sent,
          providerRecordCount: Object.keys(records).length,
          revisionCount: revisions.length,
        },
        null,
        2,
      ),
    )
  } else {
    const site = await payload.create({
      collection: 'sites',
      data: { name: '07C Release site', slug: `release-07c-${Date.now()}`, lifecycle: 'active' },
    })
    const foreign = await payload.create({
      collection: 'sites',
      data: { name: '07C Foreign', slug: `foreign-07c-${Date.now()}`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${Date.now()}@rc107c.test`, role: 'owner' },
    })
    const outsider = await payload.create({
      collection: 'users',
      data: { email: `outsider-${Date.now()}@rc107c.test`, role: 'staff' },
    })
    const regular = await payload.create({
      collection: 'users',
      data: { email: `ungranted-${Date.now()}@rc107c.test`, role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof outsider.member === 'string' ? outsider.member : outsider.member.id,
        site: foreign.id,
        role: 'contributor',
      },
    })
    const own = `${await session(owner)}; renegade-active-site=${site.id}`
    const other = await session(outsider),
      ungranted = await session(regular)
    const publication = (await all('publications', { site: { equals: site.id } }))[0]
    await api(
      '/api/globals/site-settings',
      'POST',
      {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [site.id]: base, [foreign.id]: 'http://foreign.rc107c.test' },
        launchState: 'live',
        indexingMode: 'index',
      },
      own,
    )
    const slug = `story-07c-${Date.now()}`
    const content = await native(
      'content',
      {
        site: site.id,
        publication: publication.id,
        title: '07C coordinated article',
        slug,
        contentType: 'article',
        status: 'draft',
        body: body('Approved coordinated release copy.'),
      },
      own,
    )
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: content.id, action: 'submit' },
      own,
    )
    const reviewer = await payload.create({
      collection: 'users',
      data: { email: `reviewer-${Date.now()}@rc107c.test`, role: 'owner' },
    })
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: content.id, action: 'approve' },
      await session(reviewer),
    )
    const article = (await all('article-family-content', { content: { equals: content.id } }))[0]
    const layout = await native(
      'page-layouts',
      {
        site: site.id,
        path: '/07c-launch',
        name: '07C launch page',
        themeId: 'neutral-starter',
        surface: 'page',
        layoutVersion: 1,
        revision: 1,
        visibility: 'public',
        status: 'draft',
        blocks: [
          {
            id: 'title-07c',
            component: 'publisher.heading',
            componentVersion: 1,
            props: { text: '07C launch page', level: 'h1' },
          },
        ],
      },
      own,
    )
    const form = new FormData()
    form.set('siteId', site.id)
    form.set('title', '07C governed original')
    form.set('altText', 'Blue pixel')
    const sharp = (await import('sharp')).default
    const bytes = await sharp({
      create: { width: 24, height: 24, channels: 3, background: '#2455aa' },
    })
      .png()
      .toBuffer()
    form.set('file', new File([bytes], '07c-original.png', { type: 'image/png' }))
    const upload = await fetch(`${base}/api/media/upload`, {
      method: 'POST',
      headers: { cookie: own, origin: base },
      body: form,
    })
    assert.equal(upload.status, 201, await upload.clone().text())
    const media = (await upload.json()).asset
    const list = await native(
      'audience-lists',
      {
        site: site.id,
        name: '07C local consenting readers',
        slug: `local-07c-${Date.now()}`,
        status: 'active',
      },
      own,
    )
    const subscription = await requestDoubleOptIn(payload, {
      siteId: site.id,
      listId: list.id,
      email: 'local-recipient@rc107c.test',
      locale: 'en',
      consentWording: 'Send the isolated release newsletter',
      source: '07C acceptance',
    })
    await confirmDoubleOptIn(payload, subscription.token!)
    const email = await native(
      'email-messages',
      {
        site: site.id,
        subject: '07C reviewed release mail',
        kind: 'bulk',
        blocks: [{ type: 'text', text: 'Approved release copy' }],
        audience: { lists: [list.id] },
        status: 'draft',
      },
      own,
    )
    await api(`/api/email-messages/${email.id}`, 'PATCH', { status: 'review' }, own)
    // Force queue storage failure after real recipient-row creation; the whole email outbox transaction rolls back.
    const faultyEmail = new Proxy(payload, {
      get(target, key) {
        if (key === 'jobs')
          return {
            ...target.jobs,
            queue: async () => {
              throw new Error('07C injected queue persistence failure')
            },
          }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    await assert.rejects(
      executeDatabaseStep(
        faultyEmail,
        { id: 'rollback-probe' } as any,
        { targetType: 'newsletter', targetId: email.id } as any,
        owner.id,
      ),
      /injected queue persistence failure/,
    )
    check(
      'newsletter queue failure rolls back scheduling, recipient rows and jobs atomically',
      (await read('email-messages', email.id)).status === 'review' &&
        (await all('email-deliveries', { message: { equals: email.id } })).length === 0,
    )
    const account = await native(
      'social-accounts',
      {
        site: site.id,
        displayName: '07C isolated adapter',
        actorType: 'site',
        network: 'bluesky',
        externalAccountId: 'did:plc:rc107c',
        capabilityState: 'available',
        connectionReference: 'RC107C',
        capabilities: {},
      },
      own,
    )
    const draft = await native(
      'social-drafts',
      {
        site: site.id,
        title: '07C approved social',
        sourceContent: content.id,
        status: 'approved',
      },
      own,
    )
    const variants: any[] = []
    for (const text of ['07C good destination', '07C fail once destination'])
      variants.push(
        await native(
          'social-network-variants',
          {
            draft: draft.id,
            account: account.id,
            label: text,
            network: 'bluesky',
            text,
            status: 'approved',
            idempotencyKey: `07c-${Date.now()}-${variants.length}`,
          },
          own,
        ),
      )
    await setBrowserSession(own, site.id)
    await page.goto(`${base}/admin/releases`, { timeout: 180000 })
    await dismissConsent()
    await page
      .getByRole('button', { name: /New.*Release|Create.*Release/ })
      .first()
      .click()
    const name = `07C multi-action ${Date.now()}`
    await page.getByPlaceholder('e.g. Fall Brand Refresh & Store Launch').fill(name)
    await page
      .getByPlaceholder('Describe the cross-cutting goals of this coordinated release...')
      .fill('Publish approved artifacts and recover partial failure')
    const createdResponse = page.waitForResponse(
      (r) => r.url().endsWith('/api/admin/releases') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Create Release', exact: true }).click()
    const created = await createdResponse
    assert.equal(created.status(), 200, await created.text())
    const release = (await created.json()).release
    check(
      'admin UI creates a release persisted in the selected site',
      (await read('content-releases', release.id)).site === site.id,
    )
    await action(release.id, 'execute', own, {}, 400)
    check(
      'draft execution rejected',
      (await read('content-releases', release.id)).status === 'draft',
    )
    const targets = [
      {
        targetType: 'article',
        targetId: article.id,
        pinnedRevisionId: article.currentRevision,
        canonicalUrl: content.canonicalPath,
      },
      {
        targetType: 'page',
        targetId: layout.id,
        pinnedRevisionSequence: layout.revision,
        canonicalUrl: '/07c-launch',
      },
      { targetType: 'media', targetId: media.id, mediaRightsStatus: 'approved' },
      {
        targetType: 'redirect',
        targetId: '07c-launch',
        redirectRule: {
          fromPath: '/07c-old',
          toPath: '/07c-launch',
          statusCode: '308',
          match: 'exact',
          enabled: true,
        },
      },
      { targetType: 'newsletter', targetId: email.id },
      { targetType: 'distribution', targetId: draft.id },
    ]
    for (const target of targets)
      await action(release.id, 'pin-artifact', own, {
        artifact: {
          ...target,
          title: target.targetType,
          pinnedHash: createHash('sha256').update(JSON.stringify(target)).digest('hex'),
        },
      })
    const beforeDenied = await read('content-releases', release.id)
    for (const cookie of ['', other, ungranted]) {
      await action(release.id, 'execute', cookie, {}, 403)
      await api(`/api/admin/releases/${release.id}`, 'GET', undefined, cookie, 403)
    }
    check(
      'anonymous, foreign-site staff and ungranted staff denied with release unchanged',
      JSON.stringify(beforeDenied) === JSON.stringify(await read('content-releases', release.id)),
    )
    const foreignMedia = await native(
      'email-messages',
      {
        site: foreign.id,
        subject: 'Foreign',
        blocks: [{ type: 'text', text: 'private' }],
        kind: 'bulk',
      },
      own,
    )
    await action(
      release.id,
      'pin-artifact',
      own,
      {
        artifact: {
          targetType: 'newsletter',
          targetId: foreignMedia.id,
          title: 'Foreign',
          pinnedHash: 'x',
        },
      },
      400,
    )
    await api(
      `/api/content-releases/${release.id}`,
      'PATCH',
      { status: 'completed', artifacts: [] },
      own,
      403,
    )
    await action(release.id, 'submit-review', own)
    await action(release.id, 'approve', own)
    await showRelease(name)
    const executedResponse = page.waitForResponse(
      (r) => r.url().endsWith(`/releases/${release.id}`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Execute Now/ }).click()
    assert.equal((await executedResponse).status(), 200)
    const partial = await read('content-releases', release.id)
    check(
      'admin execution records partial failure, five successes and adapter failure',
      partial.status === 'partially-failed' &&
        partial.artifacts.slice(0, 5).every((i: any) => i.status === 'succeeded') &&
        partial.artifacts[5].status === 'failed',
    )
    check(
      'canonical article and page are published',
      (await read('content', content.id)).status === 'published' &&
        (await read('page-layouts', layout.id)).status === 'published',
    )
    const html = await api(content.canonicalPath || `/articles/${slug}`)
    check(
      'anonymous observed article output contains approved text',
      html.text.includes('Approved coordinated release copy.'),
    )
    check(
      'newsletter queues actual durable delivery, with no external delivery claim',
      (await all('email-deliveries', { message: { equals: email.id } })).length === 1,
    )
    check(
      'two social outboxes persist successful and failed destinations',
      (await all('social-queue-items', { idempotencyKey: { contains: `release:${release.id}:` } }))
        .length === 2,
    )
    await page.screenshot({ path: `${out}/partial-failure.png`, fullPage: true })
    // Schedule/cancel via the supported admin API; real worker resumes after restart.
    const scheduled = async (path: string, cancel = false) => {
      const r = (
        await api(
          '/api/admin/releases',
          'POST',
          { name: path, siteId: site.id, plannedInstant: new Date().toISOString() },
          own,
        )
      ).json().release
      await action(r.id, 'pin-artifact', own, {
        artifact: {
          targetType: 'redirect',
          targetId: path,
          title: path,
          pinnedHash: path,
          redirectRule: {
            fromPath: path,
            toPath: '/07c-launch',
            statusCode: '308',
            match: 'exact',
            enabled: true,
          },
        },
      })
      await action(r.id, 'submit-review', own)
      await action(r.id, 'approve', own)
      if (!cancel) {
        const jobCount = (await payload.count({ collection: 'payload-jobs' })).totalDocs
        const faultySchedule = new Proxy(payload, {
          get(target, key) {
            if (key === 'update')
              return async (input: any) => {
                if (input.collection === 'content-releases')
                  throw new Error('07C injected release storage failure')
                return target.update(input)
              }
            const value = Reflect.get(target, key)
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
        await assert.rejects(
          scheduleRelease(faultySchedule, {
            releaseId: r.id,
            scheduledFor: r.plannedInstant,
            timeZone: 'UTC',
            actorId: owner.id,
            idempotencyKey: 'rollback-schedule',
          }),
          /injected release storage failure/,
        )
        check(
          'schedule persistence failure rolls back the real queued job',
          (await read('content-releases', r.id)).status === 'approved' &&
            (await payload.count({ collection: 'payload-jobs' })).totalDocs === jobCount,
        )
      }
      await action(r.id, 'schedule', own, {
        scheduledFor: r.plannedInstant,
        timeZone: 'UTC',
        idempotencyKey: path,
      })
      if (cancel) await action(r.id, 'cancel', own)
      return r.id
    }
    const pending = await scheduled('/07c-restarted-worker')
    const cancelled = await scheduled('/07c-cancelled', true)
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          owner: owner.id,
          site: site.id,
          release: release.id,
          name,
          article: article.id,
          content: content.id,
          slug,
          revision: article.currentRevision,
          media: media.id,
          email: email.id,
          variants: variants.map((v) => v.id),
          pending,
          cancelled,
          revisionCount: (await all('revision-records', { article: { equals: article.id } }))
            .length,
        },
        null,
        2,
      ),
    )
    await writeFile(`${out}/persistence-partial.json`, JSON.stringify(partial, null, 2))
  }
  succeeded = true
} finally {
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ checks, succeeded, trace }, null, 2),
  )
  await browser.close()
  await new Promise<void>((resolve) => harness.close(() => resolve()))
  await payload.db.destroy()
}
console.log(`07C ${restart ? 'restart' : 'journey'}: ${checks} passed`)

process.exit(0)
