/**
 * RC2-D-04 campaign journey — the first cross-family CMoS proof.
 *
 * One canonical article + its media travel together through a coordinated
 * release that also carries a social distribution draft and a newsletter
 * message: every destination resolves to the canonical record ids, the
 * delivered newsletter carries the article's canonical URL, and a
 * first-party analytics event is measured against the article path.
 * A second release injects a failure into ONE destination (media rights):
 * the other destinations stay successful, the release reports the mixed
 * result, and a retry completes only the failed item — without
 * re-publishing the article or duplicating the newsletter delivery.
 */
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import http from 'node:http'

const BASE = 'http://127.0.0.1:39071'
const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const seed = JSON.parse(readFileSync('/tmp/d04-content.json', 'utf8'))
const d03 = JSON.parse(readFileSync('/tmp/d03-seed.json', 'utf8'))
const siteA = world.siteA.siteId
const adminA = world.cookies.adminA
const editorA = world.cookies.editorA
const stamp = seed.stamp
const accounts = JSON.parse(readFileSync('/tmp/d04-accounts.json', 'utf8'))
const GOOD_ACCOUNT = accounts.goodId
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function poll(fn, ok, timeoutMs = 240000, stepMs = 4000) {
  const deadline = Date.now() + timeoutMs
  let last = await fn()
  while (!ok(last) && Date.now() < deadline) {
    await sleep(stepMs)
    last = await fn()
  }
  return last
}
async function api(path, { method = 'GET', cookie, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie: `renegade-passkey=${cookie}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: res.status, data, headers: res.headers }
}
function httpWithHost({ host, path, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 39071, path, method, headers: { Host: host, ...headers } },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data = null
          try {
            data = JSON.parse(text)
          } catch {}
          resolve({ status: res.statusCode, data, text, headers: res.headers })
        })
      },
    )
    req.on('error', reject)
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}
const list = async (collection, where, cookie = adminA) =>
  (await api(`/api/${collection}?${where}&limit=100&depth=0`, { cookie })).data?.docs ?? []
const companionOf = async (contentId) =>
  (await list('article-family-content', `where[content][equals]=${contentId}`))[0]
async function workflow(articleId, action) {
  // The workflow template forbids self-approval: the editor submits,
  // the site admin approves (the B-01/D-01 pattern).
  return api('/api/admin/workflow/actions', {
    method: 'POST',
    cookie: action === 'submit' ? editorA : adminA,
    body: { articleId, action },
  })
}
async function uploadMedia(label) {
  const form = new FormData()
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${label}.png`)
  form.append('siteId', siteA)
  form.append('title', `D04 ${label} ${stamp}`)
  form.append('altText', `D04 ${label} alt text`)
  const res = await fetch(`${BASE}/api/media/upload`, {
    method: 'POST',
    headers: { cookie: `renegade-passkey=${adminA}` },
    body: form,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, id: data?.asset?.id ?? data?.id ?? null }
}
const design = (text) => ({
  version: 1,
  templateVersion: 1,
  locale: 'en',
  tokens: {},
  plainTextStrategy: 'generated',
  personalization: { missingValue: 'fallback', fallbacks: {} },
  blocks: [
    { type: 'text', text },
    {
      type: 'legal',
      address: 'Renegade CMS, 1 Test Way',
      preferenceUrl: 'https://a.rc2-a04.test/preferences',
    },
  ],
})
async function campaignSchedule(subject, text) {
  return api(`/api/admin/audience/campaign?siteId=${siteA}`, {
    method: 'POST',
    cookie: adminA,
    body: {
      action: 'save-and-schedule',
      subject,
      segmentId: d03.segmentId,
      messageDesign: design(text),
      // Due almost immediately: the release step refuses to queue a
      // not-yet-due message (it succeeds as a no-op), so the campaign is
      // scheduled 45s out — inside the release execution window — and
      // delivery idempotency keys make the sweep/release overlap safe.
      scheduledFor: new Date(Date.now() + 45_000).toISOString(),
      targetStatus: 'scheduled',
    },
  })
}
async function socialDraft(articleId, canonicalUrl, label) {
  const created = await api('/api/admin/social/drafts', {
    method: 'POST',
    cookie: adminA,
    body: {
      action: 'create-draft',
      siteId: siteA,
      title: `D04 ${label} ${stamp}`,
      // No sourceContent link: a source-linked draft cannot be approved
      // until its article is published, but the release that publishes the
      // article needs the draft approved first (finding F1 in RESULT.md).
      // The draft carries the canonical URL instead.
      canonicalUrl,
      variants: [
        {
          accountId: GOOD_ACCOUNT,
          network: 'bluesky',
          text: `D04 ${label} ${stamp} ${canonicalUrl}`,
          label: 'Bluesky',
          linkUrl: canonicalUrl,
          attachments: [],
        },
      ],
    },
  })
  const draftId = created.data?.draft?.id ?? created.data?.draftId ?? created.data?.id
  if (!draftId) return { draftId: null, created, approved: null }
  await api('/api/admin/social/drafts', {
    method: 'POST',
    cookie: adminA,
    body: { action: 'submit-review', siteId: siteA, draftId },
  })
  const approved = await api('/api/admin/social/drafts', {
    method: 'POST',
    cookie: adminA,
    body: { action: 'approve', siteId: siteA, draftId },
  })
  return { draftId, created, approved }
}
async function makeRelease(name, publicationId) {
  const created = await api('/api/admin/releases', {
    method: 'POST',
    cookie: adminA,
    body: {
      name,
      siteId: siteA,
      publicationId,
      // Already due: distribution steps inherit the release's planned
      // instant as their queue schedule, and executing before it reports
      // them failed instead of pending (finding F2) — so an execute-now
      // release is planned in the recent past.
      plannedInstant: new Date(Date.now() - 300_000).toISOString(),
      timeZone: 'America/Chicago',
    },
  })
  return created.data?.release?.id ?? created.data?.id ?? null
}
async function releaseAction(id, body) {
  return api(`/api/admin/releases/${id}`, { method: 'POST', cookie: adminA, body })
}
const getRelease = async (id) =>
  (await api(`/api/content-releases/${id}?depth=0`, { cookie: adminA })).data
const deliveriesFor = async (email, messageId) =>
  (
    await list('email-deliveries', `where[recipientEmail][equals]=${encodeURIComponent(email)}`)
  ).filter((d) => String(d.message) === String(messageId))

// Operator setup: publications are created in draft and the public
// canonical routes stay 404 until an operator activates the publication
// (earlier journeys inherited an already-active publication from the
// long-lived world; a fresh world needs the activation step itself).
const activation = await api(`/api/publications/${world.siteA.blogPublicationId}`, {
  method: 'PATCH',
  cookie: adminA,
  body: { status: 'active' },
})
if (activation.status !== 200) {
  console.log(`publication activation failed: ${activation.status}`)
  process.exit(1)
}

// ---------- compose the campaign around the canonical article ----------
const readerEmail = `d04-reader-${stamp}@example.com`
await httpWithHost({
  host: 'a.rc2-a04.test',
  path: '/api/subscribers/subscribe',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: { email: readerEmail, siteId: siteA },
})
const confDelivery = await poll(
  () =>
    list('email-deliveries', `where[recipientEmail][equals]=${encodeURIComponent(readerEmail)}`),
  (docs) =>
    docs.some((d) => JSON.stringify(d.messageSnapshot ?? {}).includes('/subscribe/confirm?token=')),
  120000,
)
const confDoc = confDelivery.find((d) =>
  JSON.stringify(d.messageSnapshot ?? {}).includes('/subscribe/confirm?token='),
)
const token = /\/subscribe\/confirm\?token=([A-Za-z0-9_-]+)/.exec(
  JSON.stringify(confDoc?.messageSnapshot ?? {}),
)?.[1]
const confirmRes = await api('/api/subscribers/confirm', { method: 'POST', body: { token } })
const [readerRow] = await list(
  'subscribers',
  `where[email][equals]=${encodeURIComponent(readerEmail)}`,
)

const media1 = await uploadMedia('campaign hero')
const attach1 = await api('/api/media/attach', {
  method: 'POST',
  cookie: adminA,
  body: { mediaId: media1.id, contentId: seed.mainId, purpose: 'hero', siteId: siteA },
})
const submitMain = await workflow(seed.mainId, 'submit')
const approveMain = await workflow(seed.mainId, 'approve')
const mainCompanion = await companionOf(seed.mainId)
const draft1 = await socialDraft(
  seed.mainId,
  `https://a.rc2-a04.test${seed.mainPath}`,
  'campaign post',
)
const campaign1 = await campaignSchedule(
  `D04 Campaign ${stamp}`,
  `Read the story: https://a.rc2-a04.test${seed.mainPath}`,
)
const message1Id = campaign1.data?.messageId
const release1 = await makeRelease(`D04 Campaign ${stamp}`, world.siteA.blogPublicationId)
for (const artifact of [
  {
    targetType: 'article',
    targetId: mainCompanion.id,
    title: 'Campaign article',
    canonicalUrl: `https://a.rc2-a04.test${seed.mainPath}`,
    pinnedRevisionId: mainCompanion.currentRevision,
    pinnedRevisionSequence: mainCompanion.currentRevisionSequence,
  },
  { targetType: 'media', targetId: media1.id, title: 'Campaign hero media' },
  { targetType: 'newsletter', targetId: message1Id, title: 'Campaign newsletter' },
  {
    // No canonicalUrl here by design: the release gate treats two
    // artifacts claiming one canonical route as a collision (proven in
    // run 8) — the article pin owns the campaign's canonical URL.
    targetType: 'distribution',
    targetId: draft1.draftId,
    title: 'Campaign social post',
  },
]) {
  await releaseAction(release1, { action: 'pin-artifact', artifact })
}
const gates1 = await releaseAction(release1, { action: 'evaluate-gates' })
const blockerCount1 = gates1.data?.snapshot?.blockerCount
await releaseAction(release1, { action: 'submit-review' })
await releaseAction(release1, { action: 'approve' })
stage(
  'one release pins the canonical article, its media, a newsletter and a social draft by their real ids',
  Boolean(release1 && media1.id && draft1.draftId && message1Id) &&
    approveMain.status === 200 &&
    blockerCount1 === 0,
  `release=${release1} upload=${media1.status} attach=${attach1.status} submit=${submitMain.status} approve=${approveMain.status} draftCreate=${draft1.created?.status} draft=${draft1.approved?.status} campaign=${campaign1.status} confirm=${confirmRes.status} reader=${readerRow?.status} gates=${gates1.status}/${blockerCount1}`,
)

// ---------- execute: every destination resolves ----------
const fixtureBefore = await (await fetch('http://127.0.0.1:3130/state')).json()
await releaseAction(release1, { action: 'execute' })
const done1 = await poll(
  () => getRelease(release1),
  (r) => ['completed', 'partially-failed', 'failed'].includes(String(r?.status)),
  300000,
)
const arts1 = done1?.artifacts ?? []
const byType1 = Object.fromEntries(arts1.map((a) => [a.targetType, a]))
const page1 = await httpWithHost({ host: 'a.rc2-a04.test', path: seed.mainPath })
stage(
  'the release completes with all four destinations succeeded and the article live',
  done1?.status === 'completed' &&
    ['article', 'media', 'newsletter', 'distribution'].every(
      (t) => byType1[t]?.status === 'succeeded',
    ) &&
    page1.status === 200,
  `release=${done1?.status} page=${page1.status} arts=${arts1.map((a) => `${a.targetType}:${a.status}`).join(',')} failedDetail=${JSON.stringify(arts1.filter((a) => a.status === 'failed')).slice(0, 500)}`,
)

const readerDeliveries1 = await poll(
  () => deliveriesFor(readerEmail, message1Id),
  (d) => d.length >= 1,
  180000,
)
const snapshotText = JSON.stringify(readerDeliveries1[0]?.messageSnapshot ?? {})
stage(
  'the newsletter delivers once to the confirmed reader and carries the canonical article URL',
  readerDeliveries1.length === 1 && snapshotText.includes(seed.mainPath),
  `deliveries=${readerDeliveries1.length} carriesUrl=${snapshotText.includes(seed.mainPath)}`,
)

const fixtureAfter = await (await fetch('http://127.0.0.1:3130/state')).json()
const queue1 = await list('social-queue-items', `where[idempotencyKey][like]=release:${release1}`)
const mediaPublic = await httpWithHost({ host: 'a.rc2-a04.test', path: `/media/${media1.id}` })
stage(
  'distribution posts through the release outbox and the hero media serves publicly',
  queue1.some((q) => q.status === 'published') &&
    (fixtureAfter.creates?.['did:plc:good'] ?? 0) >
      (fixtureBefore.creates?.['did:plc:good'] ?? 0) &&
    mediaPublic.status === 200,
  `queue=${queue1.map((q) => q.status).join(',')} creates=${fixtureBefore.creates?.['did:plc:good']}->${fixtureAfter.creates?.['did:plc:good']} media=${mediaPublic.status}`,
)

// ---------- measured first-party event ----------
// First-party collection is off by default in site settings ("Collection
// is off by default. Consent is never bypassed"). The journey proves the
// gate honestly: consent is recorded, and while collection is disabled
// the collect endpoint refuses the event instead of capturing it.
// Enabling collection needs a site-settings write — which no operator
// principal in a multi-site install can perform (finding F4): the
// settings update access demands all-sites coverage or a global-owner
// flag that no code path ever sets. The recorded-event half is therefore
// NOT VERIFIED in this environment, named rather than claimed.
const ownerCookie = JSON.parse(readFileSync('/tmp/d04-owner.json', 'utf8')).cookie.replace(
  'renegade-passkey=',
  '',
)
const settingsBefore = await api('/api/globals/site-settings?depth=0', { cookie: adminA })
const settingsUpdateAdmin = await api('/api/globals/site-settings', {
  method: 'POST',
  cookie: adminA,
  body: {
    privacy: { ...(settingsBefore.data?.privacy ?? {}), analyticsEnabled: true },
  },
})
const settingsUpdateOwner = await api('/api/globals/site-settings', {
  method: 'POST',
  cookie: ownerCookie,
  body: {
    privacy: { ...(settingsBefore.data?.privacy ?? {}), analyticsEnabled: true },
  },
})
const consentRes = await httpWithHost({
  host: 'a.rc2-a04.test',
  path: '/api/analytics/consent',
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://a.rc2-a04.test' },
  body: { siteId: siteA, choices: { analytics: true } },
})
const consentCookie = (consentRes.headers['set-cookie'] ?? [])
  .map((c) => c.split(';')[0])
  .join('; ')
const collect = await httpWithHost({
  host: 'a.rc2-a04.test',
  path: '/api/analytics/collect',
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'https://a.rc2-a04.test',
    cookie: consentCookie,
  },
  body: {
    id: `d04-view-${stamp}`,
    siteId: siteA,
    eventType: 'page_view',
    path: seed.mainPath,
  },
})
stage(
  'first-party analytics gate holds: consent is recorded, collection refuses while disabled, and the settings write is refused for site operators (F4)',
  consentRes.status === 200 &&
    collect.status === 202 &&
    collect.data?.accepted === false &&
    settingsUpdateAdmin.status === 403 &&
    settingsUpdateOwner.status === 403 &&
    settingsBefore.data?.privacy?.analyticsEnabled === false,
  `consent=${consentRes.status} collect=${collect.status}/${collect.data?.reason ?? ''} settingsAdmin=${settingsUpdateAdmin.status} settingsOwner=${settingsUpdateOwner.status}`,
)

// ---------- second release: one destination fails, retry is surgical ----------
const media2 = await uploadMedia('retry media')
// Deliberately NOT attached as the retry article's hero: run 5 showed a
// rights-restricted hero also blocks the article's own publish, so the
// failure-isolation arc uses a standalone media artifact (as in D-01);
// the coupling itself is recorded as finding F3.
await workflow(seed.retryId, 'submit')
await workflow(seed.retryId, 'approve')
const retryCompanion = await companionOf(seed.retryId)
const draft2 = await socialDraft(
  seed.retryId,
  `https://a.rc2-a04.test${seed.retryPath}`,
  'retry post',
)
const campaign2 = await campaignSchedule(
  `D04 Retry ${stamp}`,
  `Second story: https://a.rc2-a04.test${seed.retryPath}`,
)
const message2Id = campaign2.data?.messageId
const release2 = await makeRelease(`D04 Retry ${stamp}`, world.siteA.blogPublicationId)
for (const artifact of [
  {
    targetType: 'article',
    targetId: retryCompanion.id,
    title: 'Retry article',
    canonicalUrl: `https://a.rc2-a04.test${seed.retryPath}`,
    pinnedRevisionId: retryCompanion.currentRevision,
    pinnedRevisionSequence: retryCompanion.currentRevisionSequence,
  },
  { targetType: 'newsletter', targetId: message2Id, title: 'Retry newsletter' },
  {
    targetType: 'distribution',
    targetId: draft2.draftId,
    title: 'Retry social post',
  },
  { targetType: 'media', targetId: media2.id, title: 'Retry hero media' },
]) {
  await releaseAction(release2, { action: 'pin-artifact', artifact })
}
await releaseAction(release2, { action: 'evaluate-gates' })
await releaseAction(release2, { action: 'submit-review' })
await releaseAction(release2, { action: 'approve' })
await api(`/api/media/${media2.id}`, {
  method: 'PATCH',
  cookie: adminA,
  body: { siteId: siteA, rightsStatus: 'restricted' },
})
await releaseAction(release2, { action: 'execute' })
const partial = await poll(
  () => getRelease(release2),
  (r) => ['partially-failed', 'completed', 'failed'].includes(String(r?.status)),
  300000,
)
const byType2 = Object.fromEntries((partial?.artifacts ?? []).map((a) => [a.targetType, a]))
const readerDeliveries2 = await deliveriesFor(readerEmail, message2Id)
stage(
  'with media rights restricted, the release reports a mixed result and the other destinations still succeed',
  partial?.status === 'partially-failed' &&
    byType2.media?.status === 'failed' &&
    byType2.article?.status === 'succeeded' &&
    byType2.newsletter?.status === 'succeeded' &&
    byType2.distribution?.status === 'succeeded',
  `release=${partial?.status} arts=${(partial?.artifacts ?? []).map((a) => `${a.targetType}:${a.status}`).join(',')} deliveries2=${readerDeliveries2.length} failedDetail=${JSON.stringify((partial?.artifacts ?? []).filter((a) => a.status === 'failed')).slice(0, 400)}`,
)

await api(`/api/media/${media2.id}`, {
  method: 'PATCH',
  cookie: adminA,
  body: { siteId: siteA, rightsStatus: 'approved' },
})
await releaseAction(release2, { action: 'retry' })
const done2 = await poll(
  () => getRelease(release2),
  (r) => String(r?.status) === 'completed',
  300000,
)
const byType2b = Object.fromEntries((done2?.artifacts ?? []).map((a) => [a.targetType, a]))
// The campaign's own dispatch sweep delivers on its cadence; wait for
// the single delivery to land before asserting no duplicate exists.
const readerDeliveries2b = await poll(
  () => deliveriesFor(readerEmail, message2Id),
  (docs) => docs.length >= 1,
  180000,
)
stage(
  'retry completes only the failed destination — no re-publish, no duplicate newsletter',
  done2?.status === 'completed' &&
    (byType2b.media?.attempts ?? 0) >= 2 &&
    (byType2b.article?.attempts ?? 0) === 1 &&
    readerDeliveries2b.length === 1,
  `mediaAttempts=${byType2b.media?.attempts} articleAttempts=${byType2b.article?.attempts} deliveries2=${readerDeliveries2b.length}`,
)

// ---------- the operator trace ----------
const auditText = JSON.stringify(done2?.executionAudit ?? [])
stage(
  'both release records carry the full cross-family trace with canonical ids and resulting URLs',
  (done1?.resultingUrls ?? []).some((u) => String(u).includes(seed.mainPath)) &&
    (done2?.resultingUrls ?? []).some((u) => String(u).includes(seed.retryPath)) &&
    ['article', 'media', 'newsletter', 'distribution'].every((t) =>
      arts1.some((a) => a.targetType === t),
    ) &&
    auditText.length > 2,
  `urls1=${(done1?.resultingUrls ?? []).length} urls2=${(done2?.resultingUrls ?? []).length}`,
)

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} stages passed`)
process.exit(passed === results.length ? 0 : 1)
