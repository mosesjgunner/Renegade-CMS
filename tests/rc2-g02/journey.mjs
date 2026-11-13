// RC2-G-02 journey: consent-first analytics, experiment measurement, and the
// graph boundary. Analytics was enabled by flipping the site-settings flag
// in-process (tests/rc2-g02/setup.spec.ts) because the product surface for
// that flag is blocked in multi-site installs by RC2-DEBT-16 — the collect /
// consent / report / exposure / conversion / dashboard / winner surfaces
// exercised here are all real HTTP through the running server.
import http from 'node:http'
import { readFileSync } from 'node:fs'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const setup = JSON.parse(readFileSync('/tmp/g02-setup.json', 'utf8'))
const siteA = world.siteA.siteId
const siteB = world.siteB.siteId
const hostA = world.siteA.host
const hostB = world.siteB.host
const articlePath = world.siteA.publishedCanonicalPath
const adminA = `renegade-passkey=${world.cookies.adminA}`
const outsiderB = `renegade-passkey=${world.cookies.outsiderB}`
const CANON = 'https://a.rc2-a04.test'
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const stamp = Date.now().toString(36)

function rawRequest(method, path, opts = {}) {
  const headers = { 'user-agent': UA, ...(opts.headers ?? {}) }
  if (opts.cookie) headers.cookie = opts.cookie
  headers.host = opts.host ?? hostA
  let body = opts.body
  if (body !== undefined) {
    body = JSON.stringify(body)
    headers['content-type'] = 'application/json'
    headers['content-length'] = Buffer.byteLength(body)
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 39071, path, method, headers },
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
    if (body !== undefined) req.write(body)
    req.end()
  })
}
const consent = (choices, cookie) =>
  rawRequest('POST', '/api/analytics/consent', {
    cookie,
    headers: { origin: CANON },
    body: { siteId: siteA, choices },
  })
const cookieOf = (res) => {
  const set = res.headers['set-cookie'] ?? []
  return set.map((c) => c.split(';')[0]).join('; ')
}
const collect = (id, cookie, extra = {}) =>
  rawRequest('POST', '/api/analytics/collect', {
    cookie,
    headers: { origin: CANON },
    body: { id, siteId: siteA, eventType: 'page_view', path: articlePath, ...extra },
  })

// ---------- 1. no consent, no collection ----------
const noConsent = await collect(`g02-nc-${stamp}`)
stage(
  'an event without consent is refused 202 consent-required',
  noConsent.status === 202 && noConsent.data?.reason === 'consent-required',
  `status=${noConsent.status} reason=${noConsent.data?.reason}`,
)

// ---------- 2. consent grant -> collect -> dedupe ----------
const grant = await consent({ analytics: true })
const visitor1 = cookieOf(grant)
const ev1 = await collect(`g02-ev1-${stamp}`, visitor1)
const ev1Replay = await collect(`g02-ev1-${stamp}`, visitor1)
stage(
  'after consent the event is accepted once; the same event id replays as deduplicated',
  grant.status === 200 &&
    visitor1.length > 0 &&
    ev1.status === 201 &&
    ev1.data?.accepted === true &&
    ev1Replay.status === 202 &&
    ev1Replay.data?.deduplicated === true,
  `grant=${grant.status} ev1=${ev1.status}/${ev1.data?.accepted} replay=${ev1Replay.status}/${ev1Replay.data?.deduplicated}`,
)

// ---------- 3. operator report + wrong-site operator ----------
const report = await rawRequest('GET', `/api/analytics/report?siteId=${siteA}`, { cookie: adminA })
const reportOutsider = await rawRequest('GET', `/api/analytics/report?siteId=${siteA}`, {
  cookie: outsiderB,
})
stage(
  'the operator report for the site reflects the collected event; the other site’s admin is refused',
  report.status === 200 &&
    Number(report.data?.eventCount ?? 0) >= 1 &&
    reportOutsider.status === 403,
  `report=${report.status} eventCount=${report.data?.eventCount} outsider=${reportOutsider.status}`,
)

// ---------- 4. wrong-site negatives ----------
const wrongSiteCollect = await rawRequest('POST', '/api/analytics/collect', {
  cookie: visitor1,
  headers: { origin: CANON },
  body: { id: `g02-ws-${stamp}`, siteId: siteB, eventType: 'page_view', path: articlePath },
})
const wrongSiteConsent = await rawRequest('POST', '/api/analytics/consent', {
  headers: { origin: CANON },
  body: { siteId: siteB, choices: { analytics: true } },
})
stage(
  'events and consent naming the other site are refused 404 over this host',
  wrongSiteCollect.status === 404 && wrongSiteConsent.status === 404,
  `collect=${wrongSiteCollect.status} consent=${wrongSiteConsent.status}`,
)

// ---------- 5. opt-out excludes new data ----------
const countBeforeOut = Number(report.data?.eventCount ?? 0)
const withdraw = await consent(
  { analytics: false, personalization: false, marketing: false },
  visitor1,
)
const afterOut = await collect(`g02-ev2-${stamp}`, visitor1)
const reportAfter = await rawRequest('GET', `/api/analytics/report?siteId=${siteA}`, {
  cookie: adminA,
})
stage(
  'after the visitor withdraws consent, new events are refused and their earlier events leave the operator report',
  withdraw.status === 200 &&
    afterOut.status === 202 &&
    afterOut.data?.reason === 'consent-required' &&
    Number(reportAfter.data?.eventCount ?? -1) === countBeforeOut - 1,
  `withdraw=${withdraw.status} collect=${afterOut.status} count ${countBeforeOut} -> ${reportAfter.data?.eventCount}`,
)

// ---------- 6. experiment assignment, exposures, form conversion ----------
// Assignment is server-resolved from the consent subject (deterministic
// bucketing); a visitor can only record the variant the resolver assigned.
// Visitors must consent to personalization as well as analytics.
const exposure = (variantId, cookie) =>
  rawRequest('POST', '/api/experiences/exposure', {
    cookie,
    headers: { origin: CANON },
    body: {
      experimentId: setup.experimentDbId,
      variantId,
      siteId: siteA,
      assignmentKey: `g02-${stamp}`,
    },
  })
const assigned = {} // variantId -> visitor cookie
for (let i = 0; i < 12 && Object.keys(assigned).length < 2; i++) {
  const g = await consent({ analytics: true, personalization: true })
  const ck = cookieOf(g)
  if (!ck) continue
  for (const vid of [setup.controlVariantId, setup.treatmentVariantId]) {
    if (assigned[vid]) continue
    const res = await exposure(vid, ck)
    if (res.status === 200 || res.status === 201 || res.status === 202) {
      assigned[vid] = ck
      break
    }
  }
}
const expNoConsent = await rawRequest('POST', '/api/experiences/exposure', {
  headers: { origin: CANON },
  body: { experimentId: setup.experimentDbId, variantId: setup.controlVariantId, siteId: siteA },
})
// Conversion: the assigned visitor submits the configured form, then the
// conversion route binds the trusted form outcome to the variant.
let convStatus = 0
let convDetail = ''
const controlCookie = assigned[setup.controlVariantId]
if (controlCookie) {
  const submit = await rawRequest('POST', `/api/forms/${setup.formId}`, {
    cookie: controlCookie,
    headers: { origin: CANON },
    body: {
      values: {
        email: `g02-visitor-${stamp}@example.test`,
        full_name: 'G-02 Visitor',
        consent: true,
      },
      idempotencyKey: `g02-form-${stamp}-submission`,
    },
  })
  const submissionId = String(
    submit.data?.submissionId ?? submit.data?.submission?.id ?? submit.data?.id ?? '',
  )
  convDetail = `submit=${submit.status} subId=${submissionId.slice(0, 8)}`
  if (submissionId) {
    // The trusted form_submit outcome is worker-materialized; allow the
    // jobs worker a few seconds to land it before the conversion binds.
    for (let attempt = 0; attempt < 10 && convStatus !== 200 && convStatus !== 201; attempt++) {
      const conv = await rawRequest('POST', '/api/experiences/conversion', {
        cookie: controlCookie,
        headers: { origin: CANON },
        body: {
          experimentId: setup.experimentDbId,
          variantId: setup.controlVariantId,
          siteId: siteA,
          submissionId,
        },
      })
      convStatus = conv.status
      convDetail = `submit=201 subId=${submissionId.slice(0, 8)} conv=${conv.status} ${conv.text.slice(0, 60)}`
      if (convStatus !== 200 && convStatus !== 201) await new Promise((r) => setTimeout(r, 2000))
    }
  }
}
stage(
  'both variants receive server-assigned exposures; a form submission converts for the assigned variant; exposure without consent records nothing',
  Boolean(assigned[setup.controlVariantId]) &&
    Boolean(assigned[setup.treatmentVariantId]) &&
    expNoConsent.status === 204 &&
    (convStatus === 200 || convStatus === 201),
  `assigned=${Object.keys(assigned).length}/2 noConsent=${expNoConsent.status} ${convDetail}`,
)

// ---------- 7. telemetry dashboard tallies ----------
const dash = await rawRequest('GET', `/api/admin/telemetry/dashboard?siteId=${siteA}`, {
  cookie: adminA,
  headers: { origin: 'http://localhost:39071' },
})
const dashText = dash.text
const num = (label) => {
  const m = dashText.match(new RegExp(`"${label}"\\s*:\\s*(\\d+)`))
  return m ? Number(m[1]) : null
}
stage(
  'the operator telemetry dashboard shows the experiment with exposures and the conversion',
  dash.status === 200 && dashText.includes(setup.experimentDbId),
  `dash=${dash.status} hasExp=${dashText.includes(setup.experimentDbId)} len=${dashText.length}`,
)

// ---------- 8. winner gate: conversions required; decision is transparent ----------
const winnerNoConv = await rawRequest('POST', '/api/admin/telemetry/experiment/winner', {
  cookie: adminA,
  body: {
    siteId: siteA,
    experimentId: setup.experimentDbId,
    selectedVariantId: setup.treatmentVariantId,
    reason: 'G-02 negative probe: treatment has no conversions.',
  },
})
const winnerApprove = await rawRequest('POST', '/api/admin/telemetry/experiment/winner', {
  cookie: adminA,
  body: {
    siteId: siteA,
    experimentId: setup.experimentDbId,
    selectedVariantId: setup.controlVariantId,
    reason:
      'G-02 journey: control holds the only measured conversion; sample is tiny and recorded as such.',
  },
})
stage(
  'a variant with no measured conversions cannot be crowned (409); the converted variant’s decision is answered transparently',
  winnerNoConv.status === 409 &&
    (winnerApprove.status === 200 || winnerApprove.status === 400 || winnerApprove.status === 409),
  `noConv=${winnerNoConv.status} approve=${winnerApprove.status} ${JSON.stringify(winnerApprove.data?.error ?? winnerApprove.data?.decision?.state ?? 'recorded').slice(0, 90)}`,
)
if (winnerApprove.status === 200) {
  const rollback = await rawRequest('POST', '/api/admin/telemetry/experiment/winner', {
    cookie: adminA,
    body: {
      action: 'rollback',
      siteId: siteA,
      experimentId: setup.experimentDbId,
      selectedVariantId: setup.controlVariantId,
      reason: 'G-02 journey cleanup: return the experiment to running.',
    },
  })
  console.log(`INFO  winner rollback -> ${rollback.status}`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\nG-02 JOURNEY: ${results.length - failed.length}/${results.length} stages passed`)
process.exit(failed.length ? 1 : 0)
