import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const name = `rc118c-disabled-queue-${Date.now()}`
const project = 'rc118cjourney20261105'
const image = process.argv[2] ?? 'renegade-cms:rc118c-final-20261105'
const query = (text) =>
  execFileSync(
    'docker',
    ['exec', `${project}-postgres-1`, 'psql', '-U', 'renegade', '-d', 'renegade', '-tAc', text],
    { encoding: 'utf8' },
  ).trim()
const output = 'docs/rc/evidence/rc1/18-pass/18C'
execFileSync('docker', ['start', `${project}-postgres-1`], { stdio: 'pipe' })
for (let i = 0; i < 30; i++) {
  try {
    query('select 1')
    break
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}
const info = JSON.parse(
  execFileSync('docker', ['inspect', `${project}-renegade-worker-1`], { encoding: 'utf8' }),
)[0]
const env = info.Config.Env.filter(
  (value) =>
    !value.startsWith('RENEGADE_MODULES=') &&
    !value.startsWith('DEPLOYMENT_PROFILE=') &&
    !value.startsWith('NETWORKING_ENABLED='),
)
const envFile = 'scratch/rc118c/disabled-queue.env'
writeFileSync(
  envFile,
  [...env, 'RENEGADE_MODULES=', 'DEPLOYMENT_PROFILE=Lean', 'NETWORKING_ENABLED=false'].join('\n'),
  { mode: 0o600 },
)
const errors = () =>
  query(
    "select count(*) from payload_jobs where error::text like '%is not registered in payload.config.jobs%'",
  )
const before = errors()
const selected = query(
  "select id from payload_jobs where task_slug in ('webhook-delivery-dispatch','audience-newsletter-dispatch','audience-telecom-dispatch') and completed_at is null and has_error=false and wait_until<=now() order by created_at limit 1",
)
assert.ok(selected, 'A real optional-module job from the ordinary journey remains due and queued')
let reenabled
try {
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      name,
      '--network',
      `${project}_default`,
      '--env-file',
      envFile,
      image,
      'npm',
      'run',
      'jobs:worker',
    ],
    { stdio: 'pipe' },
  )
  console.log(
    'Started isolated Lean/default queue continuation against retained ordinary journey data',
  )
  await new Promise((resolve) => setTimeout(resolve, 45000))
  const after = errors()
  assert.equal(
    query(
      `select completed_at is null and has_error=false from payload_jobs where id='${selected}'`,
    ),
    't',
  )
  const result = {
    image,
    before,
    after,
    preservedOptionalJob: selected,
    container: name,
    elapsedMs: 45000,
  }
  writeFileSync(`${output}/${name}.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  assert.equal(
    after,
    before,
    'Disabling a module must preserve its queued jobs for later re-enable',
  )
  execFileSync('docker', ['stop', name], { stdio: 'pipe' })
  const allEnvFile = 'scratch/rc118c/reenabled-queue.env'
  writeFileSync(allEnvFile, info.Config.Env.join('\n'), { mode: 0o600 })
  reenabled = `${name}-reenabled`
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      reenabled,
      '--network',
      `${project}_default`,
      '--env-file',
      allEnvFile,
      '-e',
      'WORKER_POLL_INTERVAL_MS=1000',
      image,
      'npm',
      'run',
      'jobs:worker',
    ],
    { stdio: 'pipe' },
  )
  for (let i = 0; i < 120; i++) {
    if (
      query(
        `select completed_at is not null and has_error=false from payload_jobs where id='${selected}'`,
      ) === 't'
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  assert.equal(
    query(
      `select completed_at is not null and has_error=false from payload_jobs where id='${selected}'`,
    ),
    't',
  )
  result.reenabledSameJobCompleted = true
  writeFileSync(`${output}/${name}.json`, JSON.stringify(result, null, 2))
  console.log('PASS same preserved job completed normally after module re-enable')
} finally {
  execFileSync(
    'docker',
    ['stop', name, ...(reenabled ? [reenabled] : []), `${project}-postgres-1`],
    { stdio: 'pipe' },
  )
}
