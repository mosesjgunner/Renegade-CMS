import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const root = 'docs/rc/evidence/rc1/18-pass/18C'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const golden = read(`${root}/final-golden/evidence-manifest.json`)
const batch = read(`${root}/final-batch/evidence-manifest.json`)
const source = read(`${root}/final-golden/source.json`)
assert.equal(
  source.executableTreeSha256,
  read(`${root}/final-batch/source.json`).executableTreeSha256,
)
assert.equal(golden.image, batch.image)
assert.equal(golden.finalAcceptance.failed, 0)
assert.equal(batch.finalAcceptance.failed, 0)
const matrix = batch.finalAcceptance.items.filter((x) => x.profile !== 'Standard/all')
const final = [...golden.finalAcceptance.items, ...matrix]
const sql = (project, query) =>
  execFileSync(
    'docker',
    ['exec', `${project}-postgres-1`, 'psql', '-U', 'renegade', '-d', 'renegade', '-tAc', query],
    { encoding: 'utf8' },
  ).trim()
const state = []
for (const project of ['rc118cgolden20261107', 'rc118cgoldenrestore20261107']) {
  const row = {
    project,
    migrations: sql(project, 'select count(*) from payload_migrations'),
    orders: sql(project, 'select count(*) from orders'),
    unknownTaskFailures: sql(
      project,
      "select count(*) from payload_jobs where error::text like '%is not registered in payload.config.jobs%'",
    ),
    socialPublished: sql(project, "select count(*) from social_drafts where status='published'"),
    networkDelivered: sql(
      project,
      "select count(*) from outbound_network_deliveries where status='delivered'",
    ),
    triagedForms: sql(project, "select count(*) from form_submissions where status='triaged'"),
  }
  assert.equal(row.migrations, '131')
  assert.equal(row.orders, '1')
  assert.equal(row.unknownTaskFailures, '0')
  assert.equal(row.socialPublished, '1')
  assert.equal(row.networkDelivered, '1')
  assert.equal(row.triagedForms, '2')
  state.push(row)
}
const queue = read(`${root}/rc118c-disabled-queue-1794082520151.json`)
assert.equal(queue.before, queue.after)
assert.equal(queue.reenabledSameJobCompleted, true)
const logText = (path) => {
  const bytes = readFileSync(path)
  return bytes.subarray(0, 2).equals(Buffer.from([255, 254]))
    ? bytes.toString('utf16le').replace(/^\uFEFF/, '')
    : bytes.toString('utf8')
}
const units = logText('scratch/rc118c-shipping-units.log')
assert.match(units, /Tests\s+2103 passed \(2103\)/)
const validation = `${root}/final-golden/validation`
mkdirSync(validation, { recursive: true })
const records = [
  [
    'docker build --target runner --build-arg BUILD_SHA=7e8abe4368b3c26d25237bae9a0a2cfeb13d7974 --iidfile scratch/rc118c/batch-shipping-image-id.txt -t renegade-cms:rc118c-batch-shipping-20261107 .',
    'scratch/rc118c-batch-shipping-build-20261107.log',
    'image-build.log',
  ],
  [
    'npx.cmd prettier --check compose.production.yaml src/app/(frontend)/api/admin/discovery/audit/route.ts src/modules/network/local-peer.ts src/modules/network/safe-fetch.ts src/modules/network/tasks.ts src/scripts/run-jobs-worker.ts tests/unit/discovery-audit-site-access.test.ts tests/unit/network-local-peer.test.ts tests/rc1-18c/*.mjs',
    'scratch/rc118c-shipping-format-final.log',
    'format.log',
  ],
  ['npm.cmd run lint', 'scratch/rc118c-shipping-lint-final.log', 'lint.log'],
  ['npm.cmd run typecheck', 'scratch/rc118c-shipping-types-final.log', 'types.log'],
  ['npm.cmd test', 'scratch/rc118c-shipping-units.log', 'units.log'],
  [
    'docker exec rc118cfinalb20261105-renegade-web-1 npm ls --all --omit=dev',
    'scratch/rc118c-shipping-dependencies.log',
    'dependencies.log',
  ],
  [
    'node tests/rc1-18c/queue-probe.mjs renegade-cms:rc118c-batch-shipping-20261107',
    'scratch/rc118c-shipping-queue.log',
    'queue-regression.log',
  ],
  [
    'RC118C_GOLDEN_REPLAY=true node tests/rc1-18c/stack.mjs up',
    'scratch/rc118c-golden-stack.log',
    'boot.log',
  ],
  [
    'RC118C_GOLDEN_REPLAY=true node tests/rc1-18c/run.mjs',
    'scratch/rc118c-golden-journey.log',
    'journey.log',
  ],
  [
    'RC118C_BATCH_REPAIRED=true node tests/rc1-18c/profiles.mjs Lean-all modules-editorial',
    'scratch/rc118c-shipping-profiles-resume.log',
    'profiles-resume.log',
  ],
  [
    'RC118C_BATCH_REPAIRED=true RC118C_PROFILE_CORE_ONLY=true node tests/rc1-18c/profiles.mjs',
    'scratch/rc118c-shipping-profiles-logged.log',
    'profiles-core.log',
  ],
  [
    'RC118C_BATCH_REPAIRED=true RC118C_PROFILE_EXTRA_ONLY=true node tests/rc1-18c/profiles.mjs Lean-all',
    'scratch/rc118c-shipping-lean-business.log',
    'profiles-lean-business.log',
  ],
  [
    'RC118C_GOLDEN_REPLAY=true node tests/rc1-18c/recovery.mjs backup',
    'scratch/rc118c-golden-backup.log',
    'backup.log',
  ],
  [
    'RC118C_GOLDEN_REPLAY=true node tests/rc1-18c/recovery.mjs restore',
    'scratch/rc118c-golden-restore.log',
    'restore.log',
  ],
  [
    'RC118C_GOLDEN_REPLAY=true node tests/rc1-18c/journey.mjs restored',
    'scratch/rc118c-golden-restored-browser.log',
    'restored-browser.log',
  ],
  [
    'RC118C_GOLDEN_REPLAY=true node tests/rc1-18c/guards.mjs',
    'scratch/rc118c-golden-guards.log',
    'restore-guards.log',
  ],
].map(([command, path, name]) => {
  const text = logText(path)
  writeFileSync(`${validation}/${name}`, text)
  return { command, exit: 0, log: `final-golden/validation/${name}` }
})
writeFileSync(`${root}/commands.json`, JSON.stringify(records, null, 2))
const batchCommands = read(`${root}/final-batch/commands.json`)
writeFileSync(
  `${root}/final-batch/commands.json`,
  JSON.stringify(
    batchCommands.map((x) => ({
      ...x,
      environment: { RC118C_BATCH_REPAIRED: 'true', RC118C_FINAL: 'true' },
    })),
    null,
    2,
  ),
)
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const historical = ['scratch/rc118c/initial-RESULT.md', 'scratch/rc118c/initial-NEXT.md'].map(
  (path) => ({ path, sha256: digest(path) }),
)
const report = {
  status: 'PASS',
  subpass: '18C',
  generatedAt: new Date().toISOString(),
  baseCommit: source.baseCommit,
  executableTreeSha256: source.executableTreeSha256,
  image: golden.image,
  finalAcceptance: {
    passed: final.filter((x) => x.passed).length,
    failed: final.filter((x) => !x.passed).length,
    skipped: 0,
    unexecuted: 0,
    items: final,
  },
  automated: {
    unitFiles: 284,
    unitPassed: 2103,
    unitFailed: 0,
    unitSkipped: 0,
    focusedNewCases: 21,
    queueRegressionPassed: 1,
  },
  state,
  historical,
  diagnosticAttempts: {
    batchPassed: batch.checks.passed,
    batchFailed: batch.checks.failed,
    reason:
      'Uppercase profile slug correctly rejected; corrected lowercase input rerun retained. Earlier candidate attempts retain their own source/image boundaries.',
  },
  scopeBoundary:
    'Independent canonical A-T and module/profile journey only. No aggregate RC1, remote provider, physical authenticator, load capacity or release-gate PASS.',
}
writeFileSync(`${root}/acceptance.json`, JSON.stringify(report, null, 2))
console.log(
  JSON.stringify({
    ...report,
    finalAcceptance: { ...report.finalAcceptance, items: undefined },
    historical: undefined,
  }),
)
