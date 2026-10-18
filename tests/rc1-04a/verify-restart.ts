import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import { request } from '@playwright/test'
import config from '@payload-config'
assert.equal(process.env.RC1_04A_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5438/rc104a_release_acceptance'))
const out = process.env.RC1_04A_EVIDENCE_DIR ?? 'docs/rc/evidence/rc1/18-pass/04A'
const payload = await getPayload({ config })
const api = await request.newContext({
  baseURL: 'https://localhost:38909',
  ignoreHTTPSErrors: true,
  timeout: 180000,
})
const trace: string[] = []
const check = (name: string, ok: unknown) => {
  assert.ok(ok, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}
let succeeded = false
try {
  const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
  const row = await payload.findByID({ collection: 'page-layouts', id: state.id, depth: 0 })
  check(
    'exact five-block UI layout survives PostgreSQL and web restart',
    JSON.stringify(row.blocks) === JSON.stringify(state.blocks),
  )
  check('UI revision survives PostgreSQL and web restart', row.revision === state.revision)
  const response = await api.get('/custom-04a-final')
  const html = await response.text()
  check(
    'published public output survives restart',
    response.status() === 200 &&
      html.includes('04A Welcome') &&
      !html.includes('04A Retried after network failure'),
  )
  const mediaId = state.blocks[2].props.media.id
  const media = await payload.findByID({ collection: 'media-assets', id: mediaId, depth: 0 })
  const bytes = await api.get(`/media/${mediaId}`)
  check(
    'public original media bytes survive restart with exact checksum',
    bytes.status() === 200 &&
      'sha256:' +
        createHash('sha256')
          .update(await bytes.body())
          .digest('hex') ===
        media.checksum,
  )
  succeeded = true
} catch (error) {
  console.error(error)
} finally {
  await writeFile(
    `${out}/restart-trace.json`,
    JSON.stringify({ passed: trace.length, failed: succeeded ? 0 : 1, trace }, null, 2),
  )
  await api.dispose()
  await payload.db.destroy?.()
  process.exit(succeeded ? 0 : 1)
}
