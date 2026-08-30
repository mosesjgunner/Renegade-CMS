import {
  assertDestructiveOperationAuthorized,
  assertRestoreVersionCompatibility,
  assertRollbackSchemaCompatibility,
} from '../modules/operations/lifecycle'
import { verifyOperationalBackup } from '../modules/operations/backup'
import { has, migrationState, runDocker, value, verifyReadiness } from './operational-compose'

const archive = value('--pre-upgrade-backup')
const targetImageTag = value('--target-image-tag')
const targetVersion = value('--target-version', targetImageTag)
if (!archive || !targetImageTag || !targetVersion || !has('--allow-image-rollback'))
  throw new Error(
    'Usage: rollback:operational -- --pre-upgrade-backup <archive> --target-image-tag <tag> [--target-version <semver>] --allow-image-rollback --maintenance-window-confirmed',
  )

assertDestructiveOperationAuthorized({
  operation: 'rollback',
  maintenanceWindowConfirmed: has('--maintenance-window-confirmed'),
})
const target = {
  composeFile: value('--compose-file', 'compose.production.yaml')!,
  envFile: value('--env-file', '.env.production')!,
}
const rollbackTarget = { ...target, imageTag: targetImageTag, appVersion: targetVersion }
const backup = await verifyOperationalBackup(archive)
assertRestoreVersionCompatibility({ archiveVersion: backup.renegade.version, targetVersion })
assertRollbackSchemaCompatibility({
  preUpgradeMigrationState: backup.migrationState,
  currentMigrationState: await migrationState(target),
})

await runDocker(rollbackTarget, ['pull', 'renegade-web', 'renegade-worker'])
await runDocker(target, ['stop', 'renegade-web', 'renegade-worker'])
try {
  await runDocker(rollbackTarget, [
    'up',
    '-d',
    '--wait',
    '--no-deps',
    'renegade-web',
    'renegade-worker',
  ])
  await verifyReadiness(rollbackTarget)
  console.log(
    `Image rollback to ${targetImageTag} verified. No migration was run because the migration ledger is unchanged.`,
  )
} catch (error) {
  console.error(
    'Image rollback failed; restore the pre-upgrade operational backup if recovery is required.',
  )
  throw error
}
