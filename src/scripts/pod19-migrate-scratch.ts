/**
 * POD-19 helper: apply all migrations to a pod19_* scratch database.
 *
 * Exists because Payload's migration runner uses dynamicImport, which
 * fails under vitest's ESM interop in this repo (the same reason the
 * repo's own fresh-migration check runs under tsx:
 * `npm run test:migrations:fresh`). scripts/pod19-restore-proof.sh
 * runs this against the scratch env before the import suite.
 *
 * Refuses to run against any database whose name does not contain
 * "pod19" — scratch databases only, never the shared acceptance DB.
 */
import { getPayload } from 'payload'

import config from '../payload.config'

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? ''
  if (!databaseUrl.includes('pod19')) {
    throw new Error(
      `pod19-migrate-scratch refuses a non-pod19 database: ${databaseUrl.replace(/:[^:@/]+@/, ':***@')}`,
    )
  }
  const payload = await getPayload({ config })
  await payload.db.migrate()
  console.log('pod19-migrate-scratch: migrations applied')
  await payload.db.destroy?.()
  // Payload keeps pools/timers alive after destroy; exit explicitly
  // (the repo's own tsx migration scripts do the same).
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
