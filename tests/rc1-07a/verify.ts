/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'

assert.equal(process.env.RC1_07A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5449/rc107a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/07A'
const base = 'http://localhost:38983'
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

try {
  await mkdir(out, { recursive: true })
  if (restart) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const cookie = await session(await payload.findByID({ collection: 'users', id: state.owner }))
    const doc = await payload.findByID({ collection: 'content', id: state.content, depth: 0 })
    check('restart: approved canonical status retained', doc.status === 'approved')
    const audit = (
      await api(`/api/admin/workflow/audit?articleId=${doc.id}`, 'GET', undefined, cookie)
    ).json()
    check(
      'restart: all decisions and comments retained',
      JSON.stringify(audit).includes('Ready after edits') &&
        JSON.stringify(audit).includes('workflow.decided_rejected'),
    )
    const revisions = await payload.find({
      collection: 'revision-records',
      where: { article: { equals: state.article } },
      pagination: false,
      limit: 0,
    })
    check(
      'restart: revision bodies and sequence retained',
      revisions.docs.length === state.revisions &&
        JSON.stringify(revisions.docs).includes('Edited accountable copy'),
    )
    const locks = await payload.find({
      collection: 'payload-locked-documents',
      where: { id: { equals: state.lock } },
      depth: 0,
    })
    check('restart: document lock row retained', locks.docs.length === 1)
    const conflict = await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: doc.id, action: 'reopen' },
      cookie,
      422,
    )
    check(
      'restart: foreign editor still conflicts with retained lock',
      conflict.json().error.includes('locked by another editor'),
    )
    const staff = await payload.findByID({ collection: 'users', id: state.staff })
    const staffCookie = await session(staff)
    await api(`/api/payload-locked-documents/${state.lock}`, 'DELETE', undefined, staffCookie)
    check(
      'restart: original lock owner can release',
      !(
        await payload.find({
          collection: 'payload-locked-documents',
          where: { id: { equals: state.lock } },
        })
      ).docs.length,
    )
    const comments = (
      await api(
        `/api/admin/workflow/comments?articleId=${doc.id}&all=true`,
        'GET',
        undefined,
        cookie,
      )
    ).json().comments
    check(
      'restart: resolved review thread persisted',
      comments.some(
        (c: any) => c.status === 'resolved' && c.content === 'Please clarify attribution',
      ),
    )
  } else {
    const site = await payload.create({
      collection: 'sites',
      data: { name: '07A Editorial', slug: 'editorial-07a', lifecycle: 'active' },
    })
    const foreign = await payload.create({
      collection: 'sites',
      data: { name: '07A Foreign', slug: 'foreign-07a', lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@rc107a.test', role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: 'author@rc107a.test', role: 'staff' },
    })
    const reviewer = await payload.create({
      collection: 'users',
      data: { email: 'reviewer@rc107a.test', role: 'staff' },
    })
    const outsider = await payload.create({
      collection: 'users',
      data: { email: 'outsider@rc107a.test', role: 'staff' },
    })
    const member = await payload.create({
      collection: 'users',
      data: { email: 'ungranted@rc107a.test', role: 'staff' },
    })
    for (const u of [staff, reviewer, outsider])
      await payload.create({
        collection: 'member-site-roles',
        data: {
          member: typeof u.member === 'string' ? u.member : u.member.id,
          site: u === outsider ? foreign.id : site.id,
          role: 'contributor',
        },
      })
    const cookies = await Promise.all(
      [owner, staff, reviewer, outsider, member].map(
        async (u) => `${await session(u)}; renegade-active-site=${site.id}`,
      ),
    )
    const [own, author, peer, other, regular] = cookies
    const publication = (
      await payload.find({ collection: 'publications', where: { site: { equals: site.id } } })
    ).docs[0]
    const doc = (
      await api(
        '/api/content',
        'POST',
        {
          site: site.id,
          publication: publication.id,
          title: '07A Accountable reporting',
          slug: 'review-07a',
          contentType: 'article',
          status: 'draft',
          owner: typeof staff.member === 'string' ? staff.member : staff.member.id,
          body: body('Original accountable copy'),
        },
        author,
        201,
      )
    ).json().doc
    check(
      'staff A creates a persisted draft through native HTTP',
      (await payload.findByID({ collection: 'content', id: doc.id })).title === doc.title,
    )
    const action = async (cookie: string, action: string, status = 200, extra: any = {}) =>
      (
        await api(
          '/api/admin/workflow/actions',
          'POST',
          { articleId: doc.id, action, ...extra },
          cookie,
          status,
        )
      ).json().item
    await action(peer, 'approve', 422)
    check('approval denied before submission', true)
    await api(`/api/content/${doc.id}`, 'PATCH', { status: 'approved' }, author, 403)
    await api(`/api/content/${doc.id}`, 'PATCH', { status: 'published' }, author, 403)
    check('native form cannot bypass approval or publisher permission', true)
    await action(regular, 'submit', 403)
    await action(other, 'submit', 403)
    await action('', 'submit', 403)
    check('ungranted staff, foreign-site staff and anonymous transitions denied', true)
    await api(
      '/api/payload-locked-documents',
      'POST',
      {
        document: { relationTo: 'content', value: doc.id },
        user: { relationTo: 'users', value: outsider.id },
      },
      other,
      403,
    )
    check('foreign-site lock acquisition denied', true)
    const lock = (
      await api(
        '/api/payload-locked-documents',
        'POST',
        {
          document: { relationTo: 'content', value: doc.id },
          user: { relationTo: 'users', value: staff.id },
        },
        author,
        201,
      )
    ).json().doc
    check(
      'staff A acquires native persistent lock',
      (await payload.findByID({ collection: 'payload-locked-documents', id: lock.id })).id ===
        lock.id,
    )
    await api(
      '/api/payload-locked-documents',
      'POST',
      {
        document: { relationTo: 'content', value: doc.id },
        user: { relationTo: 'users', value: reviewer.id },
      },
      peer,
      409,
    )
    await api(
      `/api/content/${doc.id}?overrideLock=true`,
      'PATCH',
      { title: 'Should never save' },
      peer,
      423,
    )
    await api(`/api/payload-locked-documents/${lock.id}`, 'DELETE', undefined, peer, [403, 404])
    await action(peer, 'submit', 422)
    check(
      'second editor cannot acquire, force-save, release, or transition another editor lock',
      true,
    )
    await api(`/api/payload-locked-documents/${lock.id}`, 'DELETE', undefined, author)
    check('lock owner releases via supported native HTTP', true)
    const retryLock = (
      await api(
        '/api/payload-locked-documents',
        'POST',
        {
          document: { relationTo: 'content', value: doc.id },
          user: { relationTo: 'users', value: reviewer.id },
        },
        peer,
        201,
      )
    ).json().doc
    await api(`/api/payload-locked-documents/${retryLock.id}`, 'DELETE', undefined, peer)
    check('second editor can retry acquire and release after owner release', true)
    check('staff A submits to review', (await action(author, 'submit')).status === 'review')
    await action(author, 'approve', 403, { reviewerId: reviewer.id, role: 'publisher' })
    check('self approval denied despite forged role and reviewer hints', true)
    check(
      'staff B returns for edits',
      (await action(peer, 'request-changes', 200, { comment: 'Clarify attribution' })).status ===
        'changes-requested',
    )
    const comment = (
      await api(
        '/api/admin/workflow/comments',
        'POST',
        {
          action: 'create',
          articleId: doc.id,
          target: 'body',
          content: 'Please clarify attribution',
        },
        peer,
        201,
      )
    ).json().comment
    check('review comment persisted', Boolean(comment.id))
    await api(`/api/content/${doc.id}`, 'PATCH', { body: body('Edited accountable copy') }, author)
    const companion = (
      await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: doc.id } },
        depth: 0,
      })
    ).docs[0]
    check('normal edit creates immutable revision #2', companion.currentRevisionSequence === 2)
    const authoredRevision = await payload.findByID({
      collection: 'revision-records',
      id: companion.currentRevision,
      depth: 0,
    })
    check(
      'saved revision attributes real authenticated staff editor',
      authoredRevision.createdBy === staff.id,
    )
    await action(author, 'submit')
    check(
      'staff B rejects review',
      (await action(peer, 'reject', 200, { comment: 'Needs final check' })).status === 'rejected',
    )
    check('author reopens rejected work', (await action(author, 'reopen')).status === 'draft')
    await action(author, 'submit')
    const race = await Promise.all(
      [peer, own].map((cookie) =>
        api(
          '/api/admin/workflow/actions',
          'POST',
          { articleId: doc.id, action: 'approve', comment: 'Ready after edits' },
          cookie,
          [200, 422],
        ),
      ),
    )
    check(
      'competing approvals serialize without lost decision',
      race.filter((r) => r.response.status === 200).length === 1 &&
        race.filter((r) => r.response.status === 422).length === 1,
    )
    const persisted = await payload.findByID({ collection: 'content', id: doc.id, depth: 0 })
    check(
      'canonical approval and review audit are persisted',
      persisted.status === 'approved' &&
        persisted.auditMetadata.cmosWorkflow.reviewDecisions.length === 3,
    )
    await api(
      '/api/admin/workflow/comments',
      'POST',
      { action: 'resolve', commentId: comment.id },
      own,
    )
    check('owner resolves review comment', true)
    const queues = (
      await api(`/api/admin/workflow/queues?siteId=${site.id}`, 'GET', undefined, peer)
    ).json().queues
    check(
      'approved item visible in team queue',
      queues.team.approved.some((i: any) => i.id === doc.id),
    )
    await api(`/api/admin/workflow/audit?articleId=${doc.id}`, 'GET', undefined, other, 403)
    check('foreign-site audit denied', true)
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: doc.id, action: 'reopen' },
      peer,
      403,
      { origin: 'https://foreign.invalid' },
    )
    check('cross-origin workflow mutation denied', true)
    const [name, value] = peer.split(';')[0].split('=')
    await page.context().addCookies([
      { name, value, url: base },
      { name: 'renegade-active-site', value: site.id, url: base },
    ])
    await page.goto(`${base}/admin/workflow`, { timeout: 180000 })
    await dismissConsent()
    await page.getByRole('button', { name: /Team Queues/ }).click()
    await page.getByRole('button', { name: /^approved \(1\)$/i }).click()
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await page.getByText('Ready after edits', { exact: false }).waitFor()
    check(
      'ordinary queue UI renders status, review selection and persisted decision feedback',
      true,
    )
    await page.reload()
    await page.getByRole('button', { name: /Team Queues/ }).click()
    await page.getByRole('button', { name: /^approved \(1\)$/i }).click()
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await page.getByText('Ready after edits', { exact: false }).waitFor()
    check(
      'refresh reloads persisted queue and history',
      (await page.locator('body').innerText()).includes('Ready after edits'),
    )
    await page.screenshot({ path: `${out}/review-queue.png`, fullPage: true })
    const broken = body('QA blocked link')
    ;(broken.root.children[0] as any).children = [
      {
        type: 'link',
        version: 3,
        format: '',
        indent: 0,
        direction: 'ltr',
        fields: { url: '/missing-07a', linkType: 'custom' },
        children: [
          {
            type: 'text',
            version: 1,
            text: 'missing reference',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
          },
        ],
      },
    ]
    const qa = (
      await api(
        '/api/content',
        'POST',
        {
          site: site.id,
          publication: publication.id,
          title: 'QA gate article',
          slug: 'qa-07a',
          contentType: 'article',
          status: 'draft',
          body: broken,
        },
        author,
        201,
      )
    ).json().doc
    const qaAction = async (cookie: string, action: string, status = 200, extra: any = {}) =>
      (
        await api(
          '/api/admin/workflow/actions',
          'POST',
          { articleId: qa.id, action, ...extra },
          cookie,
          status,
        )
      ).json().item
    const blocked = await qaAction(author, 'submit')
    check(
      'submission runs canonical QA and visibly blocks unavailable internal links',
      blocked.queueMembership === 'blocked' && blocked.qualityGateSnapshot.blockingIssueCount > 0,
    )
    await qaAction(peer, 'approve', 422)
    const bulk = (
      await api(
        '/api/admin/workflow/bulk',
        'POST',
        { articleIds: [qa.id], action: 'approve' },
        peer,
      )
    ).json().result
    check(
      'single and bulk approval both enforce persisted QA',
      bulk.failedCount === 1 &&
        bulk.succeededCount === 0 &&
        (await payload.findByID({ collection: 'content', id: qa.id })).status === 'review',
    )
    await qaAction(peer, 'emergency-override', 403, { reason: 'Not authorized' })
    await qaAction(own, 'emergency-override', 422)
    await qaAction(own, 'emergency-override', 422, { reason: 'Attempted QA bypass' })
    check('staff override and missing owner justification denied', true)
    await api(`/api/content/${qa.id}`, 'PATCH', { body: body('QA repaired copy') }, author)
    await qaAction(author, 'submit')
    const [ownerName, ownerValue] = own.split(';')[0].split('=')
    await page.context().addCookies([{ name: ownerName, value: ownerValue, url: base }])
    await page.goto(`${base}/admin/workflow`, { timeout: 180000 })
    await dismissConsent()
    await page.getByRole('button', { name: /Team Queues/ }).click()
    await page.getByRole('button', { name: /^awaiting Approval \(1\)$/i }).click()
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await page
      .getByPlaceholder('Add review notes, requested changes, or approval comment...')
      .fill('Owner verified QA repair')
    const [decisionResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/admin/workflow/actions') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: /Approve$/ }).click(),
    ])
    check(
      'owner UI approval succeeds after real QA repair',
      decisionResponse.status() === 200 &&
        (await payload.findByID({ collection: 'content', id: qa.id })).status === 'approved',
    )
    await page.getByText('Owner verified QA repair', { exact: false }).waitFor()
    await page.screenshot({ path: `${out}/owner-approval.png`, fullPage: true })
    await api(`/api/content/${qa.id}`, 'PATCH', { body: body('Changed after approval') }, author)
    const changed = (
      await api(`/api/admin/workflow/queues?siteId=${site.id}`, 'GET', undefined, own)
    ).json().queues
    const changedItem = Object.values(changed.team)
      .flat()
      .find((i: any) => i.id === qa.id) as any
    check(
      'post-approval body edit invalidates approval and retains decision history',
      changedItem.status === 'draft' &&
        changedItem.staleApproval &&
        changedItem.reviewDecisions.length === 1,
    )
    await api(`/api/content/${doc.id}`, 'PATCH', { auditMetadata: {} }, author, 403)
    check('direct audit deletion denied without changing decisions', true)
    const finalLock = (
      await api(
        '/api/payload-locked-documents',
        'POST',
        {
          document: { relationTo: 'content', value: doc.id },
          user: { relationTo: 'users', value: staff.id },
        },
        author,
        201,
      )
    ).json().doc
    const revisions = await payload.count({
      collection: 'revision-records',
      where: { article: { equals: companion.id } },
    })
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          content: doc.id,
          article: companion.id,
          owner: owner.id,
          staff: staff.id,
          lock: finalLock.id,
          revisions: revisions.totalDocs,
        },
        null,
        2,
      ),
    )
  }
  succeeded = true
} catch (error) {
  console.error(error)
} finally {
  if (!succeeded)
    await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ checks, succeeded, trace }, null, 2),
  )
  await browser.close()
  await payload.destroy()
  process.exit(succeeded ? 0 : 1)
}
