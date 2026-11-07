import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { acceptance } from './paths.mjs'

const { scratch, root, restoreProject } = acceptance
const backup = readdirSync(`${scratch}/backups`)
  .filter((x) => x.startsWith('renegade-backup-'))
  .sort()
  .at(-1)
assert.ok(backup)
const base = [
  '--import',
  'tsx',
  '--',
  'src/scripts/operational-restore.ts',
  '--archive',
  path.resolve(scratch, 'backups', backup),
  '--target-version',
  '0.1.0',
]
const state = () =>
  execFileSync(
    'docker',
    [
      'exec',
      `${restoreProject}-postgres-1`,
      'psql',
      '-U',
      'renegade',
      '-d',
      'renegade',
      '-tAc',
      "select md5(coalesce((select json_agg(t order by id)::text from content t),'')||coalesce((select json_agg(t order by id)::text from orders t),''))",
    ],
    { encoding: 'utf8' },
  ).trim()
const before = state()
const checks = []
const env = { ...process.env }
for (const line of readFileSync(`${scratch}/restore.env`, 'utf8').split('\n'))
  if (line.includes('=')) delete env[line.split('=')[0]]
for (const [name, args, pattern] of [
  [
    'Missing isolation and authorization flags',
    [],
    /Restore requires --isolated and --authorize-restore/,
  ],
  [
    'Non-isolated Compose target',
    ['--isolated', '--authorize-restore', '--compose-file', 'compose.production.yaml'],
    /Restore refuses a non-isolated Compose target/,
  ],
  [
    'Running populated target',
    [
      '--isolated',
      '--authorize-restore',
      '--compose-file',
      `${scratch}/isolated-restore-compose.yaml`,
      '--env-file',
      `${scratch}/restore.env`,
    ],
    /Restore refuses an isolated target with an application service already running/,
  ],
]) {
  const result = spawnSync(process.execPath, [...base, ...args], {
    encoding: 'utf8',
    env,
  })
  const output = result.stdout + result.stderr
  assert.notEqual(result.status, 0, name)
  assert.match(output, pattern)
  assert.equal(state(), before)
  checks.push({
    name,
    passed: true,
    command: `node ${[...base, ...args].join(' ')}`,
    expectedExit: 'nonzero',
    exit: result.status,
    protectedBefore: before,
    protectedAfter: state(),
  })
  console.log(`PASS ${name}`)
}
writeFileSync(`${root}/restore-guard-checks.json`, JSON.stringify(checks, null, 2))
