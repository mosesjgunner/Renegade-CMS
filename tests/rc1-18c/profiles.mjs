import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { acceptance } from './paths.mjs'

const { scratch, project, root } = acceptance
const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { env, stdio: 'inherit' })
  assert.equal(result.status, 0, `${command} ${args.join(' ')} succeeded`)
}
const env = { ...process.env }
for (const line of readFileSync(`${scratch}/stack.env`, 'utf8').trim().split('\n'))
  delete env[line.split('=')[0]]
const base = parse(
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      '--env-file',
      `${scratch}/stack.env`,
      '-f',
      'compose.production.yaml',
      '-f',
      'compose.network.yaml',
      '-f',
      `${scratch}/compose.yaml`,
      'config',
    ],
    { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ),
)
const commandsPath = `${root}/profile-commands.json`
const commands = existsSync(commandsPath) ? JSON.parse(readFileSync(commandsPath, 'utf8')) : []
function capture(label) {
  for (const service of ['renegade-web', 'renegade-worker']) {
    const result = spawnSync('docker', ['logs', '--timestamps', `${project}-${service}-1`], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0)
    writeFileSync(
      `${scratch}/${label}-${service}-${Date.now()}-complete.log`,
      result.stdout + result.stderr,
      { mode: 0o600 },
    )
  }
}
const start = process.argv[2] ?? 'Lean-default'
const profiles = ['Lean-default', 'Standard-default', 'Lean-all', 'Standard-all']
assert.ok(profiles.includes(start))
for (const profile of process.env.RC118C_PROFILE_EXTRA_ONLY === 'true'
  ? [start]
  : profiles.slice(profiles.indexOf(start))) {
  capture('before-profile-recreation')
  const [deployment, modules] = profile.split('-')
  const config = structuredClone(base)
  for (const service of ['migrate', 'renegade-web', 'renegade-worker']) {
    config.services[service].environment.DEPLOYMENT_PROFILE = deployment
    config.services[service].environment.RENEGADE_MODULES = modules === 'all' ? 'all' : ''
    config.services[service].environment.NETWORKING_ENABLED =
      deployment === 'Standard' && modules === 'all' ? 'true' : 'false'
  }
  const configPath = `${scratch}/profile-compose.yaml`
  writeFileSync(configPath, stringify(config), { mode: 0o600 })
  const compose = ['compose', '-p', project, '--env-file', `${scratch}/stack.env`, '-f', configPath]
  run('docker', [...compose, 'stop', 'local-peer', 'renegade-worker', 'renegade-web'])
  run('docker', [
    ...compose,
    'up',
    '-d',
    '--no-deps',
    '--force-recreate',
    '--wait',
    '--wait-timeout',
    '240',
    'renegade-web',
    'renegade-worker',
    'local-peer',
  ])
  const info = JSON.parse(
    execFileSync('docker', ['inspect', `${project}-renegade-web-1`], { encoding: 'utf8' }),
  )[0]
  assert.ok(info.Config.Env.includes(`DEPLOYMENT_PROFILE=${deployment}`))
  assert.ok(info.Config.Env.includes(`RENEGADE_MODULES=${modules === 'all' ? 'all' : ''}`))
  const registrations = execFileSync(
    'docker',
    [
      'exec',
      `${project}-renegade-web-1`,
      'node',
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "const c=await (await import('./src/payload.config.ts')).default;console.log('REGISTRATIONS '+JSON.stringify({collections:c.collections.map(x=>({slug:x.slug,lockable:x.lockDocuments!==false})),globals:c.globals.map(x=>x.slug),tasks:c.jobs.tasks.map(x=>x.slug)}));process.exit(0)",
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const registry = JSON.parse(
    registrations
      .split('\n')
      .find((x) => x.startsWith('REGISTRATIONS '))
      .slice(14),
  )
  assert.ok(registry.collections.filter((x) => x.lockable).length < 100)
  writeFileSync(
    `${root}/registrations-${profile}.json`,
    JSON.stringify({ profile, image: info.Image, ...registry }, null, 2),
  )
  const phases =
    process.env.RC118C_PROFILE_EXTRA_ONLY === 'true'
      ? ['audience', 'community', 'commerce']
      : [
          'profile',
          ...(profile === 'Lean-all' && process.env.RC118C_PROFILE_CORE_ONLY !== 'true'
            ? [
                'modules-local',
                'modules-editorial',
                'experiences',
                'release',
                'social-local',
                'audit-negative',
                'audit-positive',
              ]
            : []),
        ]
  const resumePhase = profile === start ? (process.argv[3] ?? phases[0]) : phases[0]
  assert.ok(phases.includes(resumePhase))
  for (const phase of phases.slice(phases.indexOf(resumePhase))) {
    const startedAt = new Date().toISOString()
    const result = spawnSync(process.execPath, ['tests/rc1-18c/journey.mjs', phase], {
      env: { ...process.env, RC118C_PROFILE_PROBE: profile },
      stdio: 'inherit',
    })
    commands.push({
      profile,
      phase,
      startedAt,
      finishedAt: new Date().toISOString(),
      image: info.Image,
      exit: result.status,
    })
    writeFileSync(commandsPath, JSON.stringify(commands, null, 2))
    capture(`${profile}-${phase}`)
    assert.equal(result.status, 0, `${profile} ${phase}`)
  }
}
