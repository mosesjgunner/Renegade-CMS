const { Client } = require('pg')

async function main() {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://renegade:renegade_dev_only@127.0.0.1:5432/renegade',
  })
  await client.connect()
  try {
    await client.query(
      `ALTER TABLE "team_memberships" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();`,
    )
    console.log('Set default gen_random_uuid() on team_memberships.id successfully')
  } catch (err) {
    console.error('Error altering team_memberships:', err.message)
  } finally {
    await client.end()
  }
}

main()
