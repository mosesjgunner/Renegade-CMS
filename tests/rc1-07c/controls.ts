/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator acceptance */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
assert.equal(process.env.RC1_07C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5451/rc107c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/07C'
const base = 'http://localhost:38985'
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
const user = await payload.findByID({ collection: 'users', id: state.owner })
const session = await createPasskeySession(
  user,
  loadConfig().payloadSecret,
  async (id, expires) => {
    await payload.db.pool.query(
      'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
      [id, user.id, expires],
    )
  },
)
const cookie = `renegade-passkey=${session.token}; renegade-active-site=${state.site}`
const trace: any[] = []
let passed = 0
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  passed++
  trace.push({ name, passed: true })
  console.log(`PASS ${passed}: ${name}`)
}
const read = (id: string) => payload.findByID({ collection: 'content-releases', id, depth: 0 })
async function api(path: string, method = 'GET', data?: unknown, expected = 200, origin = base) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { origin, cookie, 'content-type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
    redirect: 'manual',
  })
  const text = await response.text()
  trace.push({ path, method, status: response.status })
  assert.equal(response.status, expected, `${method} ${path}: ${text.slice(0, 500)}`)
  return JSON.parse(text)
}
let succeeded = false
try {
  const before = await read(state.release)
  await api(
    `/api/admin/releases/${state.release}`,
    'POST',
    { action: 'rollback', reason: 'Acceptance safety negative' },
    400,
  )
  check(
    'completed channel sends cannot claim automatic rollback; release unchanged',
    JSON.stringify(before) === JSON.stringify(await read(state.release)),
  )
  await api(
    `/api/admin/releases/${state.release}`,
    'POST',
    { action: 'retry' },
    403,
    'https://foreign.rc107c.test',
  )
  check(
    'cross-origin release mutation denied with full release unchanged',
    JSON.stringify(before) === JSON.stringify(await read(state.release)),
  )
  await Promise.all(
    [1, 2].map(() => api(`/api/admin/releases/${state.release}`, 'POST', { action: 'execute' })),
  )
  check(
    'concurrent completed release replays leave all checkpoints unchanged',
    JSON.stringify(before) === JSON.stringify(await read(state.release)),
  )
  const asset = await payload.findByID({ collection: 'media-assets', id: state.media, depth: 0 })
  const original = await fetch(`${base}/media/${state.media}`, { headers: { cookie } })
  check(
    'released media original output matches persisted checksum',
    original.ok &&
      `sha256:${createHash('sha256')
        .update(new Uint8Array(await original.arrayBuffer()))
        .digest('hex')}` === asset.checksum,
  )
  const redirect = await fetch(`${base}/07c-old`, { redirect: 'manual' })
  check(
    'release redirect serves exact 308 and intended destination',
    redirect.status === 308 && redirect.headers.get('location')?.endsWith('/07c-launch'),
  )
  // Correct the deliberately preservable unavailable fixture through ordinary native edits.
  // The completed release is retained; a new approved release publishes these new revisions.
  const earlierPresentation = JSON.parse(
    await readFile(`${out}/presentation-persistence.json`, 'utf8'),
  )
  const pageId = before.artifacts.find((item: any) => item.targetType === 'page').targetId
  const corrected: any[] = []
  for (const [id, title, headingLevel] of [
    [pageId, '07C launch page', 'h1'],
    [earlierPresentation.layout.id, '07C coordinated header', 'h2'],
  ]) {
    const row = await payload.findByID({ collection: 'page-layouts', id, depth: 0 })
    const edited = (
      await api(`/api/page-layouts/${id}`, 'PATCH', {
        blocks: [
          {
            id: `supported-${id}`,
            component: 'publisher.cta',
            componentVersion: 1,
            props: { title, headingLevel, body: 'Approved coordinated presentation copy' },
          },
        ],
        unknownBlocks: [],
        revision: row.revision + 1,
      })
    ).doc
    corrected.push(edited)
  }
  const layout = corrected[1]
  const release = (
    await api('/api/admin/releases', 'POST', {
      siteId: state.site,
      name: '07C presentation operator proof',
    })
  ).release
  for (const [index, target] of corrected.entries())
    await api(`/api/admin/releases/${release.id}`, 'POST', {
      action: 'pin-artifact',
      artifact: {
        targetType: index ? 'presentation' : 'page',
        targetId: target.id,
        title: target.name,
        pinnedRevisionSequence: target.revision,
        pinnedHash: 'operator-label',
      },
    })
  await api(`/api/admin/releases/${release.id}`, 'POST', { action: 'submit-review' })
  await api(`/api/admin/releases/${release.id}`, 'POST', { action: 'approve' })
  await api(`/api/admin/releases/${release.id}`, 'POST', { action: 'execute' })
  const published = await payload.findByID({ collection: 'page-layouts', id: layout.id, depth: 0 })
  check(
    'presentation release publishes exact persisted global snapshot through operator API',
    (await read(release.id)).status === 'completed' &&
      published.status === 'published' &&
      JSON.stringify(published.publishedPresentation).includes('07C coordinated header'),
  )
  const page = await fetch(`${base}/07c-launch`)
  const html = await page.text()
  check(
    'supported page and global header render exact published content without unavailable fallback',
    page.ok &&
      html.includes('07C launch page') &&
      html.includes('07C coordinated header') &&
      !html.includes('This section is unavailable.'),
  )
  check(
    'new layout revisions retain the original completed release and single public page',
    JSON.stringify(before) === JSON.stringify(await read(state.release)) &&
      (
        await payload.count({
          collection: 'page-layouts',
          where: { and: [{ site: { equals: state.site } }, { path: { equals: '/07c-launch' } }] },
        })
      ).totalDocs === 1,
  )
  await writeFile(
    `${out}/presentation-persistence.json`,
    JSON.stringify({ release: await read(release.id), layout: published }, null, 2),
  )
  succeeded = true
} finally {
  await writeFile(
    `${out}/controls-trace.json`,
    JSON.stringify({ passed, succeeded, trace }, null, 2),
  )
  await payload.db.destroy()
}
console.log(`07C controls: ${passed} passed`)
process.exit(0)
