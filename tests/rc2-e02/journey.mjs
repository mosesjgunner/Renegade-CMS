// RC2-E-02 — Forums, comments, reports and moderator decisions.
// Member -> forum topic + threaded replies + article comments -> report
// -> moderation case -> moderator queue -> quarantine / lock / suspend
// -> user-visible outcomes -> reinstate (reversal). Plus forbidden
// actions, cross-site isolation, the comment rate guard on the v1
// thread surface, and a browser path (browser.mjs). Members are clean
// public members (E-01 pattern); one is promoted to moderator by the
// operator, as a site admin would.
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const siteA = world.siteA.siteId
const siteB = world.siteB.siteId
const hostA = world.siteA.host
const hostB = world.siteB.host
const originA = world.siteA.origin
const adminA = `renegade-passkey=${world.cookies.adminA}`
const outsiderB = `renegade-passkey=${world.cookies.outsiderB}`
const stamp = Date.now().toString(36)
const EMAILS = {
  author: `e02-author-${stamp}@example.com`,
  troll: `e02-troll-${stamp}@example.com`,
  reporter: `e02-reporter-${stamp}@example.com`,
  mod: `e02-mod-${stamp}@example.com`,
  spam: `e02-spam-${stamp}@example.com`,
}

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const probe = (name, detail) => console.log(`PROBE  ${name} — ${detail}`)

function rawRequest({ host, path, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: 39071, path, method, headers: { Host: host, ...headers } },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data = null
          try {
            data = JSON.parse(text)
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, data, text })
        })
      },
    )
    req.on('error', reject)
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}
const api = (host, path, { method = 'GET', cookie, csrf, body, origin, extraHeaders } = {}) =>
  rawRequest({
    host,
    path,
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-member-csrf': csrf } : {}),
      ...(origin ? { origin } : {}),
      ...(extraHeaders ?? {}),
    },
    body,
  })
const staff =
  (host, cookie) =>
  (path, opts = {}) =>
    rawRequest({
      host,
      path,
      method: opts.method ?? 'GET',
      headers: { cookie, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
      body: opts.body,
    })
const staffA = staff(hostA, adminA)
const staffB = staff(hostB, outsiderB)
const cookiesFrom = (res) => {
  const out = {}
  for (const line of res.headers['set-cookie'] ?? []) {
    const [pair] = line.split(';')
    const idx = pair.indexOf('=')
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
  }
  return out
}
const full = (c) =>
  `renegade-member=${c['renegade-member']}; renegade-member-csrf=${c['renegade-member-csrf']}`
function runSpec(spec, env) {
  execFileSync('npx', ['vitest', 'run', spec, '--no-file-parallelism'], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'pipe',
    timeout: 300_000,
  })
}

// ---------- members ----------
runSpec('tests/rc2-e02/issue-tokens.spec.ts', {
  E02_EMAILS: Object.values(EMAILS).join(','),
  E02_OUT: '/tmp/e02-tokens.json',
})
const tokens = JSON.parse(readFileSync('/tmp/e02-tokens.json', 'utf8')).tokens
const members = {}
for (const [key, email] of Object.entries(EMAILS)) {
  const res = await api(hostA, '/api/member-auth/magic-link/complete', {
    method: 'POST',
    body: { token: tokens[email] },
  })
  const c = cookiesFrom(res)
  const me = await api(hostA, '/api/member-auth/me', { cookie: full(c) })
  members[key] = {
    cookie: full(c),
    csrf: c['renegade-member-csrf'],
    id: me.data?.memberId,
    profileId: me.data?.profile?.id,
  }
}

// ---------- operator setup ----------
// Activate the blog publication + open comments on the seeded article.
await staffA(`/api/publications/${world.siteA.blogPublicationId}`, {
  method: 'PATCH',
  body: { status: 'active' },
})
await staffA(`/api/content/${world.siteA.publishedArticleId}`, {
  method: 'PATCH',
  body: { commentsPolicy: 'open' },
})
const forums = await staffA(`/api/forums?where[site][equals]=${siteA}&limit=5`)
const forum = forums.data?.docs?.[0]
// Promote the mod member (a normal operator action for a site admin).
// The REST create for member-site-roles refused the site admin (403,
// run 1), so the grant goes through the operator path the world
// builder uses; the refusal itself is recorded in the RESULT.
runSpec('tests/rc2-e02/grant-mod.spec.ts', {
  E02_MEMBER_ID: members.mod.id,
  E02_SITE_ID: siteA,
})
probe('setup', `forum=${forum?.slug} modGranted=true`)

// ---------- stage 1: forum topic with threaded replies ----------
const thread = await api(hostA, '/api/community/threads', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  body: {
    siteId: siteA,
    forumId: forum.id,
    title: `E-02 thread ${stamp}`,
    body: 'Opening post by the author.',
  },
})
const threadId = thread.data?.thread?.id ?? thread.data?.discussion?.id ?? thread.data?.id
const trollReply = await api(hostA, '/api/community/posts', {
  method: 'POST',
  cookie: members.troll.cookie,
  csrf: members.troll.csrf,
  body: { siteId: siteA, discussionId: threadId, body: `Troll reply ${stamp}: totally not spam.` },
})
const trollPostId = trollReply.data?.post?.id ?? trollReply.data?.id
const authorReReply = await api(hostA, '/api/community/posts', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  body: {
    siteId: siteA,
    discussionId: threadId,
    body: 'Author reply to the troll.',
    parentPostId: trollPostId,
  },
})
const postsList = (cookie) =>
  api(
    hostA,
    `/api/community/posts?discussionId=${threadId}&siteId=${siteA}`,
    cookie ? { cookie } : {},
  )
const threadRead = await postsList()
const threadText = JSON.stringify(threadRead.data ?? {})
stage(
  'a member opens a forum topic and the reply thread nests',
  thread.status === 201 &&
    trollReply.status === 201 &&
    authorReReply.status === 201 &&
    threadText.includes('Troll reply') &&
    threadText.includes('Author reply to the troll.'),
  `thread=${thread.status} replies=${trollReply.status}/${authorReReply.status} read=${threadRead.status}`,
)
writeFileSync(
  '/tmp/e02-state.json',
  JSON.stringify({ threadId, trollPostId, forumSlug: forum?.slug, stamp }, null, 2),
)

// ---------- stage 2: article comments + safe rendering ----------
const xssBody = `<script>window.__e02xss=1</script><img src=x onerror="window.__e02xss=2"> E-02 payload ${stamp}`
const xssComment = await api(hostA, '/api/community/comments', {
  method: 'POST',
  cookie: members.troll.cookie,
  csrf: members.troll.csrf,
  body: {
    siteId: siteA,
    attachedToId: world.siteA.publishedArticleId,
    attachedToCollection: 'content',
    body: xssBody,
  },
})
const publicComments = await api(
  hostA,
  `/api/community/comments?attachedToId=${world.siteA.publishedArticleId}&siteId=${siteA}`,
)
stage(
  'a script-laden comment round-trips as plain text data (execution safety is proven in the browser)',
  xssComment.status === 201 &&
    JSON.stringify(publicComments.data ?? {}).includes('E-02 payload') &&
    (publicComments.headers['content-type'] ?? '').includes('application/json'),
  `post=${xssComment.status} read=${publicComments.status}`,
)

// ---------- stage 3: reports aggregate into one case ----------
const report1 = await api(hostA, '/api/community/reports', {
  method: 'POST',
  cookie: members.reporter.cookie,
  csrf: members.reporter.csrf,
  origin: originA,
  body: { targetType: 'post', targetId: trollPostId, reason: 'Harassment in thread' },
})
const report2 = await api(hostA, '/api/community/reports', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: { targetType: 'post', targetId: trollPostId, reason: 'Second report, same post' },
})
await api(hostA, '/api/community/reports', {
  method: 'POST',
  cookie: members.reporter.cookie,
  csrf: members.reporter.csrf,
  origin: originA,
  body: { targetType: 'discussion', targetId: threadId, reason: 'Thread needs a lock' },
})
const profileReportBefore = await api(hostA, '/api/community/reports', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: {
    targetType: 'member_profile',
    targetId: members.troll.profileId,
    reason: 'Repeat offender account',
  },
})
stage(
  'a member with no site role row cannot be reported by profile (measured gap)',
  profileReportBefore.status === 404,
  `profileReport=${profileReportBefore.status} ${profileReportBefore.data?.error ?? ''}`,
)
// The member_profile target resolves only once the member holds a
// site role row (profiles JOIN member_site_roles in both the report
// and action services). Provision one through the operator path —
// the same boundary as the moderator grant — and re-file.
runSpec('tests/rc2-e02/grant-mod.spec.ts', {
  E02_MEMBER_ID: members.troll.id,
  E02_SITE_ID: siteA,
  E02_ROLE: 'member',
})
const profileReportAfter = await api(hostA, '/api/community/reports', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: {
    targetType: 'member_profile',
    targetId: members.troll.profileId,
    reason: 'Repeat offender account',
  },
})

const queue = await api(hostA, '/api/community/reports?siteId=' + siteA, {
  cookie: members.mod.cookie,
})
const caseFor = (targetId) => (queue.data?.cases ?? []).find((c) => c.targetId === targetId)?.id
const caseThread = caseFor(threadId)
const caseMember = caseFor(members.troll.profileId)
const cases = (queue.data?.cases ?? []).filter((c) => c.targetId === trollPostId)
const reportsForTarget = (queue.data?.reports ?? []).filter((r) => r.targetId === trollPostId)
const caseId = cases[0]?.id
stage(
  'member reports land in the moderator queue as one case per target',
  report1.status === 201 &&
    report2.status === 201 &&
    queue.status === 200 &&
    cases.length === 1 &&
    reportsForTarget.length === 2,
  `reports=${report1.status}/${report2.status} queue=${queue.status} cases=${cases.length} reportsOnTarget=${reportsForTarget.length}`,
)

stage(
  'once a site role row exists, the profile report opens a moderation case',
  profileReportAfter.status === 201 && Boolean(caseMember),
  `report=${profileReportAfter.status} case=${caseMember ? 'found' : 'missing'}`,
)

// ---------- stage 4: forbidden moderation ----------
const memberAction = await api(hostA, '/api/community/moderation', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: {
    caseId,
    action: 'quarantine',
    targetType: 'post',
    targetId: trollPostId,
    reason: 'I am not a moderator',
  },
})
const anonQueue = await api(hostA, '/api/community/reports?siteId=' + siteA)
const crossSiteAction = await api(hostB, '/api/community/moderation', {
  method: 'POST',
  cookie: members.mod.cookie,
  csrf: members.mod.csrf,
  origin: world.siteB.origin,
  body: {
    caseId,
    action: 'quarantine',
    targetType: 'post',
    targetId: trollPostId,
    reason: 'Wrong site entirely',
    siteId: siteA,
  },
})
stage(
  'moderation is refused to plain members, anonymous callers, and the wrong site',
  memberAction.status === 403 && anonQueue.status === 403 && crossSiteAction.status !== 200,
  `member=${memberAction.status} anon=${anonQueue.status} crossSite=${crossSiteAction.status}`,
)

// ---------- stage 5: quarantine + audit chain ----------
const quarantine = await api(hostA, '/api/community/moderation', {
  method: 'POST',
  cookie: members.mod.cookie,
  csrf: members.mod.csrf,
  origin: originA,
  body: {
    caseId,
    action: 'quarantine',
    targetType: 'post',
    targetId: trollPostId,
    reason: 'Harassment confirmed',
  },
})
const readAfterQuarantine = await postsList()
const modView = await api(hostA, '/api/community/moderation?siteId=' + siteA, {
  cookie: members.mod.cookie,
})
stage(
  'quarantine hides the post from the public thread and the audit chain verifies',
  quarantine.status === 200 &&
    !JSON.stringify(readAfterQuarantine.data ?? {}).includes('Troll reply') &&
    modView.status === 200 &&
    modView.data?.auditValid === true &&
    (modView.data?.actions ?? []).some(
      (a) => a.action === 'quarantine' && a.targetId === trollPostId,
    ),
  `action=${quarantine.status} auditValid=${modView.data?.auditValid}`,
)

// ---------- stage 6: lock the thread ----------
const lock = await api(hostA, '/api/community/moderation', {
  method: 'POST',
  cookie: members.mod.cookie,
  csrf: members.mod.csrf,
  origin: originA,
  body: {
    caseId: caseThread,
    action: 'lock_thread',
    targetType: 'discussion',
    targetId: threadId,
    reason: 'Thread locked for cooling-off',
  },
})
const replyToLocked = await api(hostA, '/api/community/posts', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  body: { siteId: siteA, discussionId: threadId, body: 'Reply into a locked thread.' },
})
stage(
  'a locked thread refuses new replies',
  lock.status === 200 && replyToLocked.status !== 201,
  `lock=${lock.status} reply=${replyToLocked.status} ${replyToLocked.data?.error ?? ''}`,
)

// ---------- stage 7: sanction the troll, then lift it ----------
const suspend = await api(hostA, '/api/community/moderation', {
  method: 'POST',
  cookie: members.mod.cookie,
  csrf: members.mod.csrf,
  origin: originA,
  body: {
    caseId: caseMember,
    action: 'suspend_posting',
    targetType: 'member_profile',
    targetId: members.troll.profileId,
    reason: 'Repeat harassment',
    scope: 'site_global',
  },
})
const trollAttempt = await api(hostA, '/api/community/comments', {
  method: 'POST',
  cookie: members.troll.cookie,
  csrf: members.troll.csrf,
  body: {
    siteId: siteA,
    attachedToId: world.siteA.publishedArticleId,
    attachedToCollection: 'content',
    body: 'Posting while suspended.',
  },
})
probe(
  'suspend',
  `action=${suspend.status} err=${JSON.stringify(suspend.data)} trollAttempt=${trollAttempt.status} ${trollAttempt.data?.error ?? ''}`,
)
const liftSuspend = await api(hostA, '/api/community/moderation', {
  method: 'POST',
  cookie: members.mod.cookie,
  csrf: members.mod.csrf,
  origin: originA,
  body: {
    caseId: caseMember,
    action: 'reinstate',
    targetType: 'member_profile',
    targetId: members.troll.profileId,
    reason: 'Suspension served',
    scope: 'site_global',
  },
})
const trollAfterLift = await api(hostA, '/api/community/comments', {
  method: 'POST',
  cookie: members.troll.cookie,
  csrf: members.troll.csrf,
  body: {
    siteId: siteA,
    attachedToId: world.siteA.publishedArticleId,
    attachedToCollection: 'content',
    body: 'Posting after reinstatement.',
  },
})
stage(
  'a posting suspension blocks the member and reinstatement restores posting',
  suspend.status === 200 &&
    trollAttempt.status !== 201 &&
    liftSuspend.status === 200 &&
    trollAfterLift.status === 201,
  `suspend=${suspend.status} blocked=${trollAttempt.status} lift=${liftSuspend.status} after=${trollAfterLift.status}`,
)

// ---------- stage 8: reinstate the quarantined post (reversal) ----------
const reinstate = await api(hostA, '/api/community/moderation', {
  method: 'POST',
  cookie: members.mod.cookie,
  csrf: members.mod.csrf,
  origin: originA,
  body: {
    caseId,
    action: 'reinstate',
    targetType: 'post',
    targetId: trollPostId,
    reason: 'Decision reversed on review',
  },
})
const readAfterReinstate = await postsList()
stage(
  'reinstatement reverses the quarantine and the post is public again',
  reinstate.status === 200 && JSON.stringify(readAfterReinstate.data ?? {}).includes('Troll reply'),
  `reinstate=${reinstate.status}`,
)

// ---------- stage 9: the v1 comment rate guard ----------
// No HTTP route provisions a v1 comment thread (the production
// provisioning function has no callers), so the thread is provisioned
// through that function and the guard is exercised over real HTTP.
runSpec('tests/rc2-e02/provision-thread.spec.ts', {
  E02_SITE_ID: siteA,
  E02_CONTENT_ID: world.siteA.publishedArticleId,
})
const v1ThreadId = JSON.parse(readFileSync('/tmp/e02-v1-thread.json', 'utf8')).threadId
probe('v1 target', `thread=${v1ThreadId}`)
let rateStatuses = []
for (let i = 0; i < 7; i++) {
  const res = await api(hostA, `/api/v1/sites/${siteA}/threads/${v1ThreadId}/comments`, {
    method: 'POST',
    cookie: members.spam.cookie,
    csrf: members.spam.csrf,
    extraHeaders: { 'idempotency-key': `e02-spam-${stamp}-${i}` },
    body: { body: `Rapid comment ${i}` },
  })
  rateStatuses.push(res.status)
}
probe('rate', `statuses=${rateStatuses.join(',')}`)
stage(
  'the v1 comment surface rate-limits a rapid poster (5 per rolling minute)',
  rateStatuses.filter((s) => s === 429).length >= 1,
  `statuses=${rateStatuses.join(',')}`,
)

// ---------- stage 10: cross-site isolation ----------
const queueB = await api(hostB, '/api/community/reports?siteId=' + siteB, { cookie: outsiderB })
const bLeaks = (queueB.data?.cases ?? []).filter((c) => c.targetId === trollPostId).length
const threadOnB = await api(hostB, `/api/community/threads?threadId=${threadId}&siteId=${siteA}`)
stage(
  "Site B's moderation queue and reads show none of Site A's community",
  queueB.status === 200 && bLeaks === 0 && threadOnB.status !== 200,
  `queueB=${queueB.status} leaks=${bLeaks} threadOnB=${threadOnB.status}`,
)

// ---------- browser path ----------
let browserOk = true
try {
  const out = execFileSync('node', ['tests/rc2-e02/browser.mjs'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
    timeout: 300_000,
  }).toString()
  console.log(out.trim())
} catch (err) {
  browserOk = false
  console.log(String(err.stdout ?? '').trim())
  console.log(
    String(err.stderr ?? '')
      .trim()
      .slice(0, 800),
  )
  console.log('browser script exited non-zero')
}

const failed = results.filter((r) => !r.ok).length
console.log(
  `\n${results.length - failed}/${results.length} API stages passed${browserOk ? '' : ' (browser script reported failures)'}`,
)
process.exit(failed || !browserOk ? 1 : 0)
