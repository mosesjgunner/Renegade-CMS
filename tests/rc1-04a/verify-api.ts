import { isDeepStrictEqual } from 'node:util'
import assert from 'node:assert/strict'
import { writeFile, readFile } from 'node:fs/promises'
import { request } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { loadConfig } from '../../src/modules/core/config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadFixture } from './fixture'
assert.equal(process.env.RC1_04A_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5438/rc104a_release_acceptance'))
const payload = await getPayload({ config })
const out = process.env.RC1_04A_EVIDENCE_DIR ?? 'docs/rc/evidence/rc1/18-pass/04A'
const fixture = await loadFixture(payload, `${out}/fixture.json`)
const owner = await payload.findByID({ collection: 'users', id: fixture.owner })
const session = await createPasskeySession(
  { id: owner.id, email: owner.email },
  loadConfig().payloadSecret,
  async (id, expiresAt) => {
    await payload.db.pool.query(
      'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
      [id, owner.id, expiresAt],
    )
  },
)
const api = await request.newContext({
  baseURL: 'https://localhost:38909',
  ignoreHTTPSErrors: true,
  timeout: 180000,
  extraHTTPHeaders: { cookie: `renegade-passkey=${session.token}` },
})
const anon = await request.newContext({
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
  if (process.argv.includes('--restart')) {
    const state = JSON.parse(await readFile(`${out}/api-state.json`, 'utf8'))
    const row = await payload.findByID({ collection: 'page-layouts', id: state.id, depth: 0 })
    check(
      'operator layout and revision survive database/web restart',
      JSON.stringify(row.blocks) === JSON.stringify(state.blocks) &&
        row.revision === state.revision,
    )
    check(
      'public snapshot survives database/web restart',
      (await (await anon.get(state.path)).text()).includes('Operator published 04A'),
    )
  } else {
    const path = `/operator-04a-${Date.now()}`
    const created = await api.post('/api/page-layouts', {
      data: {
        site: fixture.site,
        path,
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        layoutVersion: 1,
        status: 'draft',
        visibility: 'public',
        blocks: [],
        revision: 1,
        revisionHistory: [],
      },
    })
    assert.equal(created.status(), 201, await created.text())
    const id = (await created.json()).doc.id
    check('supported native API creates a disposable layout', !!id)
    const read = () => payload.findByID({ collection: 'page-layouts', id, depth: 0 })
    const candidate = {
      version: 1,
      id,
      siteId: fixture.site,
      path,
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      status: 'draft',
      revision: 1,
      blocks: [
        {
          id: 'operator-hero',
          component: 'publisher.hero',
          componentVersion: 1,
          props: { title: 'Operator published 04A' },
        },
      ],
      unknownBlocks: [],
    }
    const patch = (layout: unknown, revision: number, publish = false) =>
      api.patch(`/api/layouts/${id}`, { data: { layout, expectedRevision: revision, publish } })
    check('supported layout save returns 200', (await patch(candidate, 1)).status() === 200)
    check(
      'saved block persists in PostgreSQL',
      isDeepStrictEqual((await read()).blocks, candidate.blocks),
    )
    check(
      'staff draft preview renders persisted output',
      (await (await api.get(`/builder/${id}/preview`)).text()).includes('Operator published 04A'),
    )
    const before = JSON.stringify(await read())
    check(
      'null component rejected 422',
      (await patch({ ...candidate, blocks: [null] }, 2)).status() === 422,
    )
    check(
      'non-array blocks rejected 422',
      (await patch({ ...candidate, blocks: {} }, 2)).status() === 422,
    )
    check(
      'unsafe block props rejected 422',
      (
        await patch(
          {
            ...candidate,
            blocks: [{ ...candidate.blocks[0], props: { title: '<script>alert(1)</script>' } }],
          },
          2,
        )
      ).status() === 422,
    )
    check(
      'anonymous edit denied 403',
      (
        await anon.patch(`/api/layouts/${id}`, { data: { layout: candidate, expectedRevision: 2 } })
      ).status() === 403,
    )
    check('stale save rejected 409', (await patch(candidate, 1)).status() === 409)
    check(
      'denied/invalid/stale saves preserve full database row',
      JSON.stringify(await read()) === before,
    )
    const writes = await Promise.all([patch(candidate, 2), patch(candidate, 2)])
    check(
      'concurrent saves serialize to one 200 and one 409',
      writes
        .map((r) => r.status())
        .sort()
        .join(',') === '200,409',
    )
    check('publication command succeeds', (await patch(candidate, 3, true)).status() === 200)
    check(
      'anonymous public route renders actual published output',
      (await (await anon.get(path)).text()).includes('Operator published 04A'),
    )
    const changed = {
      ...candidate,
      blocks: [{ ...candidate.blocks[0], props: { title: 'Private operator draft 04A' } }],
    }
    check('later draft save succeeds', (await patch(changed, 4)).status() === 200)
    check(
      'later draft is absent from public output',
      !(await (await anon.get(path)).text()).includes('Private operator draft 04A'),
    )
    const restored = await api.post(`/api/layouts/${id}/rollback`, {
      data: { targetRevision: 2, expectedRevision: 5 },
    })
    check(
      'rollback command returns canonical persisted row',
      restored.status() === 200 && (await restored.json()).layout.site,
    )
    check(
      'rollback restores exact blocks with a new revision',
      isDeepStrictEqual((await read()).blocks, candidate.blocks) && (await read()).revision === 6,
    )
    check(
      'stale rollback denied 409',
      (
        await api.post(`/api/layouts/${id}/rollback`, {
          data: { targetRevision: 2, expectedRevision: 4 },
        })
      ).status() === 409,
    )
    const final = await read()
    await writeFile(
      `${out}/api-state.json`,
      JSON.stringify({ id, path, revision: final.revision, blocks: final.blocks }, null, 2),
    )
  }
  succeeded = true
} catch (error) {
  console.error(error)
} finally {
  await writeFile(
    `${out}/${process.argv.includes('--restart') ? 'api-restart' : 'api-trace'}.json`,
    JSON.stringify({ passed: trace.length, failed: succeeded ? 0 : 1, trace }, null, 2),
  )
  await api.dispose()
  await anon.dispose()
  await payload.db.destroy?.()
  process.exit(succeeded ? 0 : 1)
}
