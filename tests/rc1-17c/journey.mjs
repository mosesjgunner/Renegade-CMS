/**
 * RC1 17C acceptance orchestrator (host side).
 *
 * Environment reality on this VM (recorded in RESULT.md): dockerd
 * 29.1.3 runs only with --iptables=false --bridge=none
 * --storage-driver=fuse-overlayfs — the sandbox namespace has no
 * CAP_NET_ADMIN, so Compose bridge networks cannot be created. The
 * proof therefore runs the EXACT production image as individual
 * host-networked containers (web, worker, one-shot migration), which
 * exercises the shipped artifact, its processes and their state
 * honestly; the Compose orchestration layer itself (bridge network,
 * compose healthcheck wiring, service-name DNS) is named unexecuted.
 *
 *  - build: runner + media-heavy targets with BUILD_SHA = HEAD
 *    (BuildKit RUN steps on host networking for proxy egress);
 *  - inspect: image identity, non-root user, embedded provenance,
 *    shipped-source byte identity, runtime dependency graph, secret
 *    sweep (in-image inspector), bridge-network probe (expected
 *    failure, recorded as the environment boundary);
 *  - stack-a: floor-module containers against a disposable host
 *    PostgreSQL database — migration from the image, web ready over
 *    HTTP, fixtures + sessions created by the image itself, media
 *    upload over HTTP, the separate worker container drains a durable
 *    job, anonymous and foreign-site upload denials, operational CLI;
 *  - restart-a: a delayed job queued before a web+worker container
 *    restart still completes afterwards; media bytes, the owner
 *    session and the runtime configuration survive;
 *  - stack-b: a second isolated container pair with
 *    DEPLOYMENT_PROFILE=Lean and RENEGADE_MODULES=commerce,newsletter
 *    registers exactly those modules; adding a media-heavy worker
 *    container does not change web feature registration.
 * Secrets live only in scratch/rc117c (env files, state); traces in
 * the evidence folder never contain them.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const out = 'docs/rc/evidence/rc1/18-pass/17C'
const scratch = 'scratch/rc117c'
mkdirSync(out, { recursive: true })
mkdirSync(scratch, { recursive: true })

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const short = sha.slice(0, 8)
const image = `renegade-cms:rc117c-${short}`
const mediaImage = `renegade-cms-media-heavy:rc117c-${short}`
const DB = 'rc117c_release_acceptance'
const statePath = `${scratch}/state.json`
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2))
const hash = (buf) => createHash('sha256').update(buf).digest('hex')

function run(cmd, args, { env = {}, input, allowFail = false, quiet = false } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env },
    input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (!quiet && res.stdout) process.stdout.write(res.stdout)
  if (res.stderr) process.stderr.write(res.stderr)
  if (res.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${res.status})`)
  }
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

const traces = { image: [], a: [], restart: [], b: [] }
function check(bucket, name, value) {
  assert.ok(value, name)
  traces[bucket].push({ name, passed: true })
  console.log(`PASS ${bucket} ${traces[bucket].length}: ${name}`)
  const file =
    bucket === 'image'
      ? 'image-trace.json'
      : bucket === 'a'
        ? 'journey-trace.json'
        : bucket === 'restart'
          ? 'restart-trace.json'
          : 'stack-b-trace.json'
  writeFileSync(`${out}/${file}`, JSON.stringify(traces[bucket], null, 2))
}

function writeProject(stack, port, { profile, modules }) {
  const envFile = `${scratch}/${stack}.env`
  const payloadSecret = randomBytes(32).toString('hex')
  const lines = [
    `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/${DB}`,
    `PAYLOAD_SECRET=${payloadSecret}`,
    'APP_URL=https://rc117c.example.test',
    'PROXY_MODE=direct',
    `BUILD_SHA=${sha}`,
    'APP_VERSION=0.1.0',
    `PORT=${port}`,
    'HOSTNAME=127.0.0.1',
    `DEPLOYMENT_PROFILE=${profile}`,
    `RENEGADE_MODULES=${modules}`,
    'RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT=false',
    'EMAIL_MODE=disabled',
    'MEDIA_DIR=/app/media',
    'WORKER_POLL_INTERVAL_MS=5000',
    'WORKER_HEARTBEAT_FILE=/tmp/renegade-worker/heartbeat.json',
    'WORKER_HEARTBEAT_MAX_AGE_MS=45000',
    'NODE_ENV=production',
    '',
  ]
  writeFileSync(envFile, lines.join('\n'), { mode: 0o600 })
  return { envFile, port, base: `http://127.0.0.1:${port}` }
}

function startContainer(name, imageName, envFile, { mediaDir, command, extraEnv = {} } = {}) {
  run('docker', ['rm', '-f', name], { allowFail: true, quiet: true })
  const args = [
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'host',
    '--env-file',
    envFile,
    '-v',
    `${path.resolve('tests/rc1-17c')}:/app/tests/rc1-17c:ro`,
  ]
  if (mediaDir) args.push('-v', `${mediaDir}:/app/media`)
  for (const [k, v] of Object.entries(extraEnv)) args.push('-e', `${k}=${v}`)
  args.push(imageName)
  if (command) args.push(...command)
  run('docker', args, { quiet: true })
}

function execIn(name, args, opts = {}) {
  return run('docker', ['exec', name, ...args], opts)
}

function fixture(container, runIdValue, ...args) {
  const res = run(
    'docker',
    [
      'exec',
      '-e',
      `RC117C_RUN_ID=${runIdValue}`,
      container,
      './node_modules/.bin/tsx',
      'tests/rc1-17c/fixture.ts',
      ...args,
    ],
    { quiet: true },
  )
  const line = res.stdout
    .split('\n')
    .filter((entry) => entry.startsWith('FIXTURE_JSON:'))
    .pop()
  assert.ok(line, 'fixture produced no FIXTURE_JSON line')
  return JSON.parse(line.slice('FIXTURE_JSON:'.length))
}

async function waitReady(base, seconds = 240) {
  for (let i = 0; i < seconds; i++) {
    try {
      const r = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(5000) })
      if (r.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function pollJob(container, runIdValue, jobId, seconds = 180) {
  for (let i = 0; i < seconds / 5; i++) {
    const job = fixture(container, runIdValue, 'job', jobId)
    if (job.completedAt) return job
    await new Promise((r) => setTimeout(r, 5000))
  }
  return fixture(container, runIdValue, 'job', jobId)
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function upload(base, cookie, siteId, filename = 'rc117c.png') {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(PNG)], filename, { type: 'image/png' }))
  form.set('siteId', siteId)
  form.set('title', filename)
  const res = await fetch(`${base}/api/media/upload`, {
    method: 'POST',
    headers: { ...(cookie ? { cookie } : {}) },
    body: form,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text }
}

async function phaseBuild() {
  run('docker', ['version'])
  const iid = `${scratch}/image-id.txt`
  run('docker', [
    'build',
    '--network=host',
    '--target',
    'runner',
    '--build-arg',
    `BUILD_SHA=${sha}`,
    '--build-arg',
    'APP_VERSION=0.1.0',
    '--iidfile',
    iid,
    '--tag',
    image,
    '.',
  ])
  state.imageId = readFileSync(iid, 'utf8').trim()
  run('docker', [
    'build',
    '--network=host',
    '--target',
    'media-heavy',
    '--build-arg',
    `BUILD_SHA=${sha}`,
    '--build-arg',
    'APP_VERSION=0.1.0',
    '--tag',
    mediaImage,
    '.',
  ])
  const inspect = JSON.parse(run('docker', ['image', 'inspect', image], { quiet: true }).stdout)[0]
  state.imageInspect = {
    id: inspect.Id,
    repoTags: inspect.RepoTags,
    user: inspect.Config.User,
    labels: inspect.Config.Labels,
    env: inspect.Config.Env,
    created: inspect.Created,
    size: inspect.Size,
  }
  save()
  writeFileSync(`${out}/image-inspect.json`, JSON.stringify(state.imageInspect, null, 2))
  check('image', `production runner image built from clean candidate ${sha}`, state.imageId)
  check('image', 'media-heavy target built from the same Dockerfile', true)
}

async function phaseInspect() {
  const idOut = run('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'id', image], {
    quiet: true,
  }).stdout
  check(
    'image',
    `image default user is unprivileged nextjs (${idOut.trim()})`,
    /uid=1001/.test(idOut),
  )
  const expected = {}
  const shipped = execFileSync('git', ['ls-files', 'src', 'docker'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
  for (const rel of [
    ...shipped,
    'package.json',
    'package-lock.json',
    'next.config.ts',
    'tsconfig.json',
  ])
    expected[rel] = hash(readFileSync(rel))
  writeFileSync(`${scratch}/expected.json`, JSON.stringify(expected))
  const report = JSON.parse(
    run(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '-v',
        `${path.resolve('tests/rc1-17c/inspect-image.mjs')}:/tmp/inspect.mjs:ro`,
        '-v',
        `${path.resolve(scratch, 'expected.json')}:/tmp/expected.json:ro`,
        '--entrypoint',
        'node',
        image,
        '/tmp/inspect.mjs',
      ],
      { quiet: true },
    ).stdout,
  )
  writeFileSync(`${out}/image-inspection.json`, JSON.stringify(report, null, 2))
  check(
    'image',
    'required packaged files present (standalone server, static, public, src, docker, provenance)',
    Object.values(report.files).every(Boolean),
  )
  check(
    'image',
    'embedded root+standalone provenance agree and match the shipped lockfile hash',
    report.provenance.root.sourceSha === sha &&
      report.provenance.standalone.sourceSha === sha &&
      report.provenance.lockfileMatches,
  )
  check(
    'image',
    `shipped source byte-identical to candidate (${report.sourceComparison.compared} files compared)`,
    report.sourceComparison.mismatchCount === 0,
  )
  check(
    'image',
    'runtime dependency graph resolves with next/payload/tsx and no dev toolchain at top level',
    report.dependencies.hasNext &&
      report.dependencies.hasPayload &&
      report.dependencies.hasTsx &&
      report.dependencies.forbiddenPresent.length === 0,
  )
  check(
    'image',
    'secret-pattern sweep of shipped app files is clean and no .env file is packaged',
    report.secrets.hitCount === 0 && report.secrets.envFiles.length === 0,
  )
  const mediaId = run(
    'docker',
    ['run', '--rm', '--network', 'none', '--entrypoint', 'id', mediaImage],
    {
      quiet: true,
    },
  ).stdout
  const ffmpeg = run(
    'docker',
    ['run', '--rm', '--network', 'none', '--entrypoint', 'ffmpeg', mediaImage, '-version'],
    {
      quiet: true,
    },
  ).stdout
  check(
    'image',
    'media-heavy image runs unprivileged and carries ffmpeg',
    /uid=1001/.test(mediaId) && /ffmpeg version/.test(ffmpeg),
  )
  const probe = run('docker', ['network', 'create', 'rc117c-probe'], {
    allowFail: true,
    quiet: true,
  })
  writeFileSync(
    `${out}/bridge-network-probe.txt`,
    `docker network create rc117c-probe -> exit ${probe.status}\n${probe.stderr}\n`,
  )
  if (probe.status === 0) run('docker', ['network', 'rm', 'rc117c-probe'], { quiet: true })
  state.bridgeNetworkProbeExit = probe.status
  save()
}

async function bootStack(bucket, stack, port, options) {
  const cfg = writeProject(stack, port, options)
  const mediaDir = path.resolve(scratch, stack, 'media')
  mkdirSync(mediaDir, { recursive: true })
  run('chown', ['1001:1001', mediaDir], { allowFail: true, quiet: true })
  const migrate = run(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'host',
      '--env-file',
      cfg.envFile,
      image,
      'npm',
      'run',
      'db:migrate',
    ],
    { quiet: true },
  )
  check(
    bucket,
    `${stack}: migration service (image CLI) exits 0 on the disposable database`,
    migrate.status === 0,
  )
  startContainer(`${stack}-web`, image, cfg.envFile, { mediaDir })
  const ready = await waitReady(cfg.base)
  check(bucket, `${stack}: production web container reports ready over HTTP`, ready)
  startContainer(`${stack}-worker`, image, cfg.envFile, {
    mediaDir,
    command: ['npm', 'run', 'jobs:worker'],
  })
  return { ...cfg, mediaDir }
}

async function phaseStackA() {
  const stack = 'rc117ca'
  run('bash', [
    '-c',
    `PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -c "DROP DATABASE IF EXISTS ${DB}" -c "CREATE DATABASE ${DB}"`,
  ])
  const cfg = await bootStack('a', stack, 39181, { profile: 'Standard', modules: '' })
  state.a = { stack, ...cfg, runId: 'rc117ca' }
  const init = fixture(`${stack}-web`, state.a.runId, 'init')
  Object.assign(state.a, init)
  save()
  check(
    'a',
    'floor registration: sites/users/media-assets/payload-jobs present; commerce+newsletter collections absent',
    ['sites', 'users', 'media-assets', 'payload-jobs'].every((c) => init.collections.includes(c)) &&
      !init.collections.includes('products') &&
      !init.collections.includes('subscribers'),
  )
  const anon = await upload(cfg.base, '', init.alphaId)
  check('a', 'anonymous media upload is refused (not 201)', anon.status !== 201)
  const foreign = await upload(cfg.base, init.staffCookie, init.betaId)
  check(
    'a',
    'staff scoped to site Alpha cannot upload into site Beta (403)',
    foreign.status === 403,
  )
  const up = await upload(cfg.base, init.ownerCookie, init.alphaId)
  check(
    'a',
    'owner uploads media over HTTP into site Alpha (201)' +
      (up.status === 201 ? '' : ` - got ${up.status}: ${String(up.text ?? '').slice(0, 200)}`),
    up.status === 201 && up.json?.asset?.id,
  )
  state.a.assetId = String(up.json.asset.id)
  const served = await fetch(`${cfg.base}/media/${state.a.assetId}`, {
    headers: { cookie: init.ownerCookie },
  })
  const bytes = Buffer.from(await served.arrayBuffer())
  state.a.mediaSha256 = hash(bytes)
  check(
    'a',
    'uploaded media serves back byte-identical (sha256 recorded)',
    served.status === 200 && state.a.mediaSha256 === hash(PNG),
  )
  const queued = fixture(`${stack}-web`, state.a.runId, 'queue', '0')
  const job = await pollJob(`${stack}-web`, state.a.runId, queued.jobId)
  check(
    'a',
    'separate worker container drains a durable operations-heartbeat job to completion',
    Boolean(job.completedAt) && !job.hasError,
  )
  const status = execIn(`${stack}-web`, ['npm', 'run', 'db:status'], {
    quiet: true,
    allowFail: true,
  })
  check(
    'a',
    'operational CLI inside the image reports migration status (exit 0)',
    status.status === 0,
  )
  const workerHealth = execIn(`${stack}-worker`, ['node', 'docker/worker-healthcheck.mjs'], {
    quiet: true,
    allowFail: true,
  })
  check('a', 'worker healthcheck passes against the live heartbeat file', workerHealth.status === 0)
  save()
}

async function phaseRestartA() {
  const { stack, base, runId } = state.a
  const delayed = fixture(`${stack}-web`, runId, 'queue', '75')
  state.a.delayedJobId = delayed.jobId
  save()
  run('docker', ['restart', `${stack}-web`, `${stack}-worker`])
  const ready = await waitReady(base)
  check('restart', 'web container reports ready again after restart', ready)
  const me = await fetch(`${base}/api/users/me`, { headers: { cookie: state.a.ownerCookie } })
  const meJson = await me.json().catch(() => null)
  check(
    'restart',
    'pre-restart owner session still authenticates after restart (session state persisted)',
    me.status === 200 && Boolean(meJson?.user?.id),
  )
  const served = await fetch(`${base}/media/${state.a.assetId}`, {
    headers: { cookie: state.a.ownerCookie },
  })
  const bytes = Buffer.from(await served.arrayBuffer())
  check(
    'restart',
    'persistent media bytes are unchanged after restart (volume state survived)',
    served.status === 200 && hash(bytes) === state.a.mediaSha256,
  )
  const job = await pollJob(`${stack}-web`, runId, delayed.jobId, 240)
  check(
    'restart',
    'job queued before the restart (delayed 75s) completes afterwards — queue state not lost',
    Boolean(job.completedAt) && !job.hasError,
  )
  const envOut = execIn(`${stack}-web`, ['printenv', 'BUILD_SHA'], { quiet: true }).stdout.trim()
  check('restart', 'runtime configuration (BUILD_SHA) still applied after restart', envOut === sha)
}

async function phaseStackB() {
  const stack = 'rc117cb'
  const cfg = await bootStack('b', stack, 39182, {
    profile: 'Lean',
    modules: 'commerce,newsletter',
  })
  state.b = { stack, ...cfg, runId: 'rc117cb' }
  const cols = fixture(`${stack}-web`, state.b.runId, 'collections')
  state.b.collections = cols.collections
  save()
  check(
    'b',
    'configured modules register: commerce (products) and newsletter (subscribers) collections present',
    cols.collections.includes('products') && cols.collections.includes('subscribers'),
  )
  check(
    'b',
    'unconfigured modules stay off in the same image (no forum-sections from community)',
    !cols.collections.includes('forum-sections'),
  )
  startContainer(`${stack}-media`, mediaImage, cfg.envFile, {
    mediaDir: cfg.mediaDir,
    command: ['npm', 'run', 'jobs:worker'],
    extraEnv: {
      WORKER_PROFILE: 'media-heavy',
      WORKER_HEARTBEAT_FILE: '/tmp/renegade-worker/media-heavy-heartbeat.json',
    },
  })
  const colsAfter = fixture(`${stack}-web`, state.b.runId, 'collections')
  check(
    'b',
    'adding a media-heavy worker container does not change web feature registration',
    JSON.stringify(colsAfter.collections) === JSON.stringify(cols.collections),
  )
  const ffmpeg = execIn(`${stack}-media`, ['ffmpeg', '-version'], { quiet: true }).stdout
  check(
    'b',
    'media-heavy worker container is up with ffmpeg available',
    /ffmpeg version/.test(ffmpeg),
  )
  save()
}

async function phaseDown() {
  for (const name of [
    'rc117ca-web',
    'rc117ca-worker',
    'rc117cb-web',
    'rc117cb-worker',
    'rc117cb-media',
  ])
    run('docker', ['rm', '-f', name], { allowFail: true, quiet: true })
}

const phase = process.argv[2]
if (phase === 'build') await phaseBuild()
else if (phase === 'inspect') await phaseInspect()
else if (phase === 'stack-a') await phaseStackA()
else if (phase === 'restart-a') await phaseRestartA()
else if (phase === 'stack-b') await phaseStackB()
else if (phase === 'down') await phaseDown()
else if (phase === 'all') {
  await phaseBuild()
  await phaseInspect()
  await phaseStackA()
  await phaseRestartA()
  await phaseStackB()
} else {
  console.error('usage: journey.mjs build|inspect|stack-a|restart-a|stack-b|down|all')
  process.exit(2)
}
