// UXI-13 failure-matrix row: process killed mid-migration (the executable
// proxy for SSH-disconnect / reboot mid-migration on this rig — the VM
// itself is shared and cannot be rebooted for a test).
//
// Method:
//   control DB — verify-fresh-migration.ts runs to completion; schema
//     fingerprint recorded (table count, column count, migration journal).
//   victim DB — the same verifier is spawned and SIGKILLed mid-migration
//     (polled: killed as soon as the journal shows a partial count, with
//     bounded retries if a kill lands late). The partial state is recorded.
//   resume — `payload migrate` (no schema drop) runs on the victim; the
//     fingerprint must then equal the control EXACTLY. Any divergence is a
//     FAIL with both fingerprints printed.
//
// Usage: DATABASE_URL=<base url> node tests/installer/uxi13-migration-interruption.mjs
// Scratch DBs are named uxi13_{control,victim}_release_acceptance (the
// verifier contract requires the _release_acceptance suffix) and are
// created if the connecting role may create databases.

import { spawn } from 'node:child_process'
import { Client } from 'pg'

const base = process.env.DATABASE_URL
if (!base) {
  console.error('DATABASE_URL is required (any database on the target server).')
  process.exit(2)
}

const CONTROL = 'uxi13_control_release_acceptance'
const VICTIM = 'uxi13_victim_release_acceptance'

function urlFor(dbName) {
  const u = new URL(base)
  u.pathname = `/${dbName}`
  return u.toString()
}

async function admin(sql) {
  const client = new Client({ connectionString: base })
  await client.connect()
  try {
    return await client.query(sql)
  } finally {
    await client.end()
  }
}

async function ensureDb(name) {
  const found = await admin(`SELECT 1 FROM pg_database WHERE datname = '${name}'`)
  if (found.rowCount === 0) {
    await admin(`CREATE DATABASE "${name}"`)
    console.log(`created scratch database ${name}`)
  }
}

async function fingerprint(dbName) {
  const client = new Client({ connectionString: urlFor(dbName) })
  await client.connect()
  try {
    const tables = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const columns = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public'`,
    )
    let journal = { count: 0, hash: null }
    const hasJournal = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payload_migrations'`,
    )
    if (hasJournal.rowCount > 0) {
      const j = await client.query(
        `SELECT count(*)::int AS n, md5(string_agg(name, ',' ORDER BY name)) AS hash FROM payload_migrations`,
      )
      journal = { count: j.rows[0].n, hash: j.rows[0].hash }
    }
    return { tables: tables.rows[0].n, columns: columns.rows[0].n, journal }
  } finally {
    await client.end()
  }
}

function run(cmd, args, env, { killWhen } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    let killed = false
    let timer = null
    if (killWhen) {
      timer = setInterval(async () => {
        try {
          if (await killWhen()) {
            killed = true
            process.kill(-child.pid, 'SIGKILL')
            clearInterval(timer)
          }
        } catch {
          /* polling races are expected while the schema is being rebuilt */
        }
      }, 60)
    }
    child.on('close', (code, signal) => {
      if (timer) clearInterval(timer)
      resolve({ code, signal, killed, out: out.slice(-800) })
    })
  })
}

const verifier = ['tsx', 'src/scripts/verify-fresh-migration.ts']

async function main() {
  await ensureDb(CONTROL)
  await ensureDb(VICTIM)

  console.log('— control: fresh migration to completion')
  const controlRun = await run('npx', verifier, { DATABASE_URL: urlFor(CONTROL) })
  if (controlRun.code !== 0) {
    console.error('CONTROL RUN FAILED — harness problem, not a product verdict')
    console.error(controlRun.out)
    process.exit(2)
  }
  const controlFp = await fingerprint(CONTROL)
  console.log('control fingerprint:', JSON.stringify(controlFp))
  const totalMigrations = controlFp.journal.count

  console.log('— victim: fresh migration, SIGKILL mid-flight')
  let partial = null
  for (let attempt = 1; attempt <= 3 && !partial; attempt++) {
    await admin(`DROP DATABASE IF EXISTS "${VICTIM}"`)
    await admin(`CREATE DATABASE "${VICTIM}"`)
    const victimRun = await run(
      'npx',
      verifier,
      { DATABASE_URL: urlFor(VICTIM) },
      {
        killWhen: async () => {
          const fp = await fingerprint(VICTIM).catch(() => null)
          return fp !== null && fp.journal.count > 0 && fp.journal.count < totalMigrations
        },
      },
    )
    const fp = await fingerprint(VICTIM).catch(() => null)
    console.log(
      `attempt ${attempt}: killed=${victimRun.killed} signal=${victimRun.signal} journalAtStop=${fp?.journal.count ?? 'n/a'}/${totalMigrations}`,
    )
    if (victimRun.killed && fp && fp.journal.count < totalMigrations) partial = fp
  }
  if (!partial) {
    console.log(
      'INCONCLUSIVE: could not land a kill inside the migration window in 3 attempts (migrations on this rig complete in seconds). Row verdict must stay PARTIAL with this note.',
    )
    process.exit(3)
  }
  console.log('partial fingerprint at kill:', JSON.stringify(partial))

  console.log('— victim: resume with payload migrate (no schema drop)')
  const resume = await run('npm', ['run', 'db:migrate'], { DATABASE_URL: urlFor(VICTIM) })
  if (resume.code !== 0) {
    console.error('RESUME FAILED')
    console.error(resume.out)
    process.exit(1)
  }
  const resumedFp = await fingerprint(VICTIM)
  console.log('resumed fingerprint:', JSON.stringify(resumedFp))

  const equal =
    resumedFp.tables === controlFp.tables &&
    resumedFp.columns === controlFp.columns &&
    resumedFp.journal.count === controlFp.journal.count &&
    resumedFp.journal.hash === controlFp.journal.hash
  console.log(
    equal ? 'RESULT: PASS — resumed schema identical to control' : 'RESULT: FAIL — divergence',
  )
  process.exit(equal ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
