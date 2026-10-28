/* eslint-disable @typescript-eslint/no-explicit-any -- isolated acceptance actors and polymorphic Payload records */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { getPayload } from 'payload'
import { Client } from 'pg'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { createForumThread } from '../../src/modules/community/service'
import { getOrCreateCommentThread } from '../../src/modules/community/comment-identity'
import { sink, sockets, messages } from '../rc1-09d/smtp-sink'

const expect = playwrightExpect.configure({ timeout: 60000 })
assert.equal(process.env.RC1_10B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5456/rc110b_complete_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/10B'
const base = 'http://localhost:39012'
const marker = Date.now().toString(36)
const trace: any[] = []
const check = (name: string, result: unknown) => {
  assert.ok(result, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
const payload: any = await getPayload({ config })
const nextEnv = await readFile('next-env.d.ts')
const tsconfig = await readFile('tsconfig.json')
let payloadClosed = false
let web: ChildProcess | undefined
let activePage: any
let succeeded = false
const browser = await chromium.launch({ headless: true })
const identities: any[] = []
async function closePayload() {
  if (payloadClosed) return
  const pool = payload.db.pool
  const idle = new Set(pool._idle.map((entry: any) => entry.client))
  for (const client of [...pool._clients])
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery)
      client.release(true)
    }
  await pool.end()
  await payload.destroy()
  payloadClosed = true
}
async function command(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (data) => {
      output += data
    })
    child.stderr.on('data', (data) => {
      output += data
    })
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(output))))
  })
}
async function until(name: string, action: () => Promise<unknown>) {
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    if (await action()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out: ${name}`)
}
function startWeb(name: string) {
  web = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39012'],
    { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${name}.log`)
  const redact = () =>
    new Transform({
      transform(chunk, _encoding, callback) {
        callback(null, String(chunk).replace(/token=[^\s&"<>]+/g, 'token=[redacted]'))
      },
    })
  web.stdout!.pipe(redact()).pipe(log, { end: false })
  web.stderr!.pipe(redact()).pipe(log, { end: false })
}
async function stopWeb() {
  if (!web || web.exitCode !== null) return
  const exited = new Promise<void>((resolve) => web!.once('exit', () => resolve()))
  await new Promise<void>((resolve) =>
    spawn('taskkill', ['/PID', String(web!.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    }).once('exit', () => resolve()),
  )
  await exited
}
async function ready() {
  await until('web ready', async () => {
    try {
      return (await fetch(`${base}/api/member-auth/me`)).status === 401
    } catch {
      return false
    }
  })
}
async function csrf(context: any) {
  return (
    (await context.cookies()).find((cookie: any) => cookie.name === 'renegade-member-csrf')
      ?.value ?? ''
  )
}
async function mutate(context: any, route: string, data: any, expected = 200, method = 'POST') {
  const response = await context.request.fetch(`${base}${route}`, {
    method,
    data,
    headers: { origin: base, 'x-member-csrf': await csrf(context) },
    timeout: 120000,
  })
  assert.equal(response.status(), expected, `${method} ${route}: ${await response.text()}`)
  return response.json()
}
async function member(email: string, displayName: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  activePage = page
  page.setDefaultTimeout(120000)
  const before = messages.length
  await page.goto(`${base}/member-auth`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeEnabled()
  const reject = page.getByRole('button', { name: 'Reject non-essential', exact: true })
  await reject.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await reject.isVisible()) await reject.click()
  await page.getByLabel('Email address', { exact: true }).fill(email)
  const requested = page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/magic-link/request') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  assert.equal((await requested).status(), 200)
  await until('local SMTP link', async () =>
    messages.slice(before).some((message) => message.to === email),
  )
  const mime = messages
    .slice(before)
    .find((message) => message.to === email)!
    .raw.replace(/=\r\n/g, '')
    .replace(/=3D/g, '=')
  const token = /[?&]token=([^\s"<>]+)/.exec(mime)?.[1]
  assert.ok(token)
  await page.goto(`${base}/member-auth/verify?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle',
  })
  await expect(page.getByRole('status')).toHaveText('Signed in.')
  const me = await (await context.request.get(`${base}/api/member-auth/me`)).json()
  assert.ok(me.memberId)
  await mutate(
    context,
    '/api/member-auth/profile',
    { displayName, visibility: 'public' },
    200,
    'PATCH',
  )
  const identity = { context, page, memberId: me.memberId, displayName }
  identities.push(identity)
  check(`${displayName}: ordinary email UI and local SMTP link establish a member session`, true)
  return identity
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
const snapshot = async (query: (text: string) => Promise<any>) =>
  (
    await query(
      `SELECT d.id,d.site_id,d.status,d.comments_policy,d.moderation_state,d.pinned,p.id AS post_id,p.author_member_id,p.parent_id,p.body,p.status AS post_status,p.moderation_state AS post_moderation FROM discussions d LEFT JOIN discussion_posts p ON p.discussion_id=d.id ORDER BY d.id,p.id`,
    )
  ).rows

try {
  const alpha = await payload.create({
    collection: 'sites',
    data: {
      name: '10B Alpha',
      slug: `alpha10b-${marker}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
    },
    overrideAccess: true,
  })
  const beta = await payload.create({
    collection: 'sites',
    data: {
      name: '10B Beta',
      slug: `beta10b-${marker}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
    },
    overrideAccess: true,
  })
  const owner = await payload.create({
    collection: 'users',
    data: { email: `operator-${marker}@example.test`, role: 'owner' },
    overrideAccess: true,
  })
  const publication = (
    await payload.find({
      collection: 'publications',
      where: { site: { equals: alpha.id } },
      overrideAccess: true,
    })
  ).docs[0]
  assert.ok(publication)
  // Published/draft articles are explicitly labelled prerequisite fixtures; publishing is not accepted by this subpass.
  const article = await payload.create({
    collection: 'content',
    data: {
      site: alpha.id,
      publication: publication.id,
      contentType: 'article',
      title: 'Town hall reporting',
      slug: `town-hall-${marker}`,
      canonicalPath: `/articles/town-hall-${marker}`,
      status: 'published',
      visibility: 'public',
      publishedAt: new Date().toISOString(),
      commentsPolicy: 'open',
      summary: 'A published discussion fixture.',
      body: body('Public reporting for the discussion acceptance journey.'),
    },
    overrideAccess: true,
  })
  const draft = await payload.create({
    collection: 'content',
    data: {
      site: alpha.id,
      publication: publication.id,
      contentType: 'article',
      title: 'Unpublished reporting',
      slug: `draft-${marker}`,
      status: 'draft',
      visibility: 'public',
      commentsPolicy: 'open',
      body: body('Unpublished fixture.'),
    },
    overrideAccess: true,
  })
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: base,
      canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://beta.example.test' },
      indexingMode: 'index',
      launchState: 'live',
    },
    overrideAccess: true,
  })
  const operatorSession = await createPasskeySession(
    owner,
    process.env.PAYLOAD_SECRET!,
    async (id, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, owner.id, expiresAt],
      )
    },
  )
  const operator = await browser.newContext()
  await operator.addCookies([{ name: 'renegade-passkey', value: operatorSession.token, url: base }])
  async function native(collection: string, data: any, expected = 201, id?: string) {
    const response = await operator.request.fetch(
      `${base}/api/${collection}${id ? `/${id}` : ''}`,
      { method: id ? 'PATCH' : 'POST', data, headers: { origin: base }, timeout: 120000 },
    )
    assert.equal(response.status(), expected, `${collection}: ${await response.text()}`)
    return response.json()
  }
  await new Promise<void>((resolve) => sink.listen(3143, '127.0.0.1', resolve))
  startWeb('web')
  await ready()
  for (const route of [
    '/member-auth',
    '/member-auth/verify',
    '/members/settings',
    '/api/member-auth/magic-link/request',
    '/api/member-auth/magic-link/complete',
    '/api/member-auth/profile',
    '/api/analytics/consent',
    '/api/community/comments',
    '/api/community/posts',
    '/api/community/threads',
    '/forums',
    article.canonicalPath,
  ]) {
    await (await fetch(`${base}${route}`)).arrayBuffer()
  }
  const section = (
    await native('forum-sections', {
      site: alpha.id,
      name: 'Civic forums',
      slug: `civic-${marker}`,
    })
  ).doc
  const forum = (
    await native('forums', {
      site: alpha.id,
      section: section.id,
      name: 'Town square',
      slug: `square-${marker}`,
    })
  ).doc
  const child = (
    await native('forums', {
      site: alpha.id,
      section: section.id,
      parent: forum.id,
      name: 'Local meetings',
      slug: `meetings-${marker}`,
    })
  ).doc
  const betaSection = (
    await native('forum-sections', {
      site: beta.id,
      name: 'Beta forum section',
      slug: `beta-${marker}`,
    })
  ).doc
  const betaForum = (
    await native('forums', {
      site: beta.id,
      section: betaSection.id,
      name: 'Beta forum',
      slug: `beta-${marker}`,
    })
  ).doc
  await native(
    'forums',
    {
      site: alpha.id,
      section: section.id,
      parent: betaForum.id,
      name: 'Forbidden parent',
      slug: `foreign-${marker}`,
    },
    400,
  )
  await native('forums', { parent: child.id }, 400, forum.id)
  check(
    'fixture operator native API creates site-scoped forum hierarchy and rejects foreign parent/cycle',
    (await payload.findByID({ collection: 'forums', id: child.id, depth: 0 })).parent === forum.id,
  )
  const alice = await member(`alice-${marker}@example.test`, 'Alice 10B')
  const bob = await member(`bob-${marker}@example.test`, 'Bob 10B')
  const mod = await member(`moderator-${marker}@example.test`, 'Moderator 10B')
  const foreignMod = await member(`foreign-${marker}@example.test`, 'Foreign moderator 10B')
  await native('member-site-roles', { site: alpha.id, member: mod.memberId, role: 'moderator' })
  await native('member-site-roles', {
    site: beta.id,
    member: foreignMod.memberId,
    role: 'moderator',
  })
  check('operator grants moderation to the ordinary members only in their assigned sites', true)

  activePage = alice.page
  await alice.page.goto(`${base}${article.canonicalPath}`, { waitUntil: 'networkidle' })
  const commentSection = alice.page.getByRole('region', {
    name: 'Community Discussion',
    exact: true,
  })
  await expect(
    commentSection.getByRole('button', { name: 'Post Comment', exact: true }),
  ).toBeVisible()
  await commentSection.getByLabel('Add to the discussion').fill('Alice article root')
  const articleResponse = alice.page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/api/community/comments') && response.request().method() === 'POST',
  )
  await commentSection.getByRole('button', { name: 'Post Comment', exact: true }).click()
  const rootResponse = await articleResponse
  assert.equal(rootResponse.status(), 201, await rootResponse.text())
  const root = (await rootResponse.json()).comment
  await expect(commentSection.locator(`#comment-${root.id}`)).toContainText('Alice article root')
  check(
    'ordinary article comment UI persists canonical author/site attachment and renders saved output',
    (await payload.findByID({ collection: 'discussion-posts', id: root.id, depth: 0 }))
      .authorMember === alice.memberId,
  )
  await bob.page.goto(`${base}${article.canonicalPath}`, { waitUntil: 'networkidle' })
  await bob.page
    .locator(`#comment-${root.id}`)
    .getByRole('button', { name: 'Reply', exact: true })
    .click()
  await bob.page
    .locator(`#comment-${root.id}`)
    .getByPlaceholder('Write a reply...')
    .fill('Bob article child')
  const childResponse = bob.page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/api/community/comments') && response.request().method() === 'POST',
  )
  await bob.page
    .locator(`#comment-${root.id}`)
    .getByRole('button', { name: 'Post Reply', exact: true })
    .click()
  const articleChildResponse = await childResponse
  assert.equal(articleChildResponse.status(), 201, await articleChildResponse.text())
  const articleChild = (await articleChildResponse.json()).comment
  await alice.page.reload()
  await alice.page
    .locator(`#comment-${articleChild.id}`)
    .getByRole('button', { name: 'Reply', exact: true })
    .click()
  await alice.page
    .locator(`#comment-${articleChild.id}`)
    .getByPlaceholder('Write a reply...')
    .fill('Alice article grandchild')
  const grandResponse = alice.page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/api/community/comments') && response.request().method() === 'POST',
  )
  await alice.page
    .locator(`#comment-${articleChild.id}`)
    .getByRole('button', { name: 'Post Reply', exact: true })
    .click()
  const articleGrandchildResponse = await grandResponse
  assert.equal(articleGrandchildResponse.status(), 201, await articleGrandchildResponse.text())
  const articleGrandchild = (await articleGrandchildResponse.json()).comment
  await alice.page.reload()
  await expect(alice.page.locator(`#comment-${articleGrandchild.id}`)).toHaveAttribute(
    'data-depth',
    '2',
  )
  await alice.page.screenshot({ path: `${out}/article.png`, fullPage: true })
  check(
    'multiple-member article reply tree reloads through canonical comments with depth two',
    (await payload.findByID({ collection: 'discussion-posts', id: articleGrandchild.id, depth: 0 }))
      .parent === articleChild.id,
  )
  const serverArticle = await (await fetch(`${base}${article.canonicalPath}`)).text()
  check(
    'anonymous article HTML contains the same saved comment bodies before hydration',
    serverArticle.includes('Alice article grandchild') &&
      serverArticle.includes(`id="${root.paginationAnchor}"`),
  )

  await alice.page
    .locator(`#comment-${root.id}`)
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await alice.page
    .locator(`#comment-${root.id}`)
    .locator('textarea')
    .fill('Alice corrected article root')
  await alice.page
    .locator(`#comment-${root.id}`)
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await expect(alice.page.locator(`#comment-${root.id}`)).toContainText(
    'Alice corrected article root',
  )
  await mutate(
    bob.context,
    '/api/community/comments',
    { siteId: alpha.id, commentId: root.id, body: 'Forged edit' },
    403,
    'PATCH',
  )
  await mutate(
    bob.context,
    '/api/community/comments',
    { siteId: alpha.id, commentId: root.id },
    403,
    'DELETE',
  )
  check(
    'ordinary author edit persists while object-ID edits/deletes from another member leave body intact',
    (await payload.findByID({ collection: 'discussion-posts', id: root.id, depth: 0 })).body ===
      'Alice corrected article root',
  )
  await mutate(
    alice.context,
    '/api/community/comments',
    { siteId: alpha.id, attachedToId: draft.id, body: 'Forbidden draft discussion' },
    404,
  )
  check(
    'unpublished article rejects commenting without creating an attached discussion',
    (
      await payload.count({
        collection: 'discussions',
        where: { 'attachedTo.value': { equals: draft.id } },
        overrideAccess: true,
      })
    ).totalDocs === 0,
  )
  const noCsrf = await alice.context.request.post(`${base}/api/community/comments`, {
    data: { siteId: alpha.id, attachedToId: article.id, body: 'Missing CSRF' },
  })
  check('article CSRF failure is an actual denied HTTP request', noCsrf.status() === 403)

  await alice.page.goto(`${base}/forums`, { waitUntil: 'networkidle' })
  await expect(alice.page.locator('article').filter({ hasText: 'Local meetings' })).toHaveAttribute(
    'data-depth',
    '1',
  )
  await alice.page.getByRole('link', { name: 'Town square', exact: true }).click()
  await alice.page.getByRole('button', { name: '+ New Topic', exact: true }).click()
  await alice.page.getByLabel('Topic Title', { exact: true }).fill(`Civic accountability ${marker}`)
  await alice.page.getByLabel('Content', { exact: true }).fill('Alice forum root')
  const topicResponse = alice.page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/api/community/threads') && response.request().method() === 'POST',
  )
  await alice.page.getByRole('button', { name: 'Publish Topic', exact: true }).click()
  const createdTopicResponse = await topicResponse
  assert.equal(createdTopicResponse.status(), 201, await createdTopicResponse.text())
  const topic = await createdTopicResponse.json()
  await expect(alice.page).toHaveURL(`${base}${topic.discussion.canonicalPath}`)
  const topicId = topic.discussion.id
  const firstPostId = topic.firstPost.id
  check(
    'ordinary new-topic UI navigates to its persisted canonical public route',
    (await payload.findByID({ collection: 'discussions', id: topicId, depth: 0 })).owner ===
      alice.memberId,
  )
  await bob.page.goto(`${base}${topic.discussion.canonicalPath}`, { waitUntil: 'networkidle' })
  await bob.page
    .locator(`[data-post-id="${firstPostId}"]`)
    .getByRole('button', { name: 'Reply', exact: true })
    .click()
  await bob.page.getByPlaceholder('Write your response…').fill('Bob nested forum child')
  const replyResponse = bob.page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/api/community/posts') && response.request().method() === 'POST',
  )
  await bob.page.getByRole('button', { name: 'Submit Reply', exact: true }).click()
  const forumChildResponse = await replyResponse
  assert.equal(forumChildResponse.status(), 201, await forumChildResponse.text())
  const forumChild = (await forumChildResponse.json()).post
  await expect(bob.page.locator(`[data-post-id="${forumChild.id}"]`)).toContainText(
    'Bob nested forum child',
  )
  await alice.page.reload()
  await alice.page
    .locator(`[data-post-id="${forumChild.id}"]`)
    .getByRole('button', { name: 'Reply', exact: true })
    .click()
  await alice.page.getByPlaceholder('Write your response…').fill('Alice nested forum grandchild')
  const forumGrandResponse = alice.page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/api/community/posts') && response.request().method() === 'POST',
  )
  await alice.page.getByRole('button', { name: 'Submit Reply', exact: true }).click()
  const forumGrandchildResponse = await forumGrandResponse
  assert.equal(forumGrandchildResponse.status(), 201, await forumGrandchildResponse.text())
  const forumGrandchild = (await forumGrandchildResponse.json()).post
  await alice.page.reload()
  await expect(alice.page.locator(`[data-post-id="${forumGrandchild.id}"]`)).toHaveAttribute(
    'data-depth',
    '2',
  )
  await expect(alice.page.locator(`[data-post-id="${forumChild.id}"]`)).toContainText('Bob 10B')
  check(
    'multiple-member forum tree reload retains nested parent IDs and public author attribution',
    (await payload.findByID({ collection: 'discussion-posts', id: forumGrandchild.id, depth: 0 }))
      .parent === forumChild.id,
  )
  const countPosts = async () =>
    (
      await payload.count({
        collection: 'discussion-posts',
        where: { discussion: { equals: topicId } },
        overrideAccess: true,
      })
    ).totalDocs
  const beforeForeign = await countPosts()
  await mutate(
    bob.context,
    '/api/community/posts',
    { siteId: alpha.id, discussionId: topicId, body: 'Foreign parent', parentPostId: root.id },
    404,
  )
  await mutate(
    bob.context,
    '/api/community/posts',
    { siteId: alpha.id, discussionId: topicId, body: 'Foreign quote', quotePostId: root.id },
    404,
  )
  await mutate(
    bob.context,
    '/api/community/comments',
    {
      siteId: alpha.id,
      attachedToId: article.id,
      body: 'Foreign article parent',
      parentPostId: firstPostId,
    },
    404,
  )
  check(
    'foreign discussion parent/quote object IDs are denied before persistence',
    (await countPosts()) === beforeForeign,
  )
  await mutate(
    alice.context,
    '/api/community/posts',
    { siteId: beta.id, discussionId: topicId, body: 'Foreign site' },
    404,
  )
  await mutate(
    alice.context,
    '/api/community/threads',
    { siteId: alpha.id, forumId: betaForum.id, title: 'Foreign forum', body: 'Denied' },
    404,
  )
  const anonymous = await browser.newContext()
  await anonymous.request.get(`${base}/api/member-auth/me`)
  const anonReply = await anonymous.request.post(`${base}/api/community/posts`, {
    data: { siteId: alpha.id, discussionId: topicId, body: 'Anonymous' },
  })
  check(
    'site substitution, foreign forum ID and anonymous writes are denied',
    anonReply.status() === 403 && (await countPosts()) === beforeForeign,
  )
  const betaThread = (
    await native('discussions', {
      site: beta.id,
      kind: 'thread',
      forum: betaForum.id,
      title: 'Beta object boundary',
      canonicalPath: `/forums/${betaForum.slug}/beta-object-boundary`,
      status: 'open',
      visibility: 'public',
      commentsPolicy: 'open',
    })
  ).doc
  await mutate(
    alice.context,
    '/api/community/posts',
    { siteId: alpha.id, discussionId: betaThread.id, body: 'Guessed foreign object' },
    404,
  )
  await mutate(
    mod.context,
    '/api/community/threads',
    {
      siteId: alpha.id,
      discussionId: betaThread.id,
      status: 'locked',
      reason: 'Guessed foreign object',
    },
    404,
    'PATCH',
  )
  check(
    'foreign thread object IDs cannot bypass the local site hint, including for a local moderator',
    (await payload.findByID({ collection: 'discussions', id: betaThread.id, depth: 0 })).status ===
      'open',
  )
  await native(
    'discussions',
    {
      site: alpha.id,
      kind: 'thread',
      forum: betaForum.id,
      title: 'Forbidden foreign forum relationship',
      canonicalPath: `/forums/${betaForum.slug}/forbidden-${marker}`,
      status: 'open',
    },
    400,
  )
  check(
    'native topic creation cannot substitute a foreign forum under a local site',
    (
      await payload.count({
        collection: 'discussions',
        where: { title: { equals: 'Forbidden foreign forum relationship' } },
        overrideAccess: true,
      })
    ).totalDocs === 0,
  )
  await native(
    'discussions',
    {
      site: beta.id,
      kind: 'attached',
      attachedTo: { relationTo: 'content', value: article.id },
      title: 'Forbidden foreign article relationship',
      canonicalPath: `/foreign-article-${marker}`,
      status: 'open',
    },
    400,
  )
  check(
    'native attached discussion creation cannot substitute content from another site',
    (
      await payload.count({
        collection: 'discussions',
        where: { title: { equals: 'Forbidden foreign article relationship' } },
        overrideAccess: true,
      })
    ).totalDocs === 0,
  )
  await mutate(
    bob.context,
    '/api/community/threads',
    { siteId: alpha.id, discussionId: topicId, pinned: true, reason: 'Forged privilege' },
    403,
    'PATCH',
  )
  await mutate(
    foreignMod.context,
    '/api/community/threads',
    { siteId: alpha.id, discussionId: topicId, status: 'locked', reason: 'Foreign role' },
    403,
    'PATCH',
  )
  await mutate(
    bob.context,
    '/api/community/posts',
    {
      siteId: alpha.id,
      postId: firstPostId,
      moderationState: 'removed',
      reason: 'Forged privilege',
    },
    403,
    'PATCH',
  )
  check(
    'members and foreign-site moderators cannot pin, lock or moderate another site',
    (await payload.findByID({ collection: 'discussions', id: topicId, depth: 0 })).status ===
      'open',
  )
  await mod.page.goto(`${base}${topic.discussion.canonicalPath}`, { waitUntil: 'networkidle' })
  await mod.page
    .getByLabel('Moderation reason', { exact: true })
    .fill('Local discussion governance')
  const pinned = mod.page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/api/community/threads') && response.request().method() === 'PATCH',
  )
  await mod.page.getByRole('button', { name: 'Pin topic', exact: true }).click()
  assert.equal((await pinned).status(), 200)
  await expect(mod.page.getByRole('button', { name: 'Unpin topic', exact: true })).toBeVisible()
  check(
    'moderator pin UI persists the canonical pin field',
    (await payload.findByID({ collection: 'discussions', id: topicId, depth: 0 })).pinned === true,
  )
  await mutate(
    mod.context,
    '/api/community/threads',
    {
      siteId: alpha.id,
      discussionId: topicId,
      commentsPolicy: 'closed',
      reason: 'Close discussion',
    },
    200,
    'PATCH',
  )
  await mutate(
    alice.context,
    '/api/community/posts',
    { siteId: alpha.id, discussionId: topicId, body: 'Closed topic reply' },
    403,
  )
  await mutate(
    mod.context,
    '/api/community/threads',
    {
      siteId: alpha.id,
      discussionId: topicId,
      commentsPolicy: 'open',
      status: 'locked',
      reason: 'Lock discussion',
    },
    200,
    'PATCH',
  )
  await mutate(
    alice.context,
    '/api/community/posts',
    { siteId: alpha.id, discussionId: topicId, body: 'Locked topic reply' },
    403,
  )
  await mutate(
    alice.context,
    '/api/community/comments',
    { siteId: alpha.id, commentId: firstPostId, body: 'Locked edit' },
    403,
    'PATCH',
  )
  check(
    'closed and locked topics reject new replies and locked author edits without new posts',
    (await countPosts()) === beforeForeign,
  )
  await alice.page.reload()
  await expect(alice.page.getByText('Replies are closed or locked by moderators.')).toBeVisible()
  await mutate(
    mod.context,
    '/api/community/threads',
    { siteId: alpha.id, discussionId: topicId, status: 'open', reason: 'Reopen discussion' },
    200,
    'PATCH',
  )
  await mutate(
    mod.context,
    '/api/community/posts',
    {
      siteId: alpha.id,
      postId: forumChild.id,
      moderationState: 'review',
      reason: 'Review contribution',
    },
    200,
    'PATCH',
  )
  const publicPosts = await (
    await anonymous.request.get(
      `${base}/api/community/posts?siteId=${alpha.id}&discussionId=${topicId}`,
    )
  ).json()
  check(
    'review status persists and hides the post body from anonymous readers',
    !publicPosts.posts.some((post: any) => post.id === forumChild.id) &&
      (await payload.findByID({ collection: 'discussion-posts', id: forumChild.id, depth: 0 }))
        .status === 'hidden',
  )
  await mutate(
    mod.context,
    '/api/community/posts',
    {
      siteId: alpha.id,
      postId: forumChild.id,
      moderationState: 'restricted',
      reason: 'Restricted contribution',
    },
    200,
    'PATCH',
  )
  await mutate(
    mod.context,
    '/api/community/posts',
    {
      siteId: alpha.id,
      postId: forumChild.id,
      moderationState: 'clear',
      reason: 'Approve contribution',
    },
    200,
    'PATCH',
  )
  const restoredPosts = await (
    await anonymous.request.get(
      `${base}/api/community/posts?siteId=${alpha.id}&discussionId=${topicId}`,
    )
  ).json()
  check(
    'moderator approval restores the same canonical post and author',
    restoredPosts.posts.some(
      (post: any) => post.id === forumChild.id && post.authorMember === bob.memberId,
    ),
  )

  const titleQuery = encodeURIComponent(`accountability ${marker}`)
  const publicSearch = await (
    await anonymous.request.get(`${base}/api/community/threads?siteId=${alpha.id}&q=${titleQuery}`)
  ).json()
  check(
    'public topic search discovers the saved public thread',
    publicSearch.threads.some((thread: any) => thread.id === topicId),
  )
  const globalSearch = await (await anonymous.request.get(`${base}/search?q=${titleQuery}`)).text()
  check(
    'public full-text search links to the indexed forum title',
    globalSearch.includes(`href="${topic.discussion.canonicalPath}"`),
  )
  check(
    'public search projection contains the public forum title but no post bodies',
    (
      await payload.db.pool.query(
        'SELECT title,body FROM search_documents WHERE collection=$1 AND canonical_id=$2',
        ['discussions', topicId],
      )
    ).rows.length === 1 &&
      (
        await payload.db.pool.query(
          'SELECT count(*)::int AS count FROM search_documents WHERE collection=$1',
          ['discussion-posts'],
        )
      ).rows[0].count === 0,
  )
  await mutate(
    mod.context,
    '/api/community/threads',
    {
      siteId: alpha.id,
      discussionId: topicId,
      moderationState: 'restricted',
      reason: 'Hide topic from discovery',
    },
    200,
    'PATCH',
  )
  const hiddenSearch = await (
    await anonymous.request.get(`${base}/api/community/threads?siteId=${alpha.id}&q=${titleQuery}`)
  ).json()
  const hiddenRoute = await anonymous.request.get(`${base}${topic.discussion.canonicalPath}`)
  const hiddenGlobalSearch = await (
    await anonymous.request.get(`${base}/search?q=${titleQuery}`)
  ).text()
  check(
    'restricted thread disappears from public topic search, route and persisted index',
    hiddenSearch.threads.length === 0 &&
      hiddenRoute.status() === 404 &&
      !hiddenGlobalSearch.includes(`href="${topic.discussion.canonicalPath}"`) &&
      (
        await payload.db.pool.query(
          'SELECT count(*)::int AS count FROM search_documents WHERE collection=$1 AND canonical_id=$2',
          ['discussions', topicId],
        )
      ).rows[0].count === 0,
  )
  await mutate(
    mod.context,
    '/api/community/threads',
    {
      siteId: alpha.id,
      discussionId: topicId,
      moderationState: 'clear',
      reason: 'Restore public topic',
    },
    200,
    'PATCH',
  )
  for (let i = 0; i < 32; i++)
    await mutate(
      i % 2 ? alice.context : bob.context,
      '/api/community/posts',
      { siteId: alpha.id, discussionId: topicId, body: `Page probe ${i}` },
      201,
    )
  const pageOne = await (
    await anonymous.request.get(
      `${base}/api/community/posts?siteId=${alpha.id}&discussionId=${topicId}&page=1`,
    )
  ).json()
  const pageTwo = await (
    await anonymous.request.get(
      `${base}/api/community/posts?siteId=${alpha.id}&discussionId=${topicId}&page=2`,
    )
  ).json()
  check(
    'post pagination has disjoint pages, stable order and truthful continuation',
    pageOne.posts.length === 30 &&
      pageOne.hasNextPage &&
      pageTwo.posts.length === 5 &&
      !pageTwo.hasNextPage &&
      !pageOne.posts.some((post: any) => pageTwo.posts.some((other: any) => other.id === post.id)),
  )
  await alice.page.reload()
  await alice.page.getByRole('button', { name: 'Load more posts', exact: true }).click()
  await expect(alice.page.locator('[data-post-id]')).toHaveCount(35)
  check('ordinary load-more UI exposes the second persisted page', true)
  for (let i = 0; i < 21; i++)
    await mutate(
      i % 2 ? alice.context : bob.context,
      '/api/community/threads',
      {
        siteId: alpha.id,
        forumId: forum.id,
        title: `Ordinary topic ${i} ${marker}`,
        body: `Topic body ${i}`,
      },
      201,
    )
  await alice.page.goto(`${base}/forums/${forum.slug}`, { waitUntil: 'networkidle' })
  await expect(alice.page.getByRole('link', { name: 'Next topics', exact: true })).toBeVisible()
  await expect(alice.page.locator('article').first()).toContainText('Pinned: Civic accountability')
  await alice.page.getByRole('link', { name: 'Next topics', exact: true }).click()
  await expect(alice.page.locator('article')).toHaveCount(2)
  check('topic paging and persisted pin ordering work through public navigation', true)

  await alice.page.goto(`${base}${topic.discussion.canonicalPath}`, {
    waitUntil: 'networkidle',
  })
  const countBeforeFailure = await countPosts()
  await alice.page.route('**/api/community/posts', (route: any) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Local acceptance injected failure' }),
        })
      : route.continue(),
  )
  await alice.page.getByPlaceholder('Write your response…').fill('Retry after local failure')
  await alice.page.getByRole('button', { name: 'Submit Reply', exact: true }).click()
  await expect(alice.page.getByRole('status')).toHaveText('Local acceptance injected failure')
  check(
    'injected reply HTTP failure shows an error and persists no success',
    (await countPosts()) === countBeforeFailure,
  )
  await alice.page.unroute('**/api/community/posts')
  await alice.page.getByRole('button', { name: 'Submit Reply', exact: true }).click()
  await expect(alice.page.getByRole('status')).toHaveText('Reply posted.')
  check(
    'ordinary retry after the failed request creates exactly one persisted post',
    (await countPosts()) === countBeforeFailure + 1,
  )

  await mutate(
    alice.context,
    '/api/community/comments',
    { siteId: alpha.id, commentId: root.id },
    200,
    'DELETE',
  )
  const deleted = await (
    await anonymous.request.get(
      `${base}/api/community/comments?siteId=${alpha.id}&attachedToId=${article.id}`,
    )
  ).json()
  check(
    'author deletion leaves a body-redacted tombstone and retains descendant records',
    deleted.comments.some(
      (post: any) => post.id === root.id && post.isTombstone && !post.body.includes('corrected'),
    ) && deleted.comments.some((post: any) => post.id === articleGrandchild.id),
  )
  for (let i = 0; i < 32; i++)
    await mutate(
      i % 2 ? alice.context : bob.context,
      '/api/community/comments',
      { siteId: alpha.id, attachedToId: article.id, body: `Article page probe ${i}` },
      201,
    )
  await alice.page.goto(`${base}${article.canonicalPath}`, { waitUntil: 'networkidle' })
  await alice.page.getByRole('button', { name: 'Load more comments', exact: true }).click()
  await expect(
    alice.page
      .getByRole('region', { name: 'Community Discussion', exact: true })
      .locator('article'),
  ).toHaveCount(35)
  check(
    'article comment paging loads every persisted record including nested replies and tombstones',
    true,
  )
  await mutate(
    mod.context,
    '/api/community/posts',
    {
      siteId: alpha.id,
      postId: forumChild.id,
      moderationState: 'removed',
      reason: 'Moderator removal',
    },
    200,
    'PATCH',
  )
  const removed = await (
    await anonymous.request.get(
      `${base}/api/community/posts?siteId=${alpha.id}&discussionId=${topicId}`,
    )
  ).json()
  check(
    'moderator removal leaves a persisted tombstone and tree attribution',
    removed.posts.some(
      (post: any) =>
        post.id === forumChild.id &&
        post.isTombstone &&
        post.body === '[Comment removed by moderator]',
    ),
  )
  await mutate(
    bob.context,
    '/api/community/comments',
    { siteId: alpha.id, commentId: forumChild.id, body: 'Cannot revive removed post' },
    400,
    'PATCH',
  )
  const historical = (
    await native('discussion-posts', {
      discussion: topicId,
      authorMember: alice.memberId,
      body: 'Historical edit-window fixture',
      displayOrder: 900,
      permalink: `${topic.discussion.canonicalPath}#post-900`,
      paginationAnchor: 'post-900',
      status: 'published',
      visibility: 'public',
      moderationState: 'clear',
      createdAt: new Date(Date.now() - 16 * 60000).toISOString(),
    })
  ).doc
  const expiredEdit = await mutate(
    alice.context,
    '/api/community/comments',
    { siteId: alpha.id, commentId: historical.id, body: 'Late edit' },
    403,
    'PATCH',
  )
  check(
    'a historical timestamp fixture exercises the actual HTTP author edit-window denial',
    expiredEdit.code === 'EDIT_WINDOW_EXPIRED' &&
      (await payload.findByID({ collection: 'discussion-posts', id: historical.id, depth: 0 }))
        .body === 'Historical edit-window fixture',
  )
  await native('discussion-posts', { authorMember: bob.memberId }, 400, historical.id)
  const rawMemberEdit = await alice.context.request.patch(
    `${base}/api/discussion-posts/${historical.id}`,
    { data: { authorMember: bob.memberId } },
  )
  check(
    'native attribution replacement and raw member collection bypass are denied',
    rawMemberEdit.status() === 403,
  )
  const concurrent = await Promise.all(
    [alice, bob, alice, bob].map((identity, index) =>
      mutate(
        identity.context,
        '/api/community/posts',
        { siteId: alpha.id, discussionId: topicId, body: `Concurrent reply ${index}` },
        201,
      ),
    ),
  )
  check(
    'concurrent supported API replies allocate unique stable post order and permalinks',
    new Set(concurrent.map((result) => result.post.displayOrder)).size === 4 &&
      new Set(concurrent.map((result) => result.post.permalink)).size === 4,
  )
  const originalCreate = payload.create.bind(payload)
  payload.create = (options: any) =>
    options.collection === 'discussion-posts'
      ? Promise.reject(new Error('Injected post persistence failure'))
      : originalCreate(options)
  try {
    await assert.rejects(
      createForumThread(
        payload,
        {
          siteId: alpha.id,
          forumId: forum.id,
          authorMemberId: alice.memberId,
          title: `Rollback fixture ${marker}`,
          body: 'Must roll back',
        },
        {
          siteId: alpha.id,
          actor: {
            kind: 'member',
            memberId: alice.memberId,
            status: 'active',
            isStaff: false,
            isModerator: false,
          },
        },
      ),
      /Injected post persistence failure/,
    )
  } finally {
    payload.create = originalCreate
  }
  check(
    'injected canonical post failure rolls back the new topic and its search projection',
    (
      await payload.count({
        collection: 'discussions',
        where: { title: { equals: `Rollback fixture ${marker}` } },
        overrideAccess: true,
      })
    ).totalDocs === 0 &&
      (
        await payload.db.pool.query(
          'SELECT count(*)::int AS count FROM search_documents WHERE title=$1',
          [`Rollback fixture ${marker}`],
        )
      ).rows[0].count === 0,
  )
  const scopedStaff = await payload.create({
    collection: 'users',
    data: { email: `scoped-staff-${marker}@example.test`, role: 'staff' },
    overrideAccess: true,
  })
  await native('member-site-roles', {
    site: alpha.id,
    member: typeof scopedStaff.member === 'string' ? scopedStaff.member : scopedStaff.member.id,
    role: 'contributor',
  })
  const scopedSession = await createPasskeySession(
    scopedStaff,
    process.env.PAYLOAD_SECRET!,
    async (id, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, scopedStaff.id, expiresAt],
      )
    },
  )
  const scopedContext = await browser.newContext()
  await scopedContext.addCookies([
    { name: 'renegade-passkey', value: scopedSession.token, url: base },
  ])
  const deniedStaff = await scopedContext.request.patch(`${base}/api/forums/${betaForum.id}`, {
    data: { name: 'Cross-site staff mutation' },
    headers: { origin: base },
  })
  check(
    'fixture scoped staff cannot mutate a foreign forum through native HTTP',
    [403, 404].includes(deniedStaff.status()) &&
      (await payload.findByID({ collection: 'forums', id: betaForum.id, depth: 0 })).name ===
        'Beta forum',
  )
  const betaPost = (
    await native('discussion-posts', {
      discussion: betaThread.id,
      authorMember: bob.memberId,
      body: 'Beta native parent fixture',
      displayOrder: 1,
      permalink: `${betaThread.canonicalPath}#post-1`,
      paginationAnchor: 'post-1',
      status: 'published',
      visibility: 'public',
      moderationState: 'clear',
    })
  ).doc
  const staffPost = {
    discussion: topicId,
    authorMember:
      typeof scopedStaff.member === 'string' ? scopedStaff.member : scopedStaff.member.id,
    body: 'Authorized scoped native post',
    displayOrder: 950,
    permalink: `${topic.discussion.canonicalPath}#post-950`,
    paginationAnchor: 'post-950',
    status: 'published',
    visibility: 'public',
    moderationState: 'clear',
  }
  const allowedNative = await scopedContext.request.post(`${base}/api/discussion-posts`, {
    data: staffPost,
    headers: { origin: base },
  })
  assert.equal(allowedNative.status(), 201, await allowedNative.text())
  const countBeforeNativeDenial = await countPosts()
  const deniedNativeParent = await scopedContext.request.post(`${base}/api/discussion-posts`, {
    data: {
      ...staffPost,
      parent: betaPost.id,
      displayOrder: 951,
      permalink: `${topic.discussion.canonicalPath}#post-951`,
      paginationAnchor: 'post-951',
    },
    headers: { origin: base },
  })
  check(
    'an authorized native operator can create a local post but cannot attach a foreign discussion parent',
    deniedNativeParent.status() === 400 && (await countPosts()) === countBeforeNativeDenial,
  )
  const versionedThread = await getOrCreateCommentThread(payload, {
    siteId: alpha.id,
    canonicalContentId: article.id,
  })
  const versionedRoute = `/api/v1/sites/${alpha.id}/threads/${versionedThread.id}/comments`
  const spoofed = await anonymous.request.post(`${base}${versionedRoute}`, {
    data: { body: 'Forged author' },
    headers: {
      origin: base,
      cookie: 'renegade-member-csrf=fixture-token',
      'x-member-csrf': 'fixture-token',
      'x-member-id': alice.memberId,
      'idempotency-key': `spoof-${marker}`,
    },
    timeout: 120000,
  })
  check(
    'versioned comment API rejects anonymous author-header impersonation with otherwise valid CSRF',
    spoofed.status() === 401,
  )
  const versionedResponse = await alice.context.request.post(`${base}${versionedRoute}`, {
    data: { body: 'Versioned authenticated comment' },
    headers: {
      origin: base,
      'x-member-csrf': await csrf(alice.context),
      'idempotency-key': `real-${marker}`,
    },
    timeout: 120000,
  })
  assert.equal(versionedResponse.status(), 201, await versionedResponse.text())
  const versionedComment = (await versionedResponse.json()).data
  check(
    'versioned HTTP comment persists the real session author in its canonical SQL contract',
    (
      await payload.db.pool.query('SELECT author_id,body_raw FROM comments WHERE id=$1', [
        versionedComment.id,
      ])
    ).rows[0].author_id === alice.memberId,
  )
  const versionedReplay = await alice.context.request.post(`${base}${versionedRoute}`, {
    data: { body: 'Versioned authenticated comment' },
    headers: {
      origin: base,
      'x-member-csrf': await csrf(alice.context),
      'idempotency-key': `real-${marker}`,
    },
  })
  check(
    'versioned idempotency replay returns the same durable comment without duplication',
    versionedReplay.status() === 200 &&
      (await versionedReplay.json()).data.id === versionedComment.id &&
      (
        await payload.db.pool.query(
          'SELECT count(*)::int AS count FROM comments WHERE thread_id=$1',
          [versionedThread.id],
        )
      ).rows[0].count === 1,
  )
  const foreignReplay = await bob.context.request.post(`${base}${versionedRoute}`, {
    data: { body: 'Guessed idempotency key' },
    headers: {
      origin: base,
      'x-member-csrf': await csrf(bob.context),
      'idempotency-key': `real-${marker}`,
    },
  })
  check(
    'versioned idempotency key cannot impersonate another author',
    foreignReplay.status() === 409,
  )
  const beforeRestart = await snapshot(payload.db.pool.query.bind(payload.db.pool))
  await writeFile(
    `${out}/state.json`,
    JSON.stringify(
      {
        marker,
        alpha: alpha.id,
        beta: beta.id,
        forumId: forum.id,
        topicId,
        topicPath: topic.discussion.canonicalPath,
        articleId: article.id,
        articlePath: article.canonicalPath,
        memberIds: identities.map((identity) => identity.memberId),
        beforeRestart,
      },
      null,
      2,
    ),
  )
  await alice.page.goto(`${base}${topic.discussion.canonicalPath}`, {
    waitUntil: 'networkidle',
  })
  await expect(alice.page.locator(`[data-post-id="${forumGrandchild.id}"]`)).toHaveAttribute(
    'data-depth',
    '2',
  )
  await alice.page.screenshot({ path: `${out}/forum.png`, fullPage: false })
  await stopWeb()
  await closePayload()
  await command(['restart', 'rc110b-complete-20261026'])
  await until('PostgreSQL restarted', async () => {
    try {
      const client = new Client({ connectionString: process.env.DATABASE_URL })
      await client.connect()
      await client.end()
      return true
    } catch {
      return false
    }
  })
  startWeb('web-restart')
  await ready()
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  const afterRestart = await snapshot(client.query.bind(client))
  await client.end()
  check(
    'actual web and PostgreSQL process restart retains exact ordered discussion/post state',
    JSON.stringify(beforeRestart) === JSON.stringify(afterRestart),
  )
  await alice.page.goto(`${base}${article.canonicalPath}`, { waitUntil: 'networkidle' })
  await expect(alice.page.locator(`#comment-${articleGrandchild.id}`)).toContainText(
    'Alice article grandchild',
  )
  await expect(alice.page.locator(`#comment-${articleGrandchild.id}`)).toHaveAttribute(
    'data-depth',
    '2',
  )
  await alice.page.goto(`${base}${topic.discussion.canonicalPath}`, {
    waitUntil: 'networkidle',
  })
  await expect(alice.page.locator(`[data-post-id="${forumGrandchild.id}"]`)).toHaveAttribute(
    'data-depth',
    '2',
  )
  check(
    'ordinary authenticated member reload after restart renders preserved article/forum trees',
    true,
  )
  await mod.page.goto(`${base}${topic.discussion.canonicalPath}`, { waitUntil: 'networkidle' })
  await expect(mod.page.getByRole('button', { name: 'Unpin topic', exact: true })).toBeVisible()
  check('site moderator role and pin survive restart', true)
  const restartDenied = await mutate(
    bob.context,
    '/api/community/threads',
    { siteId: alpha.id, discussionId: topicId, status: 'locked', reason: 'Still forbidden' },
    403,
    'PATCH',
  )
  check('member privilege denial remains enforced after restart', Boolean(restartDenied.error))
  succeeded = true
} catch (error) {
  trace.push({
    passed: false,
    error:
      error instanceof Error
        ? error.stack?.replace(/token=[^\s&"<>]+/g, 'token=[redacted]')
        : String(error),
  })
  await activePage?.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally {
  await writeFile(
    `${out}/trace.json`,
    JSON.stringify(
      {
        succeeded,
        passed: trace.filter((entry) => entry.passed).length,
        failed: trace.filter((entry) => entry.passed === false).length,
        skipped: 0,
        trace,
      },
      null,
      2,
    ),
  )
  await stopWeb()
  await browser.close()
  for (const socket of sockets) socket.destroy()
  await new Promise<void>((resolve) => sink.close(() => resolve()))
  await closePayload()
  await writeFile('next-env.d.ts', nextEnv)
  await writeFile('tsconfig.json', tsconfig)
}
