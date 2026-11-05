/* eslint-disable @typescript-eslint/no-explicit-any -- isolated restore verification */
// R-05C restore verification: runs against the SEPARATE restore
// environment (disposable database rc1r05c_restore, its own media
// directory and web/worker processes) after the supported portability
// import. Proves the imported records, remapped references and original
// media bytes survived, and that anonymous public output in the
// restored environment serves the edited image. Derivative variants are
// not part of the portable archive (the export transfer note states
// derivatives must be regenerated); the variant row count is recorded
// as an observation, not gated.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { request as httpsRequest } from 'node:https'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '@payload-config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'

assert.equal(process.env.RC1R05C_DISPOSABLE, 'yes')
assert.ok(
  process.env.DATABASE_URL?.endsWith('/rc1r05c_restore'),
  'restore verifier must target the disposable rc1r05c_restore database',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(path.resolve(process.env.MEDIA_DIR!), path.resolve('scratch/rc1r05c/media-restore'))
const payload = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/repairs/R-05C'
const restoreOrigin = 'https://rc1-05c-restore.test:38774'
const afterRestart = process.argv.includes('--restart')
const checks: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(`PASS ${checks.length}: ${name}`)
}
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
let failed = false
const rawGet = (route: string): Promise<Response> =>
  new Promise((resolve, reject) => {
    const url = new URL(route, restoreOrigin)
    const req = httpsRequest(
      {
        host: '127.0.0.1',
        port: 38774,
        servername: url.hostname,
        rejectUnauthorized: false,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        headers: { host: url.host },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c as Buffer))
        res.on('end', () =>
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0 })),
        )
        res.on('error', reject)
      },
    )
    req.setTimeout(180000, () => req.destroy(new Error('request timeout')))
    req.on('error', reject)
    req.end()
  })
try {
  const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
  const target = JSON.parse(await readFile(`${out}/restore-target.json`, 'utf8'))
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: restoreOrigin,
      canonicalOriginsBySite: { [target.siteId]: restoreOrigin },
      launchState: 'live',
      indexingMode: 'index',
    } as never,
    overrideAccess: true,
  })
  const byTitle = async (title: string) =>
    (
      await payload.find({
        collection: 'media-assets',
        where: { title: { equals: title } },
        depth: 0,
        overrideAccess: true,
      })
    ).docs[0] as any
  const [sourceOriginal, sourceEdited, sourceCopy] = state.assets
  const importedOriginal = await byTitle(sourceOriginal.title)
  const importedEdited = await byTitle(sourceEdited.title)
  const importedCopy = await byTitle(sourceCopy.title)
  check(
    'restored original, edited and copy assets all exist',
    Boolean(importedOriginal && importedEdited && importedCopy),
  )
  check(
    'restored assets live under new ids in the target installation',
    importedOriginal.id !== sourceOriginal.id &&
      importedEdited.id !== sourceEdited.id &&
      importedCopy.id !== sourceCopy.id,
  )
  check(
    'restored asset checksums match the source records',
    importedOriginal.checksum === sourceOriginal.checksum &&
      importedEdited.checksum === sourceEdited.checksum &&
      importedCopy.checksum === sourceCopy.checksum,
  )
  check(
    'restored edited bytes are byte-identical in restore storage',
    hash((await mediaStorage(loadConfig()).get(importedEdited.storageLocation))!) ===
      state.editedHash,
  )
  const relId = (v: any) => (typeof v === 'object' && v !== null ? v.id : v)
  check(
    'restored replacement reference remapped to the imported edited asset',
    String(relId(importedOriginal.replaceGloballyWith)) === String(importedEdited.id),
  )
  check(
    'restored assets are scoped to the target site',
    [importedOriginal, importedEdited, importedCopy].every(
      (a) => String(relId(a.site)) === String(target.siteId),
    ),
  )
  const content = (
    await payload.find({
      collection: 'content',
      where: { slug: { equals: `05c-edited-${state.stamp}` } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as any
  check('restored article exists', Boolean(content))
  check(
    'restored article hero reference remapped to the imported original asset',
    String(relId(content.heroMedia)) === String(importedOriginal.id),
  )
  check(
    'restored article is published',
    content.status === 'published' || content._status === 'published',
  )
  const articleResponse = await rawGet(content.canonicalPath)
  const articleText = await articleResponse.text()
  check(
    'anonymous restored article renders with the edited photograph context',
    articleResponse.ok && articleText.includes('05C edited photograph'),
  )
  const mediaResponse = await rawGet(`/media/${importedOriginal.id}`)
  check(
    'anonymous restored public original URL resolves the edited bytes',
    mediaResponse.ok &&
      hash(new Uint8Array(await mediaResponse.arrayBuffer())) === state.editedHash,
  )
  const variantCount = await payload.count({
    collection: 'media-variants',
    where: { asset: { equals: importedEdited.id } },
    overrideAccess: true,
  })
  await writeFile(
    `${out}/${afterRestart ? 'restore-restart' : 'restore'}.json`,
    JSON.stringify(
      {
        passed: checks.length,
        failed: 0,
        checks,
        observations: {
          importedIds: {
            original: importedOriginal.id,
            edited: importedEdited.id,
            copy: importedCopy.id,
            content: content.id,
          },
          importedEditedVariantRows: variantCount.totalDocs,
        },
      },
      null,
      2,
    ),
  )
} catch (error) {
  failed = true
  await writeFile(
    `${out}/${afterRestart ? 'restore-restart' : 'restore'}-failure.json`,
    JSON.stringify({ passed: checks.length, failed: 1, checks, error: String(error) }, null, 2),
  )
} finally {
  // Fire-and-forget teardown + explicit exit, as in verify-local.ts: all
  // evidence writes above are awaited, and lingering Payload handles on
  // this host must not hang the supervisor phase.
  void payload.db.destroy?.()
}
process.exit(failed ? 1 : 0)
