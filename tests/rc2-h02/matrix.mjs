// RC2-H-02 — interactive role x two-site boundary matrix.
//
// HTTP-level proof against the live server on the H-02 world
// (tests/rc2-h02/setup.spec.ts). Two cell kinds:
//   boundary — the decided rule must hold; a breach is a finding
//              (cross-site write/leak = P0-class, repaired first).
//   measure  — member-standing cells measured against decided model C
//              (one identity, per-site standing); today's behavior is
//              recorded as-is, never dressed as a pass.
// Writes its results JSON beside the run logs.
import http from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'

const world = JSON.parse(readFileSync('/home/hatch/workspace/gui01b-logs/h02-world.json', 'utf8'))
const PORT = 39071
const stamp = Date.now().toString(36)
const A = world.siteA
const B = world.siteB

function raw({ host, method = 'GET', path, cookie, headers = {}, body }) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body)
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: {
          Host: host,
          ...(data
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }
            : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(text)
          } catch {
            /* not json */
          }
          resolve({ status: res.statusCode, json, text: text.slice(0, 300), headers: res.headers })
        })
      },
    )
    req.on('error', (e) => resolve({ status: 0, json: null, text: String(e), headers: {} }))
    if (data) req.write(data)
    req.end()
  })
}

const staffCookie = (jwt) => `renegade-passkey=${jwt}`
const memberActor = (m, csrf) => ({
  cookie: `${m.cookie}; renegade-member-csrf=${csrf}`,
  headers: { 'x-member-csrf': csrf },
})
// APP_URL in the served env is http://127.0.0.1:39071 — the proxy gate
// compares the Origin string exactly, so staff mutations must send
// that origin verbatim (localhost does NOT match 127.0.0.1).
const APP_ORIGIN = `http://127.0.0.1:${PORT}`
const adminA = { cookie: staffCookie(world.staff.adminA), headers: { origin: APP_ORIGIN } }
const editorA = { cookie: staffCookie(world.staff.editorA), headers: { origin: APP_ORIGIN } }
const ownerA = { cookie: staffCookie(world.staff.ownerA), headers: { origin: APP_ORIGIN } }
const outsiderB = { cookie: staffCookie(world.staff.outsiderB), headers: { origin: APP_ORIGIN } }
const memberA = memberActor(world.members.memberA, `ca-${stamp}`)
const memberB = memberActor(world.members.memberB, `cb-${stamp}`)
const subscriberA = memberActor(world.members.subscriberA, `cs-${stamp}`)
const fresh = memberActor(world.members.fresh, `cf-${stamp}`)
const modA = memberActor(world.members.modA, `cm-${stamp}`)
const originA = { origin: A.origin }
const originB = { origin: B.origin }

const results = []
function record(id, kind, name, verdict, detail) {
  results.push({ id, kind, name, verdict, detail })
  console.log(
    `${verdict === 'hold' || verdict === 'as-expected' ? 'PASS' : verdict === 'measured' ? 'MEAS' : 'FAIL'} [${id}] ${name} — ${detail}`,
  )
}
const refused = (s) => [400, 401, 403, 404, 422].includes(s)

// ---------- A. staff content matrix (Payload REST) ----------
const listA = await raw({
  host: 'localhost',
  path: `/api/content?where[site][equals]=${A.siteId}&limit=25`,
  cookie: adminA.cookie,
})
const listAAllA = (listA.json?.docs ?? []).every(
  (d) => d.site === A.siteId || d.site?.id === A.siteId,
)
record(
  'A1',
  'boundary',
  'adminA lists site A content',
  listA.status === 200 && listAAllA ? 'hold' : 'breach',
  `status=${listA.status} docs=${listA.json?.totalDocs}`,
)

const listBByA = await raw({
  host: 'localhost',
  path: `/api/content?where[site][equals]=${B.siteId}&limit=25`,
  cookie: adminA.cookie,
})
record(
  'A2',
  'boundary',
  'adminA listing site B content sees none of it',
  listBByA.status !== 200 || (listBByA.json?.totalDocs ?? 0) === 0 ? 'hold' : 'breach',
  `status=${listBByA.status} docs=${listBByA.json?.totalDocs}`,
)

const readDraftOut = await raw({
  host: 'localhost',
  path: `/api/content/${A.draftArticleId}`,
  cookie: outsiderB.cookie,
})
record(
  'A3',
  'boundary',
  'outsiderB cannot read site A draft',
  refused(readDraftOut.status) ? 'hold' : 'breach',
  `status=${readDraftOut.status}`,
)
const readDraftEd = await raw({
  host: 'localhost',
  path: `/api/content/${A.draftArticleId}`,
  cookie: editorA.cookie,
})
record(
  'A4',
  'boundary',
  'editorA reads site A draft',
  readDraftEd.status === 200 ? 'hold' : 'breach',
  `status=${readDraftEd.status}`,
)

async function createContent(actor, siteId, label) {
  const body = {
    title: `H02 ${label} ${stamp}`,
    site: siteId,
    status: 'draft',
    contentType: 'article',
  }
  let r = await raw({
    host: 'localhost',
    method: 'POST',
    path: '/api/content',
    cookie: actor.cookie,
    headers: actor.headers,
    body,
  })
  if (r.status === 400 && /publication/i.test(r.text)) {
    r = await raw({
      host: 'localhost',
      method: 'POST',
      path: '/api/content',
      cookie: actor.cookie,
      headers: actor.headers,
      body: { ...body, publication: A.blogPublicationId },
    })
  }
  return r
}
const createdByEditor = await createContent(editorA, A.siteId, 'editor-create')
const editorDocId = createdByEditor.json?.doc?.id
record(
  'A5',
  'boundary',
  'editorA creates content on site A',
  createdByEditor.status === 201 ? 'hold' : 'breach',
  `status=${createdByEditor.status}`,
)
const createdCross = await createContent(adminA, B.siteId, 'cross-site-create')
record(
  'A6',
  'boundary',
  'adminA cannot create content on site B',
  createdCross.status !== 201 ? 'hold' : 'breach',
  `status=${createdCross.status} docSite=${createdCross.json?.doc?.site ?? createdCross.json?.doc?.site?.id}`,
)

const updOut = await raw({
  host: 'localhost',
  method: 'PATCH',
  path: `/api/content/${A.draftArticleId}`,
  cookie: outsiderB.cookie,
  headers: outsiderB.headers,
  body: { title: 'defaced' },
})
record(
  'A7',
  'boundary',
  'outsiderB cannot edit site A draft',
  refused(updOut.status) ? 'hold' : 'breach',
  `status=${updOut.status}`,
)
if (editorDocId) {
  const delOut = await raw({
    host: 'localhost',
    method: 'DELETE',
    path: `/api/content/${editorDocId}`,
    cookie: outsiderB.cookie,
    headers: outsiderB.headers,
  })
  record(
    'A8',
    'boundary',
    'outsiderB cannot delete site A content',
    refused(delOut.status) ? 'hold' : 'breach',
    `status=${delOut.status}`,
  )
  const delAdmin = await raw({
    host: 'localhost',
    method: 'DELETE',
    path: `/api/content/${editorDocId}`,
    cookie: adminA.cookie,
    headers: adminA.headers,
  })
  record(
    'A9',
    'boundary',
    'adminA deletes site A content',
    [200, 204].includes(delAdmin.status) ? 'hold' : 'breach',
    `status=${delAdmin.status}`,
  )
}

// workflow: submit + self-approve refusal + admin approve (B-01 path)
if (editorDocId) {
  // recreate a doc for the workflow cells since A9 deleted the first
}
const wfDoc = await createContent(editorA, A.siteId, 'workflow')
const wfId = wfDoc.json?.doc?.id
if (wfId) {
  const submit = await raw({
    host: 'localhost',
    method: 'POST',
    path: '/api/admin/workflow/actions',
    cookie: editorA.cookie,
    headers: editorA.headers,
    body: { articleId: wfId, action: 'submit' },
  })
  record(
    'A10',
    'boundary',
    'editorA submits own draft for review',
    submit.status === 200 ? 'hold' : 'breach',
    `status=${submit.status} ${submit.text.slice(0, 80)}`,
  )
  const selfApprove = await raw({
    host: 'localhost',
    method: 'POST',
    path: '/api/admin/workflow/actions',
    cookie: editorA.cookie,
    headers: editorA.headers,
    body: { articleId: wfId, action: 'approve' },
  })
  record(
    'A11',
    'boundary',
    'editorA cannot approve own submission',
    refused(selfApprove.status) ? 'hold' : 'breach',
    `status=${selfApprove.status}`,
  )
  const adminApprove = await raw({
    host: 'localhost',
    method: 'POST',
    path: '/api/admin/workflow/actions',
    cookie: adminA.cookie,
    headers: adminA.headers,
    body: { articleId: wfId, action: 'approve' },
  })
  record(
    'A12',
    'boundary',
    'adminA approves the submission',
    adminApprove.status === 200 ? 'hold' : 'breach',
    `status=${adminApprove.status} ${adminApprove.text.slice(0, 80)}`,
  )
}

// ---------- B. settings (RC2-DEBT-16 expected failure) ----------
const settingsAdmin = await raw({
  host: 'localhost',
  method: 'POST',
  path: '/api/globals/site-settings',
  cookie: adminA.cookie,
  headers: adminA.headers,
  body: { siteName: 'H02 probe' },
})
record(
  'B1',
  'measure',
  'site-settings save as site admin (DEBT-16: known P1)',
  settingsAdmin.status === 403 ? 'as-expected' : 'measured',
  `status=${settingsAdmin.status} (403 = the filed DEBT-16 state)`,
)
const settingsOwner = await raw({
  host: 'localhost',
  method: 'POST',
  path: '/api/globals/site-settings',
  cookie: ownerA.cookie,
  headers: ownerA.headers,
  body: { siteName: 'H02 probe' },
})
record(
  'B2',
  'measure',
  'site-settings save as global owner (DEBT-16)',
  settingsOwner.status === 403 ? 'as-expected' : 'measured',
  `status=${settingsOwner.status}`,
)

// ---------- C. media ----------
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082',
  'hex',
)
function upload(actor) {
  return new Promise((resolve) => {
    const boundary = `----h02${stamp}`
    const fields =
      `--${boundary}\r\ncontent-disposition: form-data; name="siteId"\r\n\r\n${A.siteId}\r\n` +
      `--${boundary}\r\ncontent-disposition: form-data; name="title"\r\n\r\nH02 upload ${stamp}\r\n` +
      `--${boundary}\r\ncontent-disposition: form-data; name="altText"\r\n\r\nH02 matrix test image\r\n`
    const head = `${fields}--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="h02-${stamp}.png"\r\ncontent-type: image/png\r\n\r\n`
    const tail = `\r\n--${boundary}--\r\n`
    const payloadBuf = Buffer.concat([Buffer.from(head), png, Buffer.from(tail)])
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: '/api/media/upload',
        method: 'POST',
        headers: {
          Host: 'localhost',
          cookie: actor.cookie,
          origin: APP_ORIGIN,
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'content-length': payloadBuf.length,
        },
      },
      (res) => {
        let t = ''
        res.on('data', (c) => (t += c))
        res.on('end', () => resolve({ status: res.statusCode, text: t.slice(0, 160) }))
      },
    )
    req.on('error', (e) => resolve({ status: 0, text: String(e) }))
    req.write(payloadBuf)
    req.end()
  })
}
const upEditor = await upload(editorA)
record(
  'C1',
  'boundary',
  'editorA uploads media',
  [200, 201].includes(upEditor.status) ? 'hold' : 'breach',
  `status=${upEditor.status}`,
)
const upOut = await upload(outsiderB)
record(
  'C2',
  'boundary',
  'outsiderB upload refused',
  refused(upOut.status) ? 'hold' : 'breach',
  `status=${upOut.status}`,
)

// ---------- D. active-site switching + cookie tampering ----------
const switchB = await raw({
  host: 'localhost',
  method: 'POST',
  path: '/api/admin/active-site',
  cookie: adminA.cookie,
  headers: adminA.headers,
  body: { siteId: B.siteId },
})
const activeAfter = await raw({
  host: 'localhost',
  path: '/api/admin/active-site',
  cookie: adminA.cookie,
})
const stillA =
  (activeAfter.json?.activeSiteId ?? null) === null || activeAfter.json?.activeSiteId === A.siteId
record(
  'D1',
  'boundary',
  'adminA switch to site B refused and stays visibly on A',
  refused(switchB.status) && stillA ? 'hold' : 'breach',
  `switch=${switchB.status} activeAfter=${activeAfter.json?.activeSiteId ?? 'default(A)'}`,
)
const forged = await raw({
  host: 'localhost',
  path: `/api/content?where[site][equals]=${B.siteId}&limit=25`,
  cookie: `${adminA.cookie}; renegade-active-site=${B.siteId}`,
})
record(
  'D2',
  'boundary',
  'forged active-site cookie does not unlock site B content',
  forged.status !== 200 || (forged.json?.totalDocs ?? 0) === 0 ? 'hold' : 'breach',
  `status=${forged.status} docs=${forged.json?.totalDocs}`,
)
const switchA = await raw({
  host: 'localhost',
  method: 'POST',
  path: '/api/admin/active-site',
  cookie: adminA.cookie,
  headers: adminA.headers,
  body: { siteId: A.siteId },
})
record(
  'D3',
  'boundary',
  'adminA switch to own site A succeeds',
  switchA.status === 200 ? 'hold' : 'breach',
  `status=${switchA.status}`,
)

// ---------- E. audience campaign cross-site ----------
const campCross = await raw({
  host: 'localhost',
  method: 'POST',
  path: `/api/admin/audience/campaign?siteId=${B.siteId}`,
  cookie: adminA.cookie,
  headers: adminA.headers,
  body: { action: 'save-and-schedule', subject: `H02 cross ${stamp}` },
})
record(
  'E1',
  'boundary',
  'adminA cannot create a campaign on site B',
  refused(campCross.status) ? 'hold' : 'breach',
  `status=${campCross.status}`,
)
const campOwn = await raw({
  host: 'localhost',
  method: 'POST',
  path: `/api/admin/audience/campaign?siteId=${A.siteId}`,
  cookie: adminA.cookie,
  headers: adminA.headers,
  body: { action: 'save-and-schedule', subject: `H02 own ${stamp}` },
})
record(
  'E2',
  'boundary',
  'adminA campaign call on own site is not a boundary refusal',
  campOwn.status !== 403 ? 'hold' : 'breach',
  `status=${campOwn.status} (validation errors are fine; 403 would be the anomaly)`,
)

// ---------- G. community + standing (model C) ----------
const comment = (actor, origin, siteId, articleId, label) =>
  raw({
    host: origin === originA ? A.host : B.host,
    method: 'POST',
    path: '/api/community/comments',
    cookie: actor.cookie,
    headers: { ...actor.headers, ...origin },
    body: {
      siteId,
      attachedToId: articleId,
      attachedToCollection: 'content',
      body: `H02 ${label} ${stamp}`,
    },
  })
const cA = await comment(memberA, originA, A.siteId, A.publishedArticleId, 'memberA-on-A')
record(
  'G1',
  'boundary',
  'memberA (standing on A) comments on A',
  cA.status === 201 ? 'hold' : 'breach',
  `status=${cA.status}`,
)
const cB = await comment(memberA, originB, B.siteId, B.publishedArticleId, 'memberA-on-B')
record(
  'G2',
  'measure',
  'memberA (never joined B) comments on B — model C target: refused',
  cB.status === 201 ? 'measured' : 'as-expected',
  `status=${cB.status} (201 = pre-C behavior measured; refusal = C enforced)`,
)
const cF = await comment(fresh, originA, A.siteId, A.publishedArticleId, 'fresh-on-A')
record(
  'G3',
  'measure',
  'fresh member (no standing anywhere) comments on A — model C target: refused until join',
  cF.status === 201 ? 'measured' : 'as-expected',
  `status=${cF.status}`,
)
const post = (actor, origin, siteId, discussionId, label) =>
  raw({
    host: origin === originA ? A.host : B.host,
    method: 'POST',
    path: '/api/community/posts',
    cookie: actor.cookie,
    headers: { ...actor.headers, ...origin },
    body: { siteId, discussionId, body: `H02 ${label} ${stamp}` },
  })
if (A.discussionId) {
  const pA = await post(memberA, originA, A.siteId, A.discussionId, 'forum-memberA-on-A')
  record(
    'G4',
    'boundary',
    'memberA posts in site A forum',
    pA.status === 201 ? 'hold' : 'breach',
    `status=${pA.status}`,
  )
}
if (B.discussionId) {
  const pB = await post(memberA, originB, B.siteId, B.discussionId, 'forum-memberA-on-B')
  record(
    'G5',
    'measure',
    'memberA posts in site B forum (never joined) — model C target: refused',
    pB.status === 201 ? 'measured' : 'as-expected',
    `status=${pB.status}`,
  )
}

// reports: standing rows decide resolvability (DEBT-19)
const freshProfileId = world.members.fresh.profileId
const report = (actor, origin, siteId, profileId) =>
  raw({
    host: origin === originA ? A.host : B.host,
    method: 'POST',
    path: '/api/community/reports',
    cookie: actor.cookie,
    headers: { ...actor.headers, ...origin },
    body: {
      targetType: 'member_profile',
      targetId: profileId,
      siteId,
      reason: `H02 report ${stamp}`,
    },
  })
const repA = await report(subscriberA, originA, A.siteId, world.principals.memberAProfileId)
record(
  'G6',
  'boundary',
  'report memberA profile on A (standing row exists) opens a case',
  repA.status === 201 ? 'hold' : 'breach',
  `status=${repA.status}`,
)
const repFresh = freshProfileId
  ? await report(subscriberA, originA, A.siteId, freshProfileId)
  : { status: 0 }
record(
  'G7',
  'measure',
  'report fresh member profile on A (DEBT-19: no standing row)',
  repFresh.status === 404 ? 'as-expected' : 'measured',
  `status=${repFresh.status} (404 = the filed DEBT-19 state; 201 = provisioning fix has landed)`,
)
const repB = await report(memberB, originB, B.siteId, world.principals.memberAProfileId)
record(
  'G8',
  'boundary',
  'report memberA profile on B (never joined) is refused there',
  refused(repB.status) ? 'hold' : 'breach',
  `status=${repB.status} (refusal is CORRECT under model C)`,
)

// moderation scope: suspend memberA on A; A posting stops, B posting is a measure
const queue = await raw({
  host: A.host,
  path: `/api/community/moderation?siteId=${A.siteId}`,
  cookie: modA.cookie,
  headers: { ...modA.headers, ...originA },
})
const cases = queue.json?.cases ?? queue.json?.docs ?? queue.json?.items ?? []
const profileCase = Array.isArray(cases)
  ? cases.find((c) => JSON.stringify(c).includes(world.principals.memberAProfileId))
  : null
let caseId = profileCase?.id ?? repA.json?.case?.id ?? repA.json?.caseId ?? null
record(
  'G9',
  'boundary',
  'moderation queue on A readable by site A moderator',
  queue.status === 200 && caseId ? 'hold' : 'breach',
  `status=${queue.status} case=${caseId ? 'found' : 'NOT FOUND'}`,
)
if (caseId) {
  const suspend = await raw({
    host: A.host,
    method: 'POST',
    path: '/api/community/moderation',
    cookie: modA.cookie,
    headers: { ...modA.headers, ...originA },
    body: {
      caseId,
      action: 'suspend_posting',
      targetType: 'member_profile',
      targetId: world.principals.memberAProfileId,
      reason: 'H02 suspension scope test',
      scope: 'site_global',
    },
  })
  record(
    'G10',
    'boundary',
    'moderator suspends memberA on A',
    suspend.status === 200 ? 'hold' : 'breach',
    `status=${suspend.status} ${suspend.text.slice(0, 90)}`,
  )
  const cAfter = await comment(
    memberA,
    originA,
    A.siteId,
    A.publishedArticleId,
    'memberA-on-A-suspended',
  )
  record(
    'G11',
    'boundary',
    'suspended memberA cannot comment on A',
    refused(cAfter.status) ? 'hold' : 'breach',
    `status=${cAfter.status}`,
  )
  if (A.discussionId) {
    const pAfter = await post(
      memberA,
      originA,
      A.siteId,
      A.discussionId,
      'forum-memberA-on-A-suspended',
    )
    record(
      'G11b',
      'boundary',
      'suspended memberA cannot post in site A forum',
      refused(pAfter.status) ? 'hold' : 'breach',
      `status=${pAfter.status}`,
    )
  }
  const cBCross = await comment(
    memberA,
    originB,
    B.siteId,
    B.publishedArticleId,
    'memberA-on-B-after-A-suspension',
  )
  record(
    'G12',
    'measure',
    'A-suspension does not reach B (model C: standing is per-site)',
    cBCross.status === 201 ? 'as-expected' : 'measured',
    `status=${cBCross.status} (201 = per-site scope holds)`,
  )
  const memberMod = await raw({
    host: A.host,
    method: 'POST',
    path: '/api/community/moderation',
    cookie: memberB.cookie,
    headers: { ...memberB.headers, ...originA },
    body: {
      caseId,
      action: 'suspend_posting',
      targetType: 'member_profile',
      targetId: world.principals.memberAProfileId,
      reason: 'plain member attempt',
    },
  })
  record(
    'G13',
    'boundary',
    'a plain member cannot moderate',
    refused(memberMod.status) ? 'hold' : 'breach',
    `status=${memberMod.status}`,
  )
  const reinstate = await raw({
    host: A.host,
    method: 'POST',
    path: '/api/community/moderation',
    cookie: modA.cookie,
    headers: { ...modA.headers, ...originA },
    body: {
      caseId,
      action: 'reinstate',
      targetType: 'member_profile',
      targetId: world.principals.memberAProfileId,
      reason: 'H02 reinstate',
      scope: 'site_global',
    },
  })
  const cBack = await comment(
    memberA,
    originA,
    A.siteId,
    A.publishedArticleId,
    'memberA-on-A-reinstated',
  )
  record(
    'G14',
    'boundary',
    'reinstatement restores memberA commenting on A',
    reinstate.status === 200 && cBack.status === 201 ? 'hold' : 'breach',
    `reinstate=${reinstate.status} comment=${cBack.status}`,
  )
}

// ---------- H. anonymous + public search ----------
const anonDraft = await raw({ host: 'localhost', path: `/api/content/${A.draftArticleId}` })
record(
  'H1',
  'boundary',
  'anonymous cannot read a draft over REST',
  refused(anonDraft.status) ? 'hold' : 'breach',
  `status=${anonDraft.status}`,
)
const anonList = await raw({ host: 'localhost', path: '/api/content?limit=25' })
const anonStatuses = (anonList.json?.docs ?? []).map((d) => d.status)
record(
  'H2',
  'boundary',
  'anonymous content list contains no drafts',
  anonStatuses.every((s) => s === 'published') ? 'hold' : 'breach',
  `status=${anonList.status} statuses=${[...new Set(anonStatuses)].join(',')}`,
)
const searchB = await raw({
  host: A.host,
  path: `/search?q=${encodeURIComponent('Site B Published')}`,
})
record(
  'H3',
  'boundary',
  'site A public search does not surface site B content',
  searchB.status === 200 && !searchB.text.includes('Site B Published') ? 'hold' : 'breach',
  `status=${searchB.status} leak=${searchB.text.includes('Site B Published')}`,
)

const holds = results.filter((r) => r.verdict === 'hold').length
const breaches = results.filter((r) => r.verdict === 'breach')
const measured = results.filter((r) => r.kind === 'measure')
console.log(
  `\nH-02 MATRIX: ${holds} boundary holds, ${breaches.length} breaches, ${measured.length} standing/settings measures`,
)
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/h02-matrix-results.json',
  JSON.stringify(results, null, 2),
)
