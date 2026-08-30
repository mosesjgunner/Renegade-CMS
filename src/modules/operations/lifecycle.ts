import { gt, valid } from 'semver'

export type UpgradeBackup =
  | { kind: 'existing'; archive: string }
  | { kind: 'create'; output: string }

export type UpgradePlanStep =
  | 'inspect-current-state'
  | 'verify-or-create-backup'
  | 'obtain-target-image'
  | 'enter-maintenance-mode'
  | 'run-migrations'
  | 'start-services'
  | 'verify-health'

function releaseVersion(value: string, label: string) {
  const normalized = valid(value)
  if (!normalized) throw new Error(`${label} must be a valid SemVer release version.`)
  return normalized
}

export function assertRestoreVersionCompatibility(options: {
  archiveVersion: string
  targetVersion: string
}) {
  const archiveVersion = releaseVersion(options.archiveVersion, 'Backup Renegade version')
  const targetVersion = releaseVersion(options.targetVersion, 'Target Renegade version')
  const [archiveMajor] = archiveVersion.split('.')
  const [targetMajor] = targetVersion.split('.')
  if (archiveMajor !== targetMajor)
    throw new Error(
      `Backup version ${archiveVersion} is incompatible with target ${targetVersion}: major versions differ.`,
    )
  if (gt(archiveVersion, targetVersion))
    throw new Error(
      `Backup version ${archiveVersion} cannot be restored into older target ${targetVersion}.`,
    )
}

export function assertRollbackSchemaCompatibility(options: {
  preUpgradeMigrationState: readonly string[]
  currentMigrationState: readonly string[]
}) {
  const expected = [...options.preUpgradeMigrationState].sort()
  const actual = [...options.currentMigrationState].sort()
  if (
    expected.length !== actual.length ||
    expected.some((migration, index) => migration !== actual[index])
  )
    throw new Error(
      'Application-image rollback is unsafe because the migration ledger changed. Restore the pre-upgrade operational backup instead.',
    )
}

export function assertDestructiveOperationAuthorized(options: {
  operation: 'backup' | 'restore' | 'upgrade' | 'rollback'
  maintenanceWindowConfirmed: boolean
}) {
  if (!options.maintenanceWindowConfirmed)
    throw new Error(
      `${options.operation} requires --maintenance-window-confirmed before application services are stopped.`,
    )
}

export function createUpgradePlan(options: {
  targetImageTag: string
  backup: UpgradeBackup
}): readonly UpgradePlanStep[] {
  if (!options.targetImageTag.trim())
    throw new Error('Upgrade requires a non-empty target image tag.')
  if (options.backup.kind === 'existing' && !options.backup.archive.trim())
    throw new Error('Upgrade requires a verified backup archive path.')
  if (options.backup.kind === 'create' && !options.backup.output.trim())
    throw new Error('Upgrade requires a backup output directory.')
  return [
    'inspect-current-state',
    'verify-or-create-backup',
    'obtain-target-image',
    'enter-maintenance-mode',
    'run-migrations',
    'start-services',
    'verify-health',
  ]
}
