import { describe, expect, it } from 'vitest'

import { migrations } from '../../src/migrations'
import {
  UPGRADE_BASELINE,
  verifyUpgradeMigration,
} from '../../src/scripts/verify-upgrade-migration'

describe('previous-release upgrade acceptance', () => {
  it('keeps an explicit, advanceable pre-Second-Pass upgrade boundary', async () => {
    expect(migrations.findIndex(({ name }) => name === UPGRADE_BASELINE)).toBeGreaterThanOrEqual(0)
    expect(migrations.at(-1)?.name).toBe('20260826_053416_second_pass_schema')
    if (process.env.UPGRADE_MIGRATION_DATABASE_URL) await verifyUpgradeMigration()
  })
})
