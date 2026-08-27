import { Client } from 'pg'
import { getPayload, type Payload } from 'payload'

import { migrations } from '../migrations'
import { isDedicatedDatabase } from './verification-contract'

type Pool = {
  query: (sql: string) => Promise<{ rows: Array<{ count: string }> }>
}

export async function verifyFreshMigration() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl || !isDedicatedDatabase(databaseUrl, '_release_acceptance')) {
    throw new Error('Set DATABASE_URL to a dedicated database ending in _release_acceptance.')
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(
      'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;',
    )
  } finally {
    await client.end()
  }

  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  try {
    const db = payload.db as Payload['db'] & {
      migrate: (args: { migrations: typeof migrations }) => Promise<void>
      pool: Pool
    }
    await db.migrate({ migrations })
    await db.migrate({ migrations })
    const result = await db.pool.query('SELECT count(*) FROM payload_migrations')
    if (Number(result.rows[0]?.count) !== migrations.length) {
      throw new Error('Fresh migration acceptance did not record every migration exactly once.')
    }
  } finally {
    await payload.db.destroy?.()
  }
}

if (process.argv[1]?.endsWith('verify-fresh-migration.ts')) {
  verifyFreshMigration().then(() => console.log('Fresh migration acceptance passed.'))
}
