import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'

assert.equal(process.env.RC1_05C_DISPOSABLE, 'yes')
const state = JSON.parse(await readFile('docs/rc/evidence/rc1/18-pass/05C/state.json', 'utf8'))
const importing = process.argv.includes('--restore')
assert.equal(
  process.env.DATABASE_URL,
  importing
    ? 'postgresql://postgres:postgres@127.0.0.1:5445/rc105c_restore_release_acceptance'
    : 'postgresql://postgres:postgres@127.0.0.1:5445/rc105c_release_acceptance',
)
const payload = await getPayload({ config })
try {
  const target = importing
    ? await payload.create({
        collection: 'sites',
        data: { name: '05C restored', slug: '05c-restored', lifecycle: 'active' } as never,
      })
    : null
  if (target)
    await writeFile(
      'docs/rc/evidence/rc1/18-pass/05C/restore-target.json',
      JSON.stringify({ siteId: target.id }),
    )
  process.argv = [
    process.argv[0],
    'src/scripts/portability.ts',
    importing ? 'import' : 'export',
    '--file',
    'scratch/rc105c-20261018/media-export.json',
    '--key',
    '05'.repeat(32),
    importing ? '--target-site-id' : '--site-id',
    target?.id ?? state.siteId,
    ...(importing
      ? ['--apply', '--checkpoint', 'scratch/rc105c-20261018/import-checkpoint.json']
      : []),
  ]
  await import('../../src/scripts/portability')
} finally {
  await payload.db.destroy?.()
}
