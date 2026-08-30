import { assertDestructiveOperationAuthorized } from '../modules/operations/lifecycle'
import { has, runDocker, value } from './operational-compose'

const target = {
  composeFile: value('--compose-file', 'compose.production.yaml')!,
  envFile: value('--env-file', '.env.production')!,
}

if (has('--enable') === has('--disable'))
  throw new Error(
    'Usage: maintenance:operational -- --enable|--disable [--env-file .env.production]',
  )

if (has('--enable')) {
  assertDestructiveOperationAuthorized({
    operation: 'upgrade',
    maintenanceWindowConfirmed: has('--maintenance-window-confirmed'),
  })
  await runDocker(target, ['stop', 'renegade-web', 'renegade-worker'])
  console.log('Maintenance mode enabled: web and worker are stopped; PostgreSQL remains running.')
} else {
  await runDocker(target, ['up', '-d', '--wait', '--no-deps', 'renegade-web', 'renegade-worker'])
  console.log('Maintenance mode disabled: web and worker are healthy.')
}
