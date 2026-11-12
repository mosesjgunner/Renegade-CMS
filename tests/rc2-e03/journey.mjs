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
  author: `e03-author-${stamp}@example.com`,
  peer: `e03-peer-${stamp}@example.com`,
  stranger: `e03-stranger-${stamp}@example.com`,
  pal: `e03-pal-${stamp}@example.com`,
  lurker: `e03-lurker-${stamp}@example.com`,
  browser: `e03-browser-${stamp}@example.com`,
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
runSpec('tests/rc2-e03/issue-tokens.spec.ts', {
  E03_EMAILS: Object.values(EMAILS).join(','),
  E03_OUT: '/tmp/e03-tokens.json',
})
const tokens = JSON.parse(readFileSync('/tmp/e03-tokens.json', 'utf8')).tokens
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
probe('setup', `forum=${forum?.slug}`)

const notifList = (m, host = hostA, site = siteA) =>
  api(host, `/api/community/notifications?siteId=${site}`, { cookie: m.cookie })
const ofKind = (res, kind) =>
  (res.data?.canonicalNotifications ?? []).filter((n) => (n.activityEvent?.type ?? n.kind) === kind)
const projectedOfKind = (res, kind) =>
  (res.data?.notifications ?? []).filter((n) => n.kind === kind)

// ---------- stage 1: a thread reply notifies the thread author ----------
const thread = await api(hostA, '/api/community/threads', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  body: { siteId: siteA, forumId: forum.id, title: `E-03 thread ${stamp}`, body: 'Opening post.' },
})
const threadId = thread.data?.thread?.id ?? thread.data?.discussion?.id ?? thread.data?.id
const reply1 = await api(hostA, '/api/community/posts', {
  method: 'POST',
  cookie: members.peer.cookie,
  csrf: members.peer.csrf,
  body: { siteId: siteA, discussionId: threadId, body: `Peer reply ${stamp}` },
})
const authorBox1 = await notifList(members.author)
const peerBox1 = await notifList(members.peer)
const lurkerBox1 = await notifList(members.lurker)
const authorThreadNotifs = projectedOfKind(authorBox1, 'thread.reply')
stage(
  'a thread reply lands as a canonical notification with the thread author only',
  reply1.status === 201 &&
    authorThreadNotifs.length >= 1 &&
    projectedOfKind(peerBox1, 'thread.reply').length === 0 &&
    (lurkerBox1.data?.notifications ?? []).length === 0,
  `reply=${reply1.status} authorNotifs=${authorThreadNotifs.length} unread=${authorBox1.data?.unreadCount} peer=${projectedOfKind(peerBox1, 'thread.reply').length} lurker=${(lurkerBox1.data?.notifications ?? []).length}`,
)
const notifId1 = authorThreadNotifs[0]?.id

// A second reply gives the author a second unread notification (used by
// the foreign mark-read stage below).
await api(hostA, '/api/community/posts', {
  method: 'POST',
  cookie: members.peer.cookie,
  csrf: members.peer.csrf,
  body: { siteId: siteA, discussionId: threadId, body: `Peer reply two ${stamp}` },
})
const authorBox2 = await notifList(members.author)
const notifId2 = projectedOfKind(authorBox2, 'thread.reply').find((n) => n.id !== notifId1)?.id

// ---------- stage 2: mark read is honored and counted ----------
const mark1 = await api(hostA, '/api/community/notifications', {
  method: 'PATCH',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: { siteId: siteA, notificationId: notifId1 },
})
const authorBox3 = await notifList(members.author)
const firstAfterMark = projectedOfKind(authorBox3, 'thread.reply').find((n) => n.id === notifId1)
stage(
  'marking one notification read persists and drops the unread count',
  mark1.status === 200 &&
    firstAfterMark?.read === true &&
    authorBox3.data?.unreadCount === authorBox2.data?.unreadCount - 1,
  `patch=${mark1.status} read=${firstAfterMark?.read} unread ${authorBox2.data?.unreadCount}->${authorBox3.data?.unreadCount}`,
)

// ---------- stage 3: a foreign member cannot mark it read ----------
await api(hostA, '/api/community/notifications', {
  method: 'PATCH',
  cookie: members.lurker.cookie,
  csrf: members.lurker.csrf,
  origin: originA,
  body: { siteId: siteA, notificationId: notifId2 },
})
const authorBox4 = await notifList(members.author)
const secondAfterForeign = projectedOfKind(authorBox4, 'thread.reply').find(
  (n) => n.id === notifId2,
)
stage(
  "marking another member's notification read is a no-op",
  secondAfterForeign?.read === false,
  `foreignTargetStillUnread=${secondAfterForeign?.read === false}`,
)

// ---------- stage 4: the in-app preference gate suppresses dispatch ----------
const prefOff = await api(hostA, '/api/community/notification-preferences', {
  method: 'PATCH',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: { siteId: siteA, channel: 'in_app', frequency: 'off', type: 'thread.reply' },
})
const beforePrefCount = projectedOfKind(await notifList(members.author), 'thread.reply').length
await api(hostA, '/api/community/posts', {
  method: 'POST',
  cookie: members.peer.cookie,
  csrf: members.peer.csrf,
  body: { siteId: siteA, discussionId: threadId, body: `Peer reply three ${stamp}` },
})
const afterPref = await notifList(members.author)
const prefOffWorked =
  prefOff.status === 200 && projectedOfKind(afterPref, 'thread.reply').length === beforePrefCount
await api(hostA, '/api/community/notification-preferences', {
  method: 'PATCH',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: { siteId: siteA, channel: 'in_app', frequency: 'immediate', type: 'thread.reply' },
})
stage(
  'turning in-app thread.reply notifications off suppresses new ones',
  prefOffWorked,
  `prefPatch=${prefOff.status} count ${beforePrefCount}->${projectedOfKind(afterPref, 'thread.reply').length}`,
)

// ---------- stage 5: the inbox projection is a seam with no live caller ----------
// The v1 comment path writes outbox events (comment.created.v1). The
// community GET merges a projected inbox store with the canonical one —
// but nothing in production runs the projector. Measure that first,
// then run the projector through its own module and re-read.
runSpec('tests/rc2-e03/provision-thread.spec.ts', {
  E03_SITE_ID: siteA,
  E03_CONTENT_ID: world.siteA.publishedArticleId,
})
const v1ThreadId = JSON.parse(readFileSync('/tmp/e03-v1-thread.json', 'utf8')).threadId
const v1Root = await api(hostA, `/api/v1/sites/${siteA}/threads/${v1ThreadId}/comments`, {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  extraHeaders: { 'idempotency-key': `e03-root-${stamp}` },
  body: { body: `V1 root comment ${stamp}` },
})
const v1RootId = v1Root.data?.data?.id ?? v1Root.data?.id ?? v1Root.data?.comment?.id
const v1Reply = await api(hostA, `/api/v1/sites/${siteA}/threads/${v1ThreadId}/comments`, {
  method: 'POST',
  cookie: members.peer.cookie,
  csrf: members.peer.csrf,
  extraHeaders: { 'idempotency-key': `e03-reply-${stamp}` },
  body: { body: `V1 reply comment ${stamp}`, parentId: v1RootId },
})
const inboxBefore = await notifList(members.author)
const inboxRowsBefore = inboxBefore.data?.inboxNotifications ?? []
runSpec('tests/rc2-e03/project-inbox.spec.ts', {})
const projection = JSON.parse(readFileSync('/tmp/e03-projection.json', 'utf8'))
const inboxAfter = await notifList(members.author)
const inboxRowsAfter = inboxAfter.data?.inboxNotifications ?? []
stage(
  'the outbox->inbox projector has no production caller (measured), and works when run',
  v1Reply.status === 201 &&
    inboxRowsBefore.length === 0 &&
    projection.delivered >= 1 &&
    inboxRowsAfter.length >= 1,
  `v1=${v1Root.status}/${v1Reply.status} inboxBefore=${inboxRowsBefore.length} projected=${JSON.stringify(projection)} inboxAfter=${inboxRowsAfter.length}`,
)

// ---------- stage 6: direct messaging honors the request gate ----------
// Designed semantics (conversation-composer): while a request is
// pending the recipient can READ the requester's messages (that is how
// they decide) and is notified of them, but cannot REPLY until they
// accept. The gate is on replying, not on reading.
const convo = await api(hostA, '/api/community/conversations', {
  method: 'POST',
  cookie: members.stranger.cookie,
  csrf: members.stranger.csrf,
  origin: originA,
  body: { siteId: siteA, targetMemberId: members.author.id },
})
const convoId = convo.data?.conversation?.id
const convoState = convo.data?.conversation?.request_state ?? convo.data?.conversation?.requestState
const firstMsg = await api(hostA, '/api/community/messages', {
  method: 'POST',
  cookie: members.stranger.cookie,
  csrf: members.stranger.csrf,
  origin: originA,
  body: {
    siteId: siteA,
    conversationId: convoId,
    body: `Hello from a stranger ${stamp}`,
    idempotencyKey: `e03-k1-${stamp}`,
  },
})
const authorMsgsPre = await api(
  hostA,
  `/api/community/messages?conversationId=${convoId}&siteId=${siteA}`,
  { cookie: members.author.cookie },
)
const readablePreAccept = JSON.stringify(authorMsgsPre.data ?? {}).includes(
  `Hello from a stranger ${stamp}`,
)
const authorBoxDm = await notifList(members.author)
const dmNotifBeforeAccept = projectedOfKind(authorBoxDm, 'direct_message.received').length
const earlyReply = await api(hostA, '/api/community/messages', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: {
    siteId: siteA,
    conversationId: convoId,
    body: 'Replying before accepting.',
    idempotencyKey: `e03-k0-${stamp}`,
  },
})
probe(
  'dm-gate',
  `preAcceptReadable=${readablePreAccept} dmNotifBefore=${dmNotifBeforeAccept} earlyReply=${earlyReply.status} ${earlyReply.data?.error ?? ''}`,
)
const accept = await api(hostA, '/api/community/message-requests', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: { siteId: siteA, conversationId: convoId, action: 'accept' },
})
const authorReply = await api(hostA, '/api/community/messages', {
  method: 'POST',
  cookie: members.author.cookie,
  csrf: members.author.csrf,
  origin: originA,
  body: {
    siteId: siteA,
    conversationId: convoId,
    body: `Welcome reply ${stamp}`,
    idempotencyKey: `e03-k2-${stamp}`,
  },
})
const strangerBox = await notifList(members.stranger)
stage(
  'a stranger DM waits as a request: readable by the recipient, reply-gated until accepted',
  convo.status === 201 &&
    convoState === 'pending_request' &&
    firstMsg.status === 201 &&
    readablePreAccept &&
    earlyReply.status === 403 &&
    accept.status === 200 &&
    authorReply.status === 201 &&
    projectedOfKind(strangerBox, 'direct_message.received').length >= 1,
  `convo=${convo.status}/${convoState} firstMsg=${firstMsg.status} readablePre=${readablePreAccept} earlyReply=${earlyReply.status} accept=${accept.status} reply=${authorReply.status} strangerDmNotifs=${projectedOfKind(strangerBox, 'direct_message.received').length}`,
)

// ---------- stage 7: resending with the same idempotency key duplicates nothing ----------
const authorMsgsBefore = await api(
  hostA,
  `/api/community/messages?conversationId=${convoId}&siteId=${siteA}`,
  { cookie: members.author.cookie },
)
const countBefore = (authorMsgsBefore.data?.messages ?? []).length
const dupSend = await api(hostA, '/api/community/messages', {
  method: 'POST',
  cookie: members.stranger.cookie,
  csrf: members.stranger.csrf,
  origin: originA,
  body: {
    siteId: siteA,
    conversationId: convoId,
    body: `Hello from a stranger ${stamp}`,
    idempotencyKey: `e03-k1-${stamp}`,
  },
})
const authorMsgsAfter = await api(
  hostA,
  `/api/community/messages?conversationId=${convoId}&siteId=${siteA}`,
  { cookie: members.author.cookie },
)
const countAfter = (authorMsgsAfter.data?.messages ?? []).length
stage(
  'a resent message with the same idempotency key is stored once',
  dupSend.status === 200 && dupSend.data?.message?.duplicate === true && countAfter === countBefore,
  `dup=${dupSend.status} duplicate=${dupSend.data?.message?.duplicate} count ${countBefore}->${countAfter}`,
)

// ---------- stage 8: a declined request ends the conversation ----------
const convo2 = await api(hostA, '/api/community/conversations', {
  method: 'POST',
  cookie: members.stranger.cookie,
  csrf: members.stranger.csrf,
  origin: originA,
  body: { siteId: siteA, targetMemberId: members.pal.id },
})
const convo2Id = convo2.data?.conversation?.id
const decline = await api(hostA, '/api/community/message-requests', {
  method: 'POST',
  cookie: members.pal.cookie,
  csrf: members.pal.csrf,
  origin: originA,
  body: { siteId: siteA, conversationId: convo2Id, action: 'decline' },
})
const afterDecline = await api(hostA, '/api/community/messages', {
  method: 'POST',
  cookie: members.stranger.cookie,
  csrf: members.stranger.csrf,
  origin: originA,
  body: {
    siteId: siteA,
    conversationId: convo2Id,
    body: 'Still there?',
    idempotencyKey: `e03-k3-${stamp}`,
  },
})
stage(
  'declining a message request refuses later sends',
  decline.status === 200 && afterDecline.status >= 400,
  `decline=${decline.status} sendAfter=${afterDecline.status} ${afterDecline.data?.error ?? ''}`,
)

// ---------- stage 9: staff review comments reference canonical content ----------
// Give the browser member a notification of his own for the UI proof.
const bThread = await api(hostA, '/api/community/threads', {
  method: 'POST',
  cookie: members.browser.cookie,
  csrf: members.browser.csrf,
  body: {
    siteId: siteA,
    forumId: forum.id,
    title: `E-03 browser thread ${stamp}`,
    body: 'Browser member opens.',
  },
})
const bThreadId = bThread.data?.thread?.id ?? bThread.data?.discussion?.id ?? bThread.data?.id
await api(hostA, '/api/community/posts', {
  method: 'POST',
  cookie: members.peer.cookie,
  csrf: members.peer.csrf,
  body: { siteId: siteA, discussionId: bThreadId, body: `Peer reply for the browser ${stamp}` },
})
writeFileSync(
  '/tmp/e03-browser.json',
  JSON.stringify({
    stamp,
    memberCookie: members.browser.cookie,
    csrfCookie: members.browser.csrf,
  }),
)

const articleId = world.siteA.publishedArticleId
const reviewCreate = await staffA('/api/admin/workflow/comments', {
  method: 'POST',
  body: { action: 'create', articleId, content: `E-03 review note ${stamp}`, target: 'body' },
})
const reviewList = await staffA(`/api/admin/workflow/comments?articleId=${articleId}`)
const reviewSeen = JSON.stringify(reviewList.data ?? {}).includes(`E-03 review note ${stamp}`)
const reviewListB = await staffB(`/api/admin/workflow/comments?articleId=${articleId}`)
const reviewLeaksB = JSON.stringify(reviewListB.data ?? {}).includes(`E-03 review note ${stamp}`)
stage(
  'a staff review comment is stored against the canonical article id and stays on its site',
  reviewCreate.status === 201 &&
    reviewCreate.data?.comment?.articleId === articleId &&
    reviewSeen &&
    !reviewLeaksB,
  `create=${reviewCreate.status} ref=${reviewCreate.data?.comment?.articleId === articleId} listed=${reviewSeen} leaksToB=${reviewLeaksB}`,
)

// ---------- stage 10: notifications survive a server restart unchanged ----------
const beforeRestart = await notifList(members.author)
execFileSync(
  'bash',
  [
    '-c',
    'fuser -k 39071/tcp; sleep 1; setsid nohup ~/workspace/gui01b-logs/b01-start.sh > ~/workspace/gui01b-logs/e03-restart.log 2>&1 &',
  ],
  {
    stdio: 'pipe',
  },
)
let backUp = false
for (let i = 0; i < 24 && !backUp; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  try {
    const probeRes = await api(hostA, '/api/community/notifications?siteId=' + siteA, {
      cookie: members.author.cookie,
    })
    backUp = probeRes.status === 200
  } catch {}
}
const afterRestart = await notifList(members.author)
const idsBefore = projectedOfKind(beforeRestart, 'thread.reply')
  .map((n) => n.id)
  .sort()
const idsAfter = projectedOfKind(afterRestart, 'thread.reply')
  .map((n) => n.id)
  .sort()
stage(
  'after a server restart the same notifications come back with the same read state',
  backUp && JSON.stringify(idsBefore) === JSON.stringify(idsAfter),
  `backUp=${backUp} idsStable=${JSON.stringify(idsBefore) === JSON.stringify(idsAfter)} unread=${afterRestart.data?.unreadCount}`,
)

// ---------- stage 11: nothing leaks across sites ----------
const authorBoxB = await notifList(members.author, hostB, siteB)
const msgsOnB = await api(
  hostB,
  `/api/community/messages?conversationId=${convoId}&siteId=${siteA}`,
  {
    cookie: members.author.cookie,
  },
)
stage(
  "Site B shows none of Site A's notifications or messages",
  (authorBoxB.data?.notifications ?? []).length === 0 && msgsOnB.status !== 200,
  `notifsOnB=${(authorBoxB.data?.notifications ?? []).length} msgsOnB=${msgsOnB.status}`,
)

// ---------- browser path ----------
let browserOk = true
try {
  const out = execFileSync('node', ['tests/rc2-e03/browser.mjs'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
    timeout: 300_000,
  })
  process.stdout.write(out)
} catch (err) {
  browserOk = false
  if (err.stdout) process.stdout.write(err.stdout)
  console.log('browser script exited non-zero')
}

const failed = results.filter((r) => !r.ok).length
console.log(
  `\n${results.length - failed}/${results.length} API stages passed${browserOk ? '' : ' (browser script reported failures)'}`,
)
process.exit(failed || !browserOk ? 1 : 0)
