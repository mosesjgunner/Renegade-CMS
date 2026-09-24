import { Client } from 'pg'
import { getPayload, type Payload } from 'payload'

import { migrations } from '../migrations'
import { assertPublishingRuntimeSchema } from './assert-publishing-runtime-schema'
import { isDedicatedDatabase } from './verification-contract'

type Pool = {
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>
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
    const column = await db.pool.query(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'events'
        AND column_name = 'required_entitlement'
    `)
    if (
      column.rows.length !== 1 ||
      column.rows[0]?.data_type !== 'jsonb' ||
      column.rows[0]?.is_nullable !== 'YES' ||
      column.rows[0]?.column_default !== null
    ) {
      throw new Error('Fresh migration did not create the optional Events entitlement JSON column.')
    }
    await assertPublishingRuntimeSchema(db.pool)
  } finally {
    await payload.db.destroy?.()
  }
}

if (process.argv[1]?.endsWith('verify-fresh-migration.ts')) {
  verifyFreshMigration()
    .then(() => {
      console.log('Fresh migration acceptance passed.')
      process.exit(0)
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
