import config from '@payload-config'
import { getPayload } from 'payload'
import { migrations } from '@/migrations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await getPayload({ config })
    const pool = (
      payload.db as unknown as {
        pool?: { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> }
      }
    )?.pool

    // 1. Verify basic site query accessibility
    await payload.find({ collection: 'sites', limit: 1, depth: 0, overrideAccess: true })

    // 2. Migration ledger check: ensure every registered migration has been applied
    if (pool?.query) {
      const migrationRes = await pool.query('SELECT count(*) as count FROM payload_migrations')
      const appliedCount = Number(migrationRes.rows[0]?.count ?? 0)
      if (appliedCount < migrations.length) {
        console.error(
          `Readiness check failed: pending migrations (${appliedCount}/${migrations.length})`,
        )
        return Response.json(
          {
            status: 'not_ready',
            checks: { database: 'ok', migrations: 'pending' },
          },
          { status: 503 },
        )
      }

      // 3. Fast schema validation on critical runtime columns known to drift
      const schemaRes = await pool.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'events' AND column_name = 'required_entitlement')
            OR (table_name = 'scheduled_publish_jobs' AND column_name = 'lease_owner')
          )
      `)
      if (schemaRes.rows.length < 2) {
        console.error('Readiness check failed: critical runtime columns missing in schema')
        return Response.json(
          {
            status: 'not_ready',
            checks: { database: 'ok', schema: 'corrupted' },
          },
          { status: 503 },
        )
      }
    }

    return Response.json({ status: 'ready', checks: { database: 'ok', migrations: 'applied' } })
  } catch (error) {
    // Readiness remains intentionally non-disclosing, but operators need the
    // underlying cause in server logs when a deployment never becomes ready.
    console.error('Readiness database check failed:', error)
    return Response.json(
      { status: 'not_ready', checks: { database: 'unavailable' } },
      { status: 503 },
    )
  }
}
