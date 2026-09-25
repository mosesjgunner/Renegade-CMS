import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { migrations } from '../../src/migrations'
import { UPGRADE_BASELINE } from '../../src/scripts/verify-upgrade-migration'

describe('previous-release upgrade acceptance', () => {
  it('keeps an explicit, advanceable pre-Second-Pass upgrade boundary', () => {
    const baselineIndex = migrations.findIndex(({ name }) => name === UPGRADE_BASELINE)
    expect(baselineIndex).toBeGreaterThanOrEqual(0)
    // The reported 98-row ledger had no physical Events entitlement column.
    // A repair must remain a later migration so both existing and empty sites receive it.
    expect(
      migrations.findIndex(({ name }) => name === '20260923_090000_events_required_entitlement'),
    ).toBeGreaterThan(baselineIndex)
    expect(
      migrations.findIndex(({ name }) => name === '20260912_050000_pre_05_legacy_site_migration'),
    ).toBeGreaterThanOrEqual(0)
    if (process.env.UPGRADE_MIGRATION_DATABASE_URL) {
      const tsxCLI = path.resolve('node_modules/tsx/dist/cli.mjs')
      const script = path.resolve('src/scripts/verify-upgrade-migration.ts')
      const child = spawnSync(process.execPath, [tsxCLI, script], {
        encoding: 'utf8',
        env: process.env,
        timeout: 60_000,
      })
      expect(child.status, child.stderr).toBe(0)
    }
  }, 60_000)
})
