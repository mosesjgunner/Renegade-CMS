import {
  captureDocker,
  composeArgs,
  migrationState,
  value,
  verifyReadiness,
} from './operational-compose'

const target = {
  composeFile: value('--compose-file', 'compose.production.yaml')!,
  envFile: value('--env-file', '.env.production')!,
}

const services = await captureDocker(target, ['ps', '--format', 'json'])
const postgresVersion = await captureDocker(target, [
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'renegade',
  '-d',
  'renegade',
  '-Atc',
  'SHOW server_version',
])
const migrations = await migrationState(target)
let applicationVersion: string | null = null
let ready = false
try {
  applicationVersion = await captureDocker(target, [
    'exec',
    '-T',
    'renegade-web',
    'printenv',
    'APP_VERSION',
  ])
  await verifyReadiness(target)
  ready = true
} catch {
  // Status remains useful while the application is intentionally in maintenance mode.
}

console.log(
  JSON.stringify(
    {
      status: ready ? 'ready' : 'not-ready',
      compose: composeArgs(target).join(' '),
      applicationVersion,
      postgresqlVersion: postgresVersion,
      migrationState: migrations,
      services: services ? services.split(/\r?\n/).map((service) => JSON.parse(service)) : [],
    },
    null,
    2,
  ),
)
