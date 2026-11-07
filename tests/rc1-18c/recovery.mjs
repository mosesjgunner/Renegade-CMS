import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { acceptance } from './paths.mjs'

const { final, scratch, project, restoreProject, restoreSubnet, imageTag } = acceptance
const action = process.argv[2]
assert.ok(['backup', 'restore'].includes(action))
const env = { ...process.env }
for (const name of [
  'POSTGRES_PASSWORD',
  'PAYLOAD_SECRET',
  'APP_URL',
  'PROXY_MODE',
  'BUILD_SHA',
  'RENEGADE_IMAGE',
  'RENEGADE_IMAGE_TAG',
  'RENEGADE_RESTORE_INSTANCE',
  'RENEGADE_NETWORK_SUBNET',
])
  delete env[name]
const run = (args) => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--', ...args], {
    env,
    stdio: 'inherit',
  })
  assert.equal(result.status, 0, `${args[0]} succeeded`)
}
if (action === 'backup') {
  const root = path.resolve(scratch, 'backups')
  assert.ok(root.startsWith(path.resolve(scratch) + path.sep))
  mkdirSync(root, { recursive: true })
  const config = execFileSync(
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
  )
  writeFileSync(`${scratch}/operational-compose.yaml`, config, { mode: 0o600 })
  run([
    'src/scripts/operational-backup.ts',
    '--output',
    root,
    '--env-file',
    `${scratch}/stack.env`,
    '--compose-file',
    `${scratch}/operational-compose.yaml`,
    '--maintenance-window-confirmed',
  ])
} else {
  const envFile = `${scratch}/restore.env`
  if (!existsSync(envFile)) {
    assert.equal(
      execFileSync(
        'docker',
        [
          'ps',
          '-a',
          '--filter',
          `label=com.docker.compose.project=${restoreProject}`,
          '--format',
          '{{.Names}}',
        ],
        { encoding: 'utf8' },
      ).trim(),
      '',
    )
    run([
      'src/scripts/prepare-restore-environment.ts',
      '--env-file',
      envFile,
      '--app-url',
      'https://rc118c.example.test:3443',
      '--image-tag',
      imageTag,
    ])
    const original = readFileSync(envFile, 'utf8')
      .replace('PROXY_MODE=direct', 'PROXY_MODE=trusted')
      .replace(
        'RENEGADE_RESTORE_WEB_BIND=127.0.0.1:3300',
        'RENEGADE_RESTORE_WEB_BIND=127.0.0.1:3430',
      )
    writeFileSync(
      envFile,
      original +
        `\nRENEGADE_RESTORE_INSTANCE=${restoreProject}\nRENEGADE_NETWORK_SUBNET=${restoreSubnet}\nBUILD_SHA=7e8abe4368b3c26d25237bae9a0a2cfeb13d7974\nRENEGADE_IMAGE=renegade-cms\n`,
      { mode: 0o600 },
    )
  }
  const config = execFileSync(
    'docker',
    [
      'compose',
      '-p',
      restoreProject,
      '--env-file',
      envFile,
      '-f',
      'compose.restore.yaml',
      '-f',
      'compose.network.yaml',
      'config',
    ],
    { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const restoreConfig = parse(config)
  if (final) {
    const base = process.cwd().replaceAll('\\', '/')
    for (const service of ['migrate', 'renegade-web', 'renegade-worker']) {
      restoreConfig.services[service].environment.NODE_EXTRA_CA_CERTS = '/app/acceptance-ca.pem'
      restoreConfig.services[service].volumes.push({
        type: 'bind',
        source: `${base}/scratch/rc118c-tls/cert.pem`,
        target: '/app/acceptance-ca.pem',
        read_only: true,
      })
    }
    restoreConfig.services['tls-proxy'] = {
      image: 'node:24-alpine',
      command: ['node', '/proxy.mjs'],
      ports: ['127.0.0.1:3443:3443'],
      volumes: [
        `${base}/tests/rc1-18c/container-proxy.mjs:/proxy.mjs:ro`,
        `${base}/scratch/rc118c-tls:/tls:ro`,
      ],
      networks: { default: { aliases: ['rc118c.example.test'] } },
    }
  }
  writeFileSync(`${scratch}/isolated-restore-compose.yaml`, stringify(restoreConfig), {
    mode: 0o600,
  })
  const backups = readdirSync(`${scratch}/backups`)
    .filter((name) => name.startsWith('renegade-backup-'))
    .sort()
  assert.ok(backups.length)
  const archive = path.resolve(scratch, 'backups', backups.at(-1))
  assert.ok(archive.startsWith(path.resolve(scratch, 'backups') + path.sep))
  run([
    'src/scripts/operational-restore.ts',
    '--archive',
    archive,
    '--target-version',
    '0.1.0',
    '--env-file',
    envFile,
    '--compose-file',
    `${scratch}/isolated-restore-compose.yaml`,
    '--isolated',
    '--authorize-restore',
  ])
  if (final) {
    execFileSync('docker', ['stop', `${project}-tls-proxy-1`], { stdio: 'inherit' })
    execFileSync(
      'docker',
      [
        'compose',
        '-p',
        restoreProject,
        '--env-file',
        envFile,
        '-f',
        `${scratch}/isolated-restore-compose.yaml`,
        'up',
        '-d',
        '--no-deps',
        'tls-proxy',
      ],
      { env, stdio: 'inherit' },
    )
  } else writeFileSync(`${scratch}/proxy-target.json`, JSON.stringify({ port: 3430 }))
}
