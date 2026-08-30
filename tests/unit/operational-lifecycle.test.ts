import { describe, expect, it } from 'vitest'
import {
  assertDestructiveOperationAuthorized,
  assertRestoreVersionCompatibility,
  assertRollbackSchemaCompatibility,
  createUpgradePlan,
} from '../../src/modules/operations/lifecycle'

describe('operational lifecycle guards', () => {
  it('accepts same-major forward restore targets and rejects incompatible releases', () => {
    expect(() =>
      assertRestoreVersionCompatibility({ archiveVersion: '1.2.0', targetVersion: '1.3.0' }),
    ).not.toThrow()
    expect(() =>
      assertRestoreVersionCompatibility({ archiveVersion: '1.2.0', targetVersion: '2.0.0' }),
    ).toThrow('major versions differ')
    expect(() =>
      assertRestoreVersionCompatibility({ archiveVersion: '1.2.0', targetVersion: '1.1.0' }),
    ).toThrow('older target')
  })

  it('permits image rollback only when no schema migration has changed the ledger', () => {
    expect(() =>
      assertRollbackSchemaCompatibility({
        preUpgradeMigrationState: ['m02', 'm01'],
        currentMigrationState: ['m01', 'm02'],
      }),
    ).not.toThrow()
    expect(() =>
      assertRollbackSchemaCompatibility({
        preUpgradeMigrationState: ['m01'],
        currentMigrationState: ['m01', 'm02'],
      }),
    ).toThrow('Restore the pre-upgrade operational backup')
  })

  it('requires maintenance confirmation for destructive operations', () => {
    expect(() =>
      assertDestructiveOperationAuthorized({
        operation: 'upgrade',
        maintenanceWindowConfirmed: false,
      }),
    ).toThrow('--maintenance-window-confirmed')
  })

  it('plans one migration phase after backup and before service startup', () => {
    const plan = createUpgradePlan({
      targetImageTag: '1.3.0',
      backup: { kind: 'existing', archive: 'D:/backups/pre-upgrade' },
    })
    expect(plan).toEqual([
      'inspect-current-state',
      'verify-or-create-backup',
      'obtain-target-image',
      'enter-maintenance-mode',
      'run-migrations',
      'start-services',
      'verify-health',
    ])
    expect(plan.filter((step) => step === 'run-migrations')).toHaveLength(1)
    expect(() =>
      createUpgradePlan({ targetImageTag: '', backup: { kind: 'create', output: 'D:/x' } }),
    ).toThrow('non-empty target image tag')
  })
})
