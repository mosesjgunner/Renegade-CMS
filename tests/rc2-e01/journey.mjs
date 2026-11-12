// RC2-E-01 — Member identity → profile → public participation.
// A clean public member (never staff credentials): enumeration-safe
// signup surface, hashed single-use sign-in tokens, identity convergence
// across links, self-only profile edits, a public contribution, the
// space reality, Site A/B limits, member-data privacy, session
// management and sign-out — plus browser proof (browser.mjs) and
// service-level session-expiry proof (session-expiry.spec.ts).
// Token issuance uses the production issuing function (see
// issue-tokens.spec.ts for the stated test boundary).
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const siteA = world.siteA.siteId
const siteB = world.siteB.siteId
const hostA = world.siteA.host
const hostB = world.siteB.host
const adminA = `renegade-passkey=${world.cookies.adminA}`
const stamp = Date.now().toString(36)
const EMAILS = {
  surface: `e01-surface-${stamp}@example.com`,
  a: `e01-ada-${stamp}@example.com`,
  b: `e01-bob-${stamp}@example.com`,
}
writeFileSync('/tmp/e01-emails.json', JSON.stringify(EMAILS, null, 2))

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
const api = (host, path, { method = 'GET', cookie, csrf, body } = {}) =>
  rawRequest({
    host,
    path,
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-member-csrf': csrf } : {}),
    },
    body,
  })
const staffApi = (path, opts = {}) =>
  rawRequest({
    host: hostA,
    path,
    method: opts.method ?? 'GET',
    headers: {
      cookie: adminA,
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.body,
  })
// Site B staff reads must use Site B's own admin: content access is
// site-scoped, so Site A's admin correctly sees none of Site B's rows.
const outsiderB = `renegade-passkey=${world.cookies.outsiderB}`
const staffApiB = (path, opts = {}) =>
  rawRequest({
    host: hostB,
    path,
    method: opts.method ?? 'GET',
    headers: {
      cookie: outsiderB,
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.body,
  })
const cookiesFrom = (res) => {
  const out = {}
  for (const line of res.headers['set-cookie'] ?? []) {
    const [pair] = line.split(';')
    const idx = pair.indexOf('=')
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
  }
  return out
}
const memberCookie = (c) =>
  `renegade-member=${c['renegade-member']}; renegade-member-csrf=${c['renegade-member-csrf']}`
function runSpec(spec, env) {
  execFileSync('npx', ['vitest', 'run', spec, '--no-file-parallelism'], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'pipe',
    timeout: 300_000,
  })
}

// ---------- operator setup (staff actions an operator performs) ----------
// Activate Site A's blog publication (public routes stay 404 until an
// operator activates a publication — D-04) and open comments on the
// seeded published article.
await staffApi(`/api/publications/${world.siteA.blogPublicationId}`, {
  method: 'PATCH',
  body: { status: 'active' },
})
await staffApi(`/api/content/${world.siteA.publishedArticleId}`, {
  method: 'PATCH',
  body: { commentsPolicy: 'open' },
})

// ---------- stage 1: the public signup surface ----------
const surfaceRes = await api(hostA, '/api/member-auth/magic-link/request', {
  method: 'POST',
  body: { email: EMAILS.surface },
})
runSpec('tests/rc2-e01/issue-tokens.spec.ts', {
  E01_EMAILS: `${EMAILS.a},${EMAILS.b}`,
  E01_OUT: '/tmp/e01-tokens-1.json',
  E01_SURFACE_EMAIL: EMAILS.surface,
})
const issued1 = JSON.parse(readFileSync('/tmp/e01-tokens-1.json', 'utf8'))
const surfaceRow = issued1.surfaceRow ?? {}
stage(
  'public signup surface is enumeration-safe and sign-in tokens are hashed, single-use, 15-minute',
  surfaceRes.status === 200 &&
    String(surfaceRes.data?.status ?? '').includes('If an eligible address') &&
    !JSON.stringify(surfaceRes.data ?? {}).includes('token=') &&
    surfaceRow.found === true &&
    surfaceRow.hasTokenHash === true &&
    surfaceRow.hasPlaintextTokenField === false &&
    surfaceRow.consumed === false &&
    surfaceRow.ttlMinutes > 13 &&
    surfaceRow.ttlMinutes < 17,
  `http=${surfaceRes.status} row=${JSON.stringify(surfaceRow)}`,
)
// The surface address never completed sign-in: it has no session.
const surfaceMe = await api(hostA, '/api/member-auth/me')
stage(
  'an address that never finished sign-in has no session (unverified stays out)',
  surfaceMe.status === 401,
  `me=${surfaceMe.status}`,
)

// ---------- finding probe: the GET sign-in variant ----------
// The GET /api/member-auth/magic-link/complete route appends cookies to
// a Response.redirect() (immutable headers) and 500s on success, after
// the single-use token has already been consumed. Non-gating probe:
// the supported sign-in path is the emailed verify page (browser proof
// below); this defect is filed as RC2-E-01 Finding F1 / RC2-DEBT-18.
const probeEmail = `e01-probe-${stamp}@example.com`
runSpec('tests/rc2-e01/issue-tokens.spec.ts', {
  E01_EMAILS: probeEmail,
  E01_OUT: '/tmp/e01-tokens-get.json',
})
const getToken = JSON.parse(readFileSync('/tmp/e01-tokens-get.json', 'utf8')).tokens[probeEmail]
const getProbe = await rawRequest({
  host: hostA,
  path: `/api/member-auth/magic-link/complete?token=${encodeURIComponent(getToken)}`,
  method: 'GET',
})
console.log(
  `PROBE  GET complete with a fresh valid token -> HTTP ${getProbe.status} (Finding F1: success path 500s; token already consumed)`,
)

// ---------- browser proof (consumes A's first token) ----------
let browserOk = true
try {
  const out = execFileSync('node', ['tests/rc2-e01/browser.mjs'], {
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
const browserInfo = existsSync('/tmp/e01-browser.json')
  ? JSON.parse(readFileSync('/tmp/e01-browser.json', 'utf8'))
  : { memberId: null, handle: null }

// A's second link (the first was consumed in the browser) for API stages.
runSpec('tests/rc2-e01/issue-tokens.spec.ts', {
  E01_EMAILS: EMAILS.a,
  E01_OUT: '/tmp/e01-tokens-2.json',
})
const tokenA2 = JSON.parse(readFileSync('/tmp/e01-tokens-2.json', 'utf8')).tokens[EMAILS.a]
const tokenB = issued1.tokens[EMAILS.b]

// ---------- stage 2: API sign-in converges on the same member ----------
const completeA = await api(hostA, '/api/member-auth/magic-link/complete', {
  method: 'POST',
  body: { token: tokenA2 },
})
const cookiesA = cookiesFrom(completeA)
const meA = await api(hostA, '/api/member-auth/me', { cookie: memberCookie(cookiesA) })
stage(
  'API sign-in issues a session and converges on the same member the browser created',
  completeA.status === 200 &&
    Boolean(cookiesA['renegade-member']) &&
    Boolean(cookiesA['renegade-member-csrf']) &&
    meA.status === 200 &&
    meA.data?.memberId === browserInfo.memberId &&
    meA.data?.profile?.displayName === 'Ada Lovelace E01',
  `complete=${completeA.status} me=${meA.status} sameMember=${meA.data?.memberId === browserInfo.memberId}`,
)
const csrfA = cookiesA['renegade-member-csrf']
const sessionA = memberCookie(cookiesA)
const profileIdA = meA.data?.profile?.id

// ---------- stage 3: profile edit is real and CSRF-guarded ----------
const editA = await api(hostA, '/api/member-auth/profile', {
  method: 'PATCH',
  cookie: sessionA,
  csrf: csrfA,
  body: { bio: 'API-written bio for E-01.', visibility: 'public' },
})
const meA2 = await api(hostA, '/api/member-auth/me', { cookie: sessionA })
const noCsrf = await api(hostA, '/api/member-auth/profile', {
  method: 'PATCH',
  cookie: sessionA,
  body: { bio: 'should not land' },
})
stage(
  'profile edit persists for the owner and is refused without CSRF',
  editA.status === 200 &&
    meA2.data?.profile?.bio === 'API-written bio for E-01.' &&
    meA2.data?.profile?.visibility === 'public' &&
    noCsrf.status === 403,
  `edit=${editA.status} noCsrf=${noCsrf.status}`,
)

// ---------- stage 4: nobody else can edit it; members are not staff ----------
const completeB = await api(hostA, '/api/member-auth/magic-link/complete', {
  method: 'POST',
  body: { token: tokenB },
})
const cookiesB = cookiesFrom(completeB)
const sessionB = memberCookie(cookiesB)
const csrfB = cookiesB['renegade-member-csrf']
const meB = await api(hostA, '/api/member-auth/me', { cookie: sessionB })
await api(hostA, '/api/member-auth/profile', {
  method: 'PATCH',
  cookie: sessionB,
  csrf: csrfB,
  body: { displayName: 'Bob E01' },
})
const meAAfterB = await api(hostA, '/api/member-auth/me', { cookie: sessionA })
const restPatch = await rawRequest({
  host: hostA,
  path: `/api/profiles/${profileIdA}`,
  method: 'PATCH',
  headers: { cookie: sessionB, 'content-type': 'application/json' },
  body: { displayName: 'Hijacked' },
})
const staffMe = await rawRequest({
  host: hostA,
  path: '/api/users/me',
  headers: { cookie: sessionA },
})
stage(
  "another member cannot edit A's profile, and a member session is not a staff session",
  meB.data?.memberId !== browserInfo.memberId &&
    meAAfterB.data?.profile?.displayName === 'Ada Lovelace E01' &&
    (restPatch.status === 401 || restPatch.status === 403) &&
    !staffMe.data?.user,
  `restPatch=${restPatch.status} staffUser=${JSON.stringify(staffMe.data?.user ?? null)}`,
)

// ---------- stage 5: a public contribution ----------
const commentBody = `E-01 member comment ${stamp}`
const comment = await api(hostA, '/api/community/comments', {
  method: 'POST',
  cookie: sessionA,
  csrf: csrfA,
  body: {
    siteId: siteA,
    attachedToId: world.siteA.publishedArticleId,
    attachedToCollection: 'content',
    body: commentBody,
  },
})
const publicComments = await api(
  hostA,
  `/api/community/comments?attachedToId=${world.siteA.publishedArticleId}&siteId=${siteA}`,
)
const anonComment = await api(hostA, '/api/community/comments', {
  method: 'POST',
  body: { siteId: siteA, attachedToId: world.siteA.publishedArticleId, body: 'anon' },
})
const noCsrfComment = await api(hostA, '/api/community/comments', {
  method: 'POST',
  cookie: sessionA,
  body: { siteId: siteA, attachedToId: world.siteA.publishedArticleId, body: 'no csrf' },
})
stage(
  'the member comments publicly on the article; anonymous and CSRF-less posts are refused',
  comment.status === 201 &&
    JSON.stringify(publicComments.data ?? {}).includes(commentBody) &&
    JSON.stringify(publicComments.data ?? {}).includes('Ada Lovelace E01') &&
    anonComment.status === 403 &&
    noCsrfComment.status === 403,
  `comment=${comment.status} anon=${anonComment.status} noCsrf=${noCsrfComment.status} read=${publicComments.status}`,
)

// ---------- stage 6: the space reality for a self-signed-up member ----------
const spacesA = await staffApi(`/api/spaces?where[member][equals]=${browserInfo.memberId}&limit=5`)
const spacePost = await rawRequest({
  host: hostA,
  path: `/api/v1/sites/${siteA}/spaces/00000000-0000-4000-8000-000000000001`,
  method: 'POST',
  headers: { cookie: sessionA, 'content-type': 'application/json' },
  body: { title: 'member post attempt' },
})
stage(
  'a self-signed-up member has no space and no member space-post write path (measured E-level)',
  (spacesA.data?.totalDocs ?? -1) === 0 && (spacePost.status === 404 || spacePost.status === 405),
  `spaces=${spacesA.data?.totalDocs} postStatus=${spacePost.status}`,
)

// ---------- stage 7: Site B limits ----------
const meOnB = await api(hostB, '/api/member-auth/me', { cookie: sessionA })
const bArticles = await staffApiB(
  `/api/content?where[site][equals]=${siteB}&where[status][equals]=published&limit=5`,
)
const bArticleId = bArticles.data?.docs?.find(
  (d) => !String(d.slug ?? '').includes('space-post'),
)?.id
if (bArticleId) {
  await staffApiB(`/api/content/${bArticleId}`, {
    method: 'PATCH',
    body: { commentsPolicy: 'open' },
  })
}
const commentB = bArticleId
  ? await api(hostB, '/api/community/comments', {
      method: 'POST',
      cookie: sessionA,
      csrf: csrfA,
      body: {
        siteId: siteB,
        attachedToId: bArticleId,
        attachedToCollection: 'content',
        body: `E-01 cross-site comment ${stamp}`,
      },
    })
  : { status: 0 }
stage(
  'Site B: identity is global (same member), and cross-site commenting follows the measured standing rule',
  meOnB.status === 200 && meOnB.data?.memberId === browserInfo.memberId && commentB.status === 201,
  `meB=${meOnB.status} commentB=${commentB.status} bArticle=${bArticleId ?? 'none'}`,
)

// ---------- stage 8: member-data privacy ----------
const publicProfile = await rawRequest({
  host: hostA,
  path: `/members/${browserInfo.handle}`,
  method: 'GET',
})
const directory = await api(hostA, `/api/community/directory?siteId=${siteA}`)
const privPatch = await api(hostA, '/api/member-auth/profile', {
  method: 'PATCH',
  cookie: sessionA,
  csrf: csrfA,
  body: { visibility: 'private' },
})
const privateProfile = await rawRequest({
  host: hostA,
  path: `/members/${browserInfo.handle}`,
  method: 'GET',
})
stage(
  'public surfaces show the public profile only — never the email or private fields; private means private',
  publicProfile.status === 200 &&
    publicProfile.text.includes('Ada Lovelace E01') &&
    publicProfile.text.includes('API-written bio for E-01.') &&
    !publicProfile.text.includes(EMAILS.a) &&
    !JSON.stringify(directory.data ?? {}).includes(EMAILS.a) &&
    !JSON.stringify(directory.data ?? {}).includes('"preferences"') &&
    privPatch.status === 200 &&
    privateProfile.status === 404,
  `pub=${publicProfile.status} priv=${privateProfile.status} dir=${directory.status}`,
)

// ---------- stage 9: sessions, sign-out, single-use ----------
const bSessions = await api(hostA, '/api/member-auth/sessions', { cookie: sessionB })
const revokeAll = await api(hostA, '/api/member-auth/sessions/revoke-all', {
  method: 'POST',
  cookie: sessionB,
  csrf: csrfB,
})
const meBAfterRevoke = await api(hostA, '/api/member-auth/me', { cookie: sessionB })
const logoutA = await api(hostA, '/api/member-auth/logout', {
  method: 'POST',
  cookie: sessionA,
  csrf: csrfA,
})
const meAAfterLogout = await api(hostA, '/api/member-auth/me', { cookie: sessionA })
const reuse = await api(hostA, '/api/member-auth/magic-link/complete', {
  method: 'POST',
  body: { token: tokenA2 },
})
const garbage = await api(hostA, '/api/member-auth/me', {
  cookie: 'renegade-member=not-a-real-token',
})
stage(
  'sessions list and revoke; sign-out kills the session; sign-in links are single-use',
  bSessions.status === 200 &&
    revokeAll.status === 200 &&
    meBAfterRevoke.status === 401 &&
    logoutA.status === 200 &&
    meAAfterLogout.status === 401 &&
    reuse.status === 400 &&
    garbage.status === 401,
  `sessions=${bSessions.status} revoke=${revokeAll.status}/${meBAfterRevoke.status} logout=${logoutA.status}/${meAAfterLogout.status} reuse=${reuse.status} garbage=${garbage.status}`,
)

// ---------- stage 10: session expiry (service proof) ----------
runSpec('tests/rc2-e01/session-expiry.spec.ts', {})
const expiry = JSON.parse(readFileSync('/tmp/e01-expiry-verdict.json', 'utf8'))
stage(
  'expired sessions are refused and session rows store only a token hash (service proof)',
  expiry.storesHashOnly === true &&
    expiry.liveSessionAccepted === true &&
    expiry.expiredSessionAccepted === false,
  JSON.stringify(expiry),
)

const failed = results.filter((r) => !r.ok).length
console.log(
  `\n${results.length - failed}/${results.length} API stages passed${browserOk ? '' : ' (browser script reported failures)'}`,
)
process.exit(failed || !browserOk ? 1 : 0)
