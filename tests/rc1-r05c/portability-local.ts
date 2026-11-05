// R-05C local variant of the frozen portability driver
// (tests/rc1-05c/portability.ts). Drives the supported CLI
// (src/scripts/portability.ts) against the two disposable local
// databases: export from rc1r05c_main, then create a fresh target site
// in rc1r05c_restore and import with --apply. No product code is
// modified; the driver only rewrites argv, as the frozen driver did.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'

assert.equal(process.env.RC1R05C_DISPOSABLE, 'yes')
const state = JSON.parse(await readFile('docs/rc/evidence/rc1/repairs/R-05C/state.json', 'utf8'))
const importing = process.argv.includes('--restore')
assert.ok(
  process.env.DATABASE_URL?.endsWith(importing ? '/rc1r05c_restore' : '/rc1r05c_main'),
  'portability driver must target its disposable database',
)
const payload = await getPayload({ config })
try {
  const target = importing
    ? await payload.create({
        collection: 'sites',
        data: {
          name: '05C restored',
          slug: `05c-restored-${state.stamp}`,
          lifecycle: 'active',
        } as never,
      })
    : null
  if (target)
    await writeFile(
      'docs/rc/evidence/rc1/repairs/R-05C/restore-target.json',
      JSON.stringify({ siteId: target.id }, null, 2),
    )
  process.argv = [
    process.argv[0],
    'src/scripts/portability.ts',
    importing ? 'import' : 'export',
    '--file',
    'scratch/rc1r05c/media-export.json',
    '--key',
    '05'.repeat(32),
    importing ? '--target-site-id' : '--site-id',
    target?.id ?? state.siteId,
    ...(importing ? ['--apply', '--checkpoint', 'scratch/rc1r05c/import-checkpoint.json'] : []),
  ]
  await import('../../src/scripts/portability')
} finally {
  // Fire-and-forget teardown + explicit exit, as in verify-local.ts: the
  // imported CLI leaves its own Payload instance behind, and lingering
  // handles on this host must not hang the supervisor phase. A failed
  // export/import still propagates as an uncaught non-zero exit before
  // the line below is reached.
  void payload.db.destroy?.()
}
process.exit(0)
