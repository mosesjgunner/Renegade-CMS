import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { migrations } from '../../src/migrations'
import { UPGRADE_BASELINE } from '../../src/scripts/verify-upgrade-migration'

describe('previous-release upgrade acceptance', () => {
  it('keeps an explicit, advanceable pre-Second-Pass upgrade boundary', () => {
    expect(migrations.findIndex(({ name }) => name === UPGRADE_BASELINE)).toBeGreaterThanOrEqual(0)
    expect(migrations.at(-1)?.name).toBe('20260831_190000_phase_b_integrations_id_defaults')
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
