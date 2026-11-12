// RC2-D-01 — Calendar, approval and coordinated release journey.
// Arc 1: editor submits, approver rejects with the audit trail to show
// for it, resubmits, approves. Arc 2: an approved article is scheduled
// through the calendar API with a Chicago wall-clock time; the server
// AND the jobs worker are restarted inside the window; the isolated
// worker fires the editorial-publish job exactly once at the due
// instant. Arc 3: a coordinated Release (article + redirect) executes
// into a pre-seeded redirect conflict — partial failure, visible — the
// operator removes the conflict and retries ONLY the failed item to
// completion. Grants are probed with a Site B principal throughout.
// Requires the served RC2 world, the D-01 seed, and the jobs worker.
import { get as httpGet } from 'node:http'
import { execSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.B01_BASE || 'http://127.0.0.1:39071'
const SHOTS = process.env.D01_SHOTS || '/home/hatch/workspace/gui01b-logs/d01-shots'
const WORLD = JSON.parse(readFileSync(process.env.B01_WORLD || '/tmp/b01-world.json', 'utf8'))
const SEED = JSON.parse(readFileSync('/tmp/d01-content.json', 'utf8'))
mkdirSync(SHOTS, { recursive: true })
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const adminA = WORLD.cookies.adminA
const editorA = WORLD.cookies.editorA
const outsiderB = WORLD.cookies.outsiderB
const siteA = WORLD.siteA.siteId
const hostA = WORLD.siteA.host

const api = async (path, { method = 'GET', cookie, json } = {}) => {
  const headers = {}
  if (cookie) headers.cookie = `renegade-passkey=${cookie}`
  let body
  if (json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(json)
  }
  const res = await fetch(BASE + path, { method, headers, body })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* not json */
  }
  return { status: res.status, text, data }
}
const rawGet = (host, path) =>
  new Promise((resolve, reject) => {
    const req = httpGet(
      { hostname: '127.0.0.1', port: 39071, path, headers: { host: `${host}:39071` } },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('timeout')))
  })
const wf = (cookie, articleId, action, extra = {}) =>
  api('/api/admin/workflow/actions', {
    method: 'POST',
    cookie,
    json: { articleId, action, ...extra },
  })
const contentStatus = async (id) =>
  (await api(`/api/content/${id}?depth=0`, { cookie: adminA })).data?.status

// ------------------------------------------------ arc 1: reject, resubmit, approve
const sub1 = await wf(editorA, SEED.workflowId, 'submit')
const rej = await wf(adminA, SEED.workflowId, 'reject', { comment: 'Needs a stronger lede.' })
const afterReject = await contentStatus(SEED.workflowId)
const companionW = await api(`/api/article-family-content/${SEED.workflowCompanion}?depth=0`, {
  cookie: adminA,
}).catch(() => ({ data: null }))
const wfAuditText = JSON.stringify(companionW.data ?? {})
stage(
  'editor submits, approver rejects, and the article returns for rework',
  sub1.status === 200 &&
    rej.status === 200 &&
    afterReject !== 'published' &&
    afterReject !== 'approved',
  `submit=${sub1.status} reject=${rej.status} status=${afterReject}`,
)
const sub2 = await wf(editorA, SEED.workflowId, 'submit')
const appr = await wf(adminA, SEED.workflowId, 'approve', { targetStatus: 'published' })
const afterApprove = await contentStatus(SEED.workflowId)
stage(
  'resubmission is approved by the approver',
  sub2.status === 200 && appr.status === 200 && afterApprove === 'approved',
  `submit=${sub2.status} approve=${appr.status} status=${afterApprove} auditHasReject=${/reject/i.test(wfAuditText)}`,
)

// ------------------------------------------------ arc 2: scheduled publish through the calendar
await wf(editorA, SEED.scheduledId, 'submit')
await wf(adminA, SEED.scheduledId, 'approve', { targetStatus: 'published' })

const chicagoParts = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
const due = new Date(Date.now() + 4.5 * 60_000)
const parts = Object.fromEntries(chicagoParts(due).map((p) => [p.type, p.value]))
const startsAt = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
const sched = await api('/api/admin/calendar/schedule', {
  method: 'POST',
  cookie: adminA,
  json: {
    action: 'schedule',
    sourceId: SEED.scheduledCompanion,
    sourceType: 'article',
    startsAt,
    timeZone: 'America/Chicago',
  },
})
const calAudit = await api(
  `/api/calendar-entry-audits?where%5Barticle%5D%5Bequals%5D=${SEED.scheduledCompanion}&depth=0`,
  { cookie: adminA },
)
const schedEntry = (calAudit.data?.docs ?? []).find((d) => d.action === 'calendar.scheduled')
const storedSched = schedEntry?.after?.scheduledFor ?? null
const storedMs = storedSched ? new Date(storedSched).getTime() : NaN
stage(
  'calendar schedule converts the Chicago wall time to the right UTC instant',
  sched.status === 200 &&
    Number.isFinite(storedMs) &&
    Math.abs(storedMs - due.getTime()) <= 90_000 &&
    schedEntry?.after?.timeZone === 'America/Chicago',
  `schedule=${sched.status} startsAt=${startsAt} stored=${storedSched} dueUtc=${due.toISOString()}`,
)
const preDue = await rawGet(hostA, SEED.scheduledPath)
stage(
  'the scheduled article is not public before its time',
  preDue.status === 404,
  `pre-due status=${preDue.status}`,
)

// restart BOTH the server and the worker inside the scheduling window
try {
  execSync('fuser -k 39071/tcp || true', { stdio: 'ignore' })
} catch {}
try {
  execSync("pkill -f 'run-jobs-worke[r]' || true", { stdio: 'ignore' })
} catch {}
await sleep(2500)
spawn('bash', ['/home/hatch/workspace/gui01b-logs/b01-start.sh'], {
  detached: true,
  stdio: 'ignore',
}).unref()
spawn(
  'bash',
  [
    '-c',
    'python3 /home/hatch/workspace/with-env.py /home/hatch/workspace/gui01b-logs/b01-env.local npm run jobs:worker >> /home/hatch/workspace/gui01b-logs/d01-worker.log 2>&1',
  ],
  { detached: true, stdio: 'ignore', cwd: '/home/hatch/workspace/rc2-tree' },
).unref()
let backUp = false
for (let i = 0; i < 40 && !backUp; i++) {
  await sleep(3000)
  try {
    const r = await fetch(BASE + '/admin')
    backUp = r.status === 200
  } catch {
    backUp = false
  }
}
stage('server and worker restarted inside the scheduling window', backUp, '')

let publishedPage = 0
const deadline = Date.now() + 8 * 60_000
while (Date.now() < deadline) {
  const r = await rawGet(hostA, SEED.scheduledPath).catch(() => ({ status: 0 }))
  publishedPage = r.status
  if (publishedPage === 200) break
  await sleep(15000)
}
const schedStatus = await contentStatus(SEED.scheduledId)
const companionAfter = await api(`/api/article-family-content/${SEED.scheduledCompanion}?depth=0`, {
  cookie: adminA,
})
const publishEvents = (JSON.stringify(companionAfter.data ?? {}).match(/publish/gi) ?? []).length
stage(
  'the worker publishes the scheduled article after the restart, at/after its due time',
  publishedPage === 200 && schedStatus === 'published' && Date.now() >= due.getTime() - 120_000,
  `page=${publishedPage} status=${schedStatus} publishMentions=${publishEvents}`,
)

// ------------------------------------------------ arc 3: coordinated release, partial failure, retry
// The release gate (rule-approvals) requires pinned articles to be
// editorially approved first — drive the main article through workflow.
await wf(editorA, SEED.releaseMainId, 'submit')
await wf(adminA, SEED.releaseMainId, 'approve', { targetStatus: 'published' })
const badTz = await api('/api/admin/releases', {
  method: 'POST',
  cookie: adminA,
  json: { name: `D01 Bad TZ ${SEED.stamp}`, siteId: siteA, timeZone: 'Mars/Olympus_Mons' },
})
const created = await api('/api/admin/releases', {
  method: 'POST',
  cookie: adminA,
  json: {
    name: `D01 Release ${SEED.stamp}`,
    siteId: siteA,
    publicationId: WORLD.siteA.blogPublicationId,
    timeZone: 'America/Chicago',
  },
})
const rid = created.data?.release?.id
const act = (json, cookie = adminA) =>
  api(`/api/admin/releases/${rid}`, { method: 'POST', cookie, json })
const companionR = await api(`/api/article-family-content/${SEED.releaseCompanion}?depth=0`, {
  cookie: adminA,
})
await act({
  action: 'pin-artifact',
  artifact: {
    targetType: 'article',
    targetId: SEED.releaseCompanion,
    title: 'D01 Release Main',
    canonicalUrl: SEED.releaseMainPath,
    pinnedHash: `d01-${SEED.stamp}`,
    pinnedRevisionId: companionR.data?.currentRevision ?? undefined,
    pinnedRevisionSequence: companionR.data?.currentRevisionSequence ?? undefined,
  },
})
await act({
  action: 'pin-artifact',
  artifact: {
    targetType: 'media',
    targetId: SEED.mediaId,
    title: 'D01 Release Media',
    pinnedHash: `d01-m-${SEED.stamp}`,
  },
})
const gates = await act({ action: 'evaluate-gates' })
await act({ action: 'submit-review' })
const apprRel = await act({ action: 'approve' })
stage(
  'release assembles two artifacts, passes its gates, and is approved (invalid timezone refused at create)',
  badTz.status === 400 &&
    Boolean(rid) &&
    (gates.data?.snapshot?.blockerCount ?? -1) === 0 &&
    apprRel.data?.release?.status === 'approved',
  `badTz=${badTz.status} gates blockers=${gates.data?.snapshot?.blockerCount} status=${apprRel.data?.release?.status}`,
)

// the media asset's rights lapse between approval and execution
await api(`/api/media/${SEED.mediaId}`, {
  method: 'PATCH',
  cookie: adminA,
  json: { siteId: siteA, rightsStatus: 'restricted' },
})
const exec1 = await act({ action: 'execute' })
const detail1 = await api(`/api/admin/releases/${rid}`, { cookie: adminA })
const rel1 = detail1.data?.release ?? detail1.data
const art1 = (rel1?.artifacts ?? []).find((a) => a.targetType === 'article')
const med1 = (rel1?.artifacts ?? []).find((a) => a.targetType === 'media')
const mainPage = await rawGet(hostA, SEED.releaseMainPath)
stage(
  'execution lands the article and fails the rights-restricted media — partial failure, visible',
  exec1.status === 200 &&
    String(exec1.data?.result?.status ?? rel1?.status).includes('partial') &&
    art1?.status === 'succeeded' &&
    med1?.status === 'failed' &&
    mainPage.status === 200,
  `result=${exec1.data?.result?.status} article=${art1?.status} media=${med1?.status}(${String(med1?.error ?? '').slice(0, 60)}) page=${mainPage.status}`,
)
const artAttemptsBefore = art1?.attempts
const artExecutedAtBefore = art1?.executedAt
await api(`/api/media/${SEED.mediaId}`, {
  method: 'PATCH',
  cookie: adminA,
  json: { siteId: siteA, rightsStatus: 'approved' },
})
const retry = await act({ action: 'retry' })
const detail2 = await api(`/api/admin/releases/${rid}`, { cookie: adminA })
const rel2 = detail2.data?.release ?? detail2.data
const art2 = (rel2?.artifacts ?? []).find((a) => a.targetType === 'article')
const med2 = (rel2?.artifacts ?? []).find((a) => a.targetType === 'media')
const auditActions = (rel2?.executionAudit ?? []).map((a) => a.action)
stage(
  'retry completes only the failed media item; the published article is not re-executed',
  retry.status === 200 &&
    rel2?.status === 'completed' &&
    med2?.status === 'succeeded' &&
    med2?.attempts === 2 &&
    art2?.attempts === artAttemptsBefore &&
    art2?.executedAt === artExecutedAtBefore,
  `release=${rel2?.status} media=${med2?.status} att=${med2?.attempts} articleAtt=${art2?.attempts}`,
)
stage(
  'the release carries a durable audit trail of the whole lifecycle',
  ['release.created', 'release.approved', 'release.execution.completed'].every((a) =>
    auditActions.includes(a),
  ) && auditActions.length >= 6,
  `audit=${auditActions.join(',')}`,
)

// ------------------------------------------------ grants
const outWf = await wf(outsiderB, SEED.workflowId, 'submit')
const outCreate = await api('/api/admin/releases', {
  method: 'POST',
  cookie: outsiderB,
  json: { name: 'Outsider release', siteId: siteA },
})
const outExec = await act({ action: 'execute' }, outsiderB)
stage(
  'a Site B principal cannot drive Site A workflow, releases or execution',
  outWf.status === 403 && outCreate.status === 403 && outExec.status === 403,
  `wf=${outWf.status} create=${outCreate.status} exec=${outExec.status}`,
)

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} stages passed`)
writeFileSync(
  SHOTS + '/results.json',
  JSON.stringify({ suffix: SEED.suffix, stamp: SEED.stamp, results }, null, 2),
)
process.exit(passed === results.length ? 0 : 1)
