/* eslint-disable @typescript-eslint/no-explicit-any -- disposable operator fixture */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'

assert.equal(process.env.RC1_05C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5445/rc105c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/05C'
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
const payload = await getPayload({ config })
const checks: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(`PASS ${checks.length}: ${name}`)
}
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
try {
  const stamp = state.assets[0].title.split(' ').at(-1)
  const owner = (
    await payload.find({
      collection: 'users',
      where: { email: { equals: `owner-${stamp}@05c.test` } },
      limit: 1,
    })
  ).docs[0]!
  const session = await createPasskeySession(
    owner,
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, owner.id, expires],
      )
    },
  )
  const base = 'http://localhost:38970',
    cookie = `renegade-passkey=${session.token}`
  const source = await payload.findByID({
    collection: 'media-assets',
    id: state.assets[1].id,
    depth: 0,
  })
  const bytes = (await mediaStorage(loadConfig()).get(source.storageLocation!))!
  const form = new FormData()
  form.set('siteId', state.siteId)
  form.set('mode', 'new-asset')
  form.set('title', '05C response contract copy')
  form.set('file', new File([new Uint8Array(bytes)], 'response-copy.png', { type: 'image/png' }))
  const response = await fetch(`${base}/api/media/${source.id}`, {
    method: 'PUT',
    headers: { origin: base, cookie },
    body: form,
  })
  const body = (await response.json()) as any
  check(
    'current API returns the canonical replacement identity',
    response.status === 201 && body.replacement?.id && body.replacement.id !== source.id,
  )
  check(
    'current API returns persisted version provenance',
    body.version?.id &&
      body.version.asset === body.replacement.id &&
      body.version.replacesAsset === source.id &&
      body.version.mode === 'new-asset',
  )
  const saved = await payload.findByID({
    collection: 'media-assets',
    id: body.replacement.id,
    depth: 0,
  })
  check(
    'response identity matches persisted bytes and consent',
    saved.checksum === `sha256:${hash(bytes)}` &&
      saved.consentReference === source.consentReference,
  )
  const unchanged = await payload.findByID({ collection: 'media-assets', id: source.id, depth: 0 })
  check(
    'copy does not replace its source',
    unchanged.replaceGloballyWith === source.replaceGloballyWith,
  )
  const delivery = await fetch(`${base}/media/${saved.id}`, { headers: { cookie } })
  check(
    'authorized returned identity delivers actual edited bytes',
    delivery.ok && hash(new Uint8Array(await delivery.arrayBuffer())) === hash(bytes),
  )
  await payload.jobs.run({ queue: 'media', limit: 30 })
  const variants = await payload.find({
    collection: 'media-variants',
    where: { asset: { equals: saved.id } },
    depth: 0,
    limit: 100,
  })
  check(
    'returned asset owns all 20 canonical ready variants',
    variants.docs.length === 20 && variants.docs.every((v) => v.processingState === 'ready'),
  )
  check(
    'orphan copy variants do not grant anonymous access',
    (await fetch(`${base}/media/${saved.id}?variant=hero&format=webp&v=1`)).status === 404,
  )
  const before = await payload.count({ collection: 'media-assets' })
  const denied = await fetch(`${base}/api/media/${saved.id}`, {
    method: 'PUT',
    headers: { origin: base },
    body: form,
  })
  check('anonymous replacement remains denied', denied.status === 403)
  check(
    'denied request creates no media records',
    (await payload.count({ collection: 'media-assets' })).totalDocs === before.totalDocs,
  )
  const publicOriginal = await fetch(`${base}/media/${state.originalId}`)
  check(
    'source article image remains the saved edit',
    publicOriginal.ok &&
      hash(new Uint8Array(await publicOriginal.arrayBuffer())) === state.editedHash,
  )
  await writeFile(
    `${out}/response-contract.json`,
    JSON.stringify(
      {
        passed: checks.length,
        failed: 0,
        checks,
        status: response.status,
        replacement: saved,
        version: body.version,
      },
      null,
      2,
    ),
  )
} finally {
  await payload.db.destroy?.()
}
