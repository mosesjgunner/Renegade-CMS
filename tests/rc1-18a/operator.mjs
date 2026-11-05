import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Filesystem-only release operator journey. No DB, provider, browser or test authentication.
const directory = process.argv[2] ?? 'docs/rc/evidence/rc1/18-pass/18A'
mkdirSync(directory, { recursive: true })
mkdirSync('scratch/rc118a', { recursive: true })
const artifact = `${directory}/inventory.json`
const commands = []
function run(args, expected) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/release-inventory.ts', ...args],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
  )
  commands.push({
    command: `node --import tsx scripts/release-inventory.ts ${args.join(' ')}`,
    exit: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  })
  assert.equal(result.status, expected, result.stderr)
}
run(['--output', artifact], 0)
const bytes = readFileSync(artifact)
const inventory = JSON.parse(bytes)
assert.equal(inventory.records.length, 66)
assert.equal(inventory.modules.length, 17)
assert.equal(inventory.gates.length, 19)
assert.equal(inventory.journey.length, 20)
assert.equal(inventory.releaseTagAllowed, false)
assert.equal(inventory.inventoryStatus, 'PASS')
assert.deepEqual(inventory.completenessErrors, [])
assert.equal(inventory.records.find((row) => row.id === '15C').result, null)
run(['--check', artifact], 0) // New process re-reads persisted state and recomputes source/evidence.
run(['--require-complete', artifact], 0)
run(['--output', artifact], 1)
assert.deepEqual(readFileSync(artifact), bytes)
const forged = structuredClone(inventory)
forged.status = 'PASS'
forged.releaseTagAllowed = true
writeFileSync('scratch/rc118a/forged.json', JSON.stringify(forged))
run(['--check', 'scratch/rc118a/forged.json'], 1)
const stale = structuredClone(inventory)
stale.source.treeHash = '0'.repeat(64)
writeFileSync('scratch/rc118a/stale.json', JSON.stringify(stale))
run(['--check', 'scratch/rc118a/stale.json'], 1)
run(['--require-ready', artifact], 2)
run(['--check', 'scratch/rc118a/absent.json'], 1)
assert.deepEqual(readFileSync(artifact), bytes)
writeFileSync(
  `${directory}/operator-trace.json`,
  JSON.stringify(
    {
      passed: commands.length,
      failed: 0,
      skipped: 0,
      persistedSha256: createHash('sha256').update(bytes).digest('hex'),
      observed: {
        preceding: inventory.records.length,
        modules: inventory.modules.length,
        routes: inventory.routes.length,
        gates: inventory.gates.length,
        journey: inventory.journey.length,
        status: inventory.status,
        firstBlocker: inventory.firstBlocker,
      },
      commands,
      boundary:
        'Filesystem operator tool; separate process restart/refetch and retry denial. Application role/site/browser/worker/DB acceptance unexecuted in 18A.',
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
)

const link = (name) => `[${name}](${path.posix.relative(directory, name)})`
const lines = [
  '# RC1 18A source-bound release matrix',
  '',
  `18A inventory: **${inventory.inventoryStatus}**. Release: **${inventory.status}**. Tagging prohibited. First release blocker: ${inventory.firstBlocker}.`,
  '',
  `Base SHA: \`${inventory.source.baseCommit}\`. Exact executable/config/test/asset manifest SHA-256: \`${inventory.source.treeHash}\` (${inventory.source.files.length} files in ${link(artifact)}). Documentation and receipts are separately hashed in its inputs. Current accepted image: **none**.`,
  '',
  'Receipt references below preserve historical scoped proof. They do not prove this candidate. No requirement becomes excluded merely because an old module label or receipt says deferred. All 293 current route sources and 1,215 ownership entries are individually listed in inventory.json, with historical reference candidates explicitly unaccepted.',
  '',
  '## Mandatory gates',
  '',
  '| Gate | Capability | Candidate disposition |',
  '| --- | --- | --- |',
  ...inventory.gates.map((row) => `| ${row.gate} | ${row.scope} | ${row.disposition} |`),
  '',
  '## All 66 preceding records',
  '',
  '| Subpass | Historical ledger status | Receipt | Candidate disposition |',
  '| --- | --- | --- | --- |',
  ...inventory.records.map(
    (row) =>
      `| ${row.id} | ${row.ledgerStatus} | ${row.result ? link(row.result) : 'MISSING RESULT'} | ${row.issues.join(', ') || 'historical scoped receipt; final-source proof unproved'} |`,
  ),
  '',
  '## Modules and provider boundaries',
  '',
  ...inventory.registrationProfiles.map(
    (profile) =>
      `${profile.configuration}: ${profile.collections.length} collections, ${profile.globals.length} globals, ${profile.tasks.length} tasks. Source-constructed metadata; deployed acceptance unexecuted. Full slug sets in inventory.json.`,
  ),
  '',
  '| Module | Registered targets (collections/globals/tasks) | Provider boundary | Final-source acceptance |',
  '| --- | --- | --- | --- |',
  ...inventory.modules.map(
    (row) =>
      `| ${row.id} | ${row.collections.length}/${row.globals?.length ?? 0}/${row.tasks?.length ?? 0} | ${row.providerBoundary.type} | Required when enabled; unproved |`,
  ),
  '',
  '## Golden journey A–T',
  '',
  ...inventory.journey.map((row) => `- ${row.step}: ${row.required} — ${row.disposition}.`),
  '',
  '## Approved exclusions and provider claims',
  '',
  ...inventory.approvedExclusions.map(
    (row) =>
      `- ${row.item}: ${link(row.authority)}; hidden/unsupported entry-point checks unexecuted on candidate.`,
  ),
  '',
  inventory.providerPolicy,
  '',
  '## Reconciled contradictions',
  '',
  '- Canonical October Stage 05–07 PASS banners are historical source/image snapshots. Later 17C explicitly fails image dependency inspection; no current image acceptance follows from an old banner.',
  '- 17C continuation at ebbfeeb8 identifies local image sha256:81cb8ae7dd46d96894bfd1dc4f911a76e0055f839011e752f4491f278d7e3578 and npm ls exit 1 (missing monaco-editor/yjs). Current package declarations include these packages; that does not rebuild or validate the packaged image. No image run was performed in 18A.',
  "- 17D has a populated native restore receipt (311 tables/42 media files), superseding the earlier synthetic-only attempt within that receipt's source boundary. It expressly bypasses the Compose CLI layer, uses fixture sessions and a SQL-provisioned protocol credential; it does not establish ordinary enrollment/browser/Compose acceptance of this final candidate.",
  '- Nine repair directories contain newer scoped receipts. Ledger-selected repairs take precedence within scope; originals remain hashed and preserved. No ancestry-only carryover is accepted.',
  '- 12A has a real retained RESULT but no cumulative row. It is inventoried here without silently adding a second ledger change. 15C has commands/manifest/containment but no RESULT or NEXT: no winner/rollback/restart closure may be inferred.',
  '- 09D tag evaluation repair does not close the remaining sourceCampaign/engagement/role/locale/commerce/community projections or general automation. 14A still lacks its completed persisted provider setup/browser/restart journey.',
  '- Calendar/ICS/timeline and public-form deferral labels conflicted with shipping source and canonical scope; corrected module copy. General automation remains unproved, not approved excluded. Bidirectional external calendar sync stays explicitly excluded.',
  '- Synthetic baseline migration/rollback receipts do not establish a customer predecessor upgrade. No universal customer-upgrade claim is approved.',
  '',
  'Operator reproduction: `npm.cmd run release:inventory -- --check docs/rc/evidence/rc1/18-pass/18A/inventory.json`. Readiness check: replace `--check` with `--require-ready` (expected exit 2). Generate into a new filename with `--output`; existing evidence is never overwritten. This tool inventories and denies unproved readiness; it does not certify a release or create a tag.',
  '',
]
writeFileSync(`${directory}/MATRIX.md`, lines.join('\n'), { flag: 'wx' })
console.log(
  JSON.stringify({
    passed: commands.length,
    failed: 0,
    skipped: 0,
    inventory: artifact,
    source: inventory.source.treeHash,
  }),
)
