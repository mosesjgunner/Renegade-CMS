import { describe, expect, it } from 'vitest'

import { releaseVerificationEnvironment } from '../../src/scripts/verification-contract'
import { runStage } from '../../src/scripts/verify-release'

const valid = {
  DATABASE_URL: 'postgresql://renegade:test@localhost:5432/renegade_release_acceptance',
  UPGRADE_MIGRATION_DATABASE_URL:
    'postgresql://renegade:test@localhost:5432/renegade_upgrade_acceptance',
  PAYLOAD_SECRET: 'release-verification-secret-with-at-least-32-characters',
  APP_URL: 'http://127.0.0.1:3100',
  SMOKE_TEST_TOKEN: 'release-verification-token-24-characters',
}

describe('release verification contract', () => {
  it('requires separate, clearly disposable migration databases without exposing values', () => {
    expect(releaseVerificationEnvironment(valid)).toMatchObject({ databaseUrl: valid.DATABASE_URL })
    expect(() =>
      releaseVerificationEnvironment({
        ...valid,
        DATABASE_URL: valid.UPGRADE_MIGRATION_DATABASE_URL,
      }),
    ).toThrow(/DATABASE_URL and UPGRADE_MIGRATION_DATABASE_URL/)
    expect(() => releaseVerificationEnvironment({ ...valid, PAYLOAD_SECRET: 'short' })).toThrow(
      /PAYLOAD_SECRET/,
    )
  })

  it('propagates a failed child stage', () => {
    expect(() =>
      runStage('deliberate failure', () => {
        throw new Error('child failed')
      }),
    ).toThrow('child failed')
  })
})
