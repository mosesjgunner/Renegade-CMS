const { Client } = require('pg')

const client = new Client({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://renegade:renegade_dev_only@127.0.0.1:5432/renegade',
})

async function main() {
  await client.connect()
  const res = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `)
  console.log('Total tables:', res.rows.length)
  const tables = [
    'members',
    'profiles',
    'discussions',
    'discussion_posts',
    'relationships',
    'notifications',
  ]
  for (const t of tables) {
    const cols = await client.query(
      `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position;
    `,
      [t],
    )
    console.log(`\nTable ${t}:`)
    console.log(cols.rows.map((c) => `${c.column_name} (${c.data_type})`).join(', '))
  }
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
