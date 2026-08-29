export type ReleaseVerificationEnvironment = {
  databaseUrl: string
  upgradeMigrationDatabaseUrl: string
}

export function releaseVerificationEnvironment(
  env: Record<string, string | undefined> = process.env,
): ReleaseVerificationEnvironment {
  const required = [
    'DATABASE_URL',
    'UPGRADE_MIGRATION_DATABASE_URL',
    'PAYLOAD_SECRET',
    'APP_URL',
    'SMOKE_TEST_TOKEN',
  ] as const
  const missing = required.filter((key) => !env[key])
  const invalid: string[] = [...missing]
  const databaseUrl = env.DATABASE_URL ?? ''
  const upgradeMigrationDatabaseUrl = env.UPGRADE_MIGRATION_DATABASE_URL ?? ''

  if (!isDedicatedDatabase(databaseUrl, '_release_acceptance')) invalid.push('DATABASE_URL')
  if (!isDedicatedDatabase(upgradeMigrationDatabaseUrl, '_upgrade_acceptance')) {
    invalid.push('UPGRADE_MIGRATION_DATABASE_URL')
  }
  if (databaseUrl && databaseUrl === upgradeMigrationDatabaseUrl) {
    invalid.push('DATABASE_URL and UPGRADE_MIGRATION_DATABASE_URL must be different')
  }
  if (env.SMOKE_TEST_TOKEN && env.SMOKE_TEST_TOKEN.length < 24) invalid.push('SMOKE_TEST_TOKEN')
  if (env.PAYLOAD_SECRET && env.PAYLOAD_SECRET.length < 32) invalid.push('PAYLOAD_SECRET')
  if (env.NODE_ENV === 'production')
    invalid.push('NODE_ENV must not be production for guarded smoke routes')

  if (invalid.length) {
    throw new Error(
      `Release verification configuration is invalid: ${[...new Set(invalid)].join(', ')}. ` +
        'Use disposable PostgreSQL databases named *_release_acceptance and *_upgrade_acceptance.',
    )
  }

  return { databaseUrl, upgradeMigrationDatabaseUrl }
}

export function isDedicatedDatabase(url: string, suffix: string): boolean {
  try {
    return (
      /^postgres(ql)?:$/.test(new URL(url).protocol) &&
      new URL(url).pathname.replace(/^\//, '').endsWith(suffix)
    )
  } catch {
    return false
  }
}
