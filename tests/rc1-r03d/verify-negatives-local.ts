/* eslint-disable @typescript-eslint/no-explicit-any -- isolated real HTTP and WebAuthn acceptance */
// R-03D local-process variant of the frozen 03D negatives
// (tests/rc1-03d/verify-negatives.ts). Same assertions, retargeted to
// the local HTTPS proxy origin (https://rc1-03d.test:38782) and the
// scratch session/state locations used by verify-local.ts.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import nodeHttps from 'node:https'
import { chromium } from '@playwright/test'
assert.equal(process.env.RC1R03D_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith('/rc1r03d_main'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const base = 'https://rc1-03d.test:38782',
  out = 'docs/rc/evidence/rc1/repairs/R-03D'
const browser = await chromium.launch({
  headless: true,
  args: [
    '--ignore-certificate-errors',
    '--no-proxy-server',
    '--host-resolver-rules=MAP rc1-03d.test 127.0.0.1',
  ],
})
const owner = await browser.newContext({
  storageState: 'scratch/rc1r03d/session.json',
  ignoreHTTPSErrors: true,
})
const staff = await browser.newContext({ ignoreHTTPSErrors: true }),
  anon = await browser.newContext({ ignoreHTTPSErrors: true })
const trace: any[] = []
let checks = 0
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}
// Local transport alignment (R-03C precedent, as in verify-local.ts):
// API calls go through the local HTTPS proxy by loopback IP with the
// proxy Host header and the calling context's own session cookie.
const req = async (
  context: any,
  route: string,
  method = 'GET',
  data?: any,
  status = 200,
  origin = base,
) => {
  const cookies = (await context.cookies(base)).map((c: any) => `${c.name}=${c.value}`).join('; ')
  const payloadText = data === undefined ? undefined : JSON.stringify(data)
  const result = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const request = nodeHttps.request(
      {
        host: '127.0.0.1',
        port: 38782,
        path: route,
        method,
        rejectUnauthorized: false,
        headers: {
          host: 'rc1-03d.test:38782',
          origin,
          cookie: cookies,
          ...(payloadText
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payloadText),
              }
            : {}),
        },
        timeout: 180000,
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () => resolve({ status: response.statusCode ?? 0, text }))
        response.on('error', reject)
      },
    )
    request.on('error', reject)
    if (payloadText) request.write(payloadText)
    request.end()
  })
  const text = result.text
  trace.push({ route, method, status: result.status })
  assert.equal(result.status, status, `${method} ${route}: ${text.slice(0, 1500)}`)
  return text ? JSON.parse(text) : undefined
}
let success = false
try {
  const report = JSON.parse(await readFile(`${out}/import-report.json`, 'utf8'))
  const sites = (await req(owner, '/api/sites?limit=50')).docs
  const site = sites.find((row: any) => row.slug === 'operator-dispatch-03d')
  const before = await req(owner, `/api/migration/legacy/report/${report.runId}`)
  const beforeCount = (await req(owner, `/api/content?where[site][equals]=${report.siteId}`))
    .totalDocs
  for (const [route, method, data] of [
    [`/api/migration/export?siteId=${report.siteId}`, 'GET'],
    [`/api/migration/legacy/report/${report.runId}`, 'GET'],
    ['/api/migration/legacy/execute', 'POST', { pkg: { wxr: 'x' } }],
  ] as const) {
    await req(anon, route, method, data, 403)
    check(`anonymous denied ${route}`, true)
  }
  const invitation = await req(
    owner,
    '/api/admin/staff/invite',
    'POST',
    {
      email: `staff-${Date.now()}@rc103d.test`,
      role: 'staff',
      siteId: site.id,
    },
    201,
  )
  const page = await staff.newPage()
  page.setDefaultTimeout(120000)
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 180000 })
  const cdp = await staff.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  const enrollment = { enrollmentToken: invitation.enrollmentToken, siteId: site.id }
  const options = (
    await req(staff, '/api/auth/passkey/enroll', 'POST', { ...enrollment, action: 'options' })
  ).options
  // tsx/esbuild compiles the evaluate callback below with a __name
  // helper reference that does not exist in the browser; shim it.
  await page.evaluate('window.__name = (fn) => fn')
  const credential = await page.evaluate(async (options: any) => {
    const decode = (s: string) =>
      Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const encode = (b: ArrayBuffer) =>
      btoa(String.fromCharCode(...new Uint8Array(b)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    options.challenge = decode(options.challenge)
    options.user.id = decode(options.user.id)
    const result = (await navigator.credentials.create({
      publicKey: options,
    })) as PublicKeyCredential
    const response = result.response as AuthenticatorAttestationResponse
    return {
      id: result.id,
      rawId: encode(result.rawId),
      type: result.type,
      response: {
        clientDataJSON: encode(response.clientDataJSON),
        attestationObject: encode(response.attestationObject),
        transports: response.getTransports(),
      },
    }
  }, options)
  await req(staff, '/api/auth/passkey/enroll', 'POST', {
    ...enrollment,
    action: 'complete',
    credential,
  })
  await page.waitForFunction(() =>
    Object.keys(document.querySelector('input[type="email"]') ?? {}).some((key) =>
      key.startsWith('__reactProps'),
    ),
  )
  await page.getByLabel('Owner / Staff Email').click()
  await page.getByLabel('Owner / Staff Email').fill(invitation.user.email)
  const completed = page.waitForResponse(
    (response) => response.url().includes('/api/auth/passkey/complete'),
    {
      timeout: 180000,
    },
  )
  await page.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  assert.equal((await completed).status(), 200)
  check(
    'invited site-scoped staff completes real virtual WebAuthn enrollment and login',
    (await staff.cookies()).some((cookie) => cookie.name === 'renegade-passkey'),
  )
  for (const [route, method, data] of [
    [`/api/migration/export?siteId=${report.siteId}`, 'GET'],
    [`/api/migration/legacy/report/${report.runId}`, 'GET'],
    [`/api/migration/legacy/verify/${report.runId}`, 'POST'],
    [`/api/migration/legacy/activate/${report.runId}`, 'POST'],
    [`/api/migration/legacy/rollback/${report.runId}`, 'POST'],
    [
      '/api/migration/legacy/execute',
      'POST',
      {
        pkg: { wxr: 'x' },
        options: { targetSiteMode: 'existing-site', targetSiteId: report.siteId },
      },
    ],
    [
      '/api/migration/legacy/execute',
      'POST',
      { pkg: { wxr: 'x' }, options: { targetSiteMode: 'new-isolated-site' } },
    ],
  ] as const) {
    await req(staff, route, method, data, 403)
    check(`foreign site or unauthorized creation denied ${route}`, true)
  }
  const own = await req(staff, `/api/migration/export?siteId=${site.id}`)
  check(
    'scoped staff can export authorized site without foreign content',
    own.manifest.records
      .filter((row: any) => row.collection === 'content')
      .every((row: any) => row.data.site === site.id),
  )
  await req(
    owner,
    '/api/migration/legacy/execute',
    'POST',
    { pkg: { wxr: 'x' } },
    403,
    'https://foreign.invalid',
  )
  check('cross-origin mutation denied for authenticated owner', true)
  const after = await req(owner, `/api/migration/legacy/report/${report.runId}`)
  check(
    'denied mutations preserve exact persisted migration report',
    JSON.stringify(before) === JSON.stringify(after),
  )
  check(
    'denied mutations preserve content count',
    (await req(owner, `/api/content?where[site][equals]=${report.siteId}`)).totalDocs ===
      beforeCount,
  )
  success = true
} catch (error) {
  trace.push({ failure: error instanceof Error ? error.message : String(error) })
  console.error(error)
  process.exitCode = 1
} finally {
  await writeFile(
    `${out}/negative-trace.json`,
    JSON.stringify({ checksPassed: checks, failed: success ? 0 : 1, trace }, null, 2),
  )
  await browser.close()
}
process.exit(process.exitCode ?? 0)
