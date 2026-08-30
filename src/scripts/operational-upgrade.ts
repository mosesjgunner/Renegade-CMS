import { spawn } from 'node:child_process'
import { verifyOperationalBackup } from '../modules/operations/backup'
import {
  assertDestructiveOperationAuthorized,
  createUpgradePlan,
  type UpgradeBackup,
} from '../modules/operations/lifecycle'
import {
  captureDocker,
  has,
  migrationState,
  runDocker,
  value,
  verifyReadiness,
} from './operational-compose'

const targetImageTag = value('--target-image-tag')
const targetVersion = value('--target-version', targetImageTag)
const backupArchive = value('--backup')
const backupOutput = value('--backup-output')
if (!targetImageTag || !targetVersion || Boolean(backupArchive) === Boolean(backupOutput))
  throw new Error(
    'Usage: upgrade:operational -- --target-image-tag <tag> [--target-version <semver>] (--backup <archive>|--backup-output <directory>) [--preflight] --maintenance-window-confirmed',
  )

const target = {
  composeFile: value('--compose-file', 'compose.production.yaml')!,
  envFile: value('--env-file', '.env.production')!,
}
const upgradedTarget = { ...target, imageTag: targetImageTag, appVersion: targetVersion }
const backup: UpgradeBackup = backupArchive
  ? { kind: 'existing', archive: backupArchive }
  : { kind: 'create', output: backupOutput! }
const plan = createUpgradePlan({ targetImageTag, backup })

async function createBackup() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        'tsx',
        'src/scripts/operational-backup.ts',
        '--output',
        backupOutput!,
        '--maintenance-window-confirmed',
        '--compose-file',
        target.composeFile,
        '--env-file',
        target.envFile,
      ],
      { stdio: 'inherit' },
    )
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Pre-upgrade backup failed (${code}).`)),
    )
  })
}

await runDocker(target, ['config', '--quiet'])
const currentMigrations = await migrationState(target)
const currentServices = await captureDocker(target, ['ps', '--format', 'json'])
if (has('--preflight')) {
  if (backup.kind === 'existing') await verifyOperationalBackup(backup.archive)
  console.log(
    JSON.stringify(
      {
        status: 'preflight-ready',
        targetImageTag,
        targetVersion,
        backup: backup.kind,
        currentMigrationState: currentMigrations,
        currentServices: currentServices ? currentServices.split(/\r?\n/) : [],
        plan,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

assertDestructiveOperationAuthorized({
  operation: 'upgrade',
  maintenanceWindowConfirmed: has('--maintenance-window-confirmed'),
})
if (backup.kind === 'existing') await verifyOperationalBackup(backup.archive)
else await createBackup()

let maintenanceActive = false
try {
  await runDocker(upgradedTarget, ['pull', 'migrate', 'renegade-web', 'renegade-worker'])
  await runDocker(target, ['stop', 'renegade-web', 'renegade-worker'])
  maintenanceActive = true
  await runDocker(upgradedTarget, ['run', '--rm', '--no-deps', 'migrate'])
  await runDocker(upgradedTarget, [
    'up',
    '-d',
    '--wait',
    '--no-deps',
    'renegade-web',
    'renegade-worker',
  ])
  await verifyReadiness(upgradedTarget)
  console.log(
    JSON.stringify(
      {
        status: 'upgraded',
        targetImageTag,
        targetVersion,
        migrationsBeforeUpgrade: currentMigrations,
      },
      null,
      2,
    ),
  )
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(
    `Upgrade failed: ${message}${maintenanceActive ? ' Application services remain stopped; inspect the failure or restore the pre-upgrade backup.' : ''}`,
  )
  throw error
}
