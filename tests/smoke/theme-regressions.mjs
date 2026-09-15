/** Preserve demo publication precedence/settings around the existing integration seed. */
import { spawnSync } from 'node:child_process'
import pg from 'pg'
process.loadEnvFile('.env')
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
const settings = (await db.query('SELECT * FROM site_settings')).rows
const publications = (await db.query('SELECT id,status,visibility FROM publications')).rows
let status = 1
try {
  const child = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', 'tests/integration', '--no-file-parallelism'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        RENEGADE_MODULES: 'all',
        RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'true',
      },
    },
  )
  status = child.status ?? 1
} finally {
  for (const row of settings) {
    const keys = Object.keys(row).filter((key) => key !== 'id')
    await db.query(
      `UPDATE site_settings SET (${keys.map((key) => `"${key}"`).join(',')}) = (SELECT ${keys.map((key) => `"${key}"`).join(',')} FROM jsonb_populate_record(NULL::site_settings, $2::jsonb)) WHERE id=$1`,
      [row.id, JSON.stringify(row)],
    )
  }
  await db.query(
    "UPDATE publications SET status='draft' WHERE NOT(id=ANY($1::uuid[])) AND status='active'",
    [publications.map((p) => p.id)],
  )
  for (const row of publications)
    await db.query('UPDATE publications SET status=$2, visibility=$3 WHERE id=$1', [
      row.id,
      row.status,
      row.visibility,
    ])
  await db.end()
}
process.exitCode = status
