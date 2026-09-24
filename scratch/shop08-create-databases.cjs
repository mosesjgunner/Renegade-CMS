const { Client } = require('pg')

async function main() {
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = '/postgres'
  const client = new Client({ connectionString: url.toString() })
  await client.connect()
  try {
    for (const name of ['shop08_f6c3fd4_browser_release_acceptance']) {
      await client.query(`CREATE DATABASE ${name}`)
      console.log(`Created isolated ${name}`)
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
