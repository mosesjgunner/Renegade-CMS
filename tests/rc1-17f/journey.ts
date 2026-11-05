/**
 * RC1 17F — Fresh/upgrade migrations and rollback boundaries.
 *
 * Drives the shipped migration verifiers (fresh, synthetic fixture upgrade,
 * commerce) against dedicated disposable databases, proves the fresh and
 * upgraded schemas converge (drift check), inspects post-baseline migrations
 * for destructive operations, and rehearses the supported rollback boundary
 * natively: a pre-upgrade operational backup is captured at the synthetic
 * baseline with the product's own backup module, the database is upgraded in
 * place, image rollback is refused by the product's lifecycle guard because
 * the migration ledger moved, and the supported recovery — restoring the
 * pre-upgrade archive into an isolated target — is executed and verified.
 *
 * The fixture upgrade is SYNTHETIC schema evidence (RC1-SCOPE.md): it is not
 * a historical customer upgrade, and no customer-upgrade claim is made.
 * The Compose-bound operational CLIs (upgrade:operational /
 * rollback:operational) require Docker, which is unavailable on this VM
 * (17C investigation); their data-plane functions are exercised directly,
 * per the 17C/17D precedent.
 */
import assert from 'node:assert/strict'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const phase = process.argv[2]
const evidenceDir = 'docs/rc/evidence/rc1/18-pass/17F'
const scratch = 'scratch/rc117f'
const FRESH_URL = process.env.FRESH_URL!
const UPGRADE_URL = process.env.UPGRADE_URL!
const COMMERCE_URL = process.env.COMMERCE_URL!
const ROLLBACK_URL = process.env.ROLLBACK_URL!
const RESTORED_URL = process.env.RESTORED_URL!
const dbName = (url: string) => new URL(url).pathname.replace(/^\//, '')

type Check = { name: string; ok: boolean; detail?: string }
const checks: Check[] = []
const observations: Record<string, unknown> = {}
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}
const observe = (key: string, value: unknown) => {
  observations[key] = value
  console.log(`OBSERVE  ${key}: ${JSON.stringify(value)}`)
}

async function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      env,
      maxBuffer: 1024 * 1024 * 128,
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

async function finish(data: Record<string, unknown>) {
  await mkdir(evidenceDir, { recursive: true })
  const failed = checks.filter((c) => !c.ok).length
  await writeFile(
    path.join(evidenceDir, `trace-${phase}.json`),
    `${JSON.stringify(
      {
        phase,
        at: new Date().toISOString(),
        checks,
        observations,
        data,
        summary: { passed: checks.length - failed, failed, total: checks.length },
      },
      null,
      2,
    )}\n`,
  )
  console.log(`== ${phase}: ${checks.length - failed}/${checks.length} checks passed ==`)
  if (failed) process.exitCode = 1
}

const poolFor = async (url: string) => {
  const { Pool } = await import('pg')
  return new Pool({ connectionString: url })
}

// ---------------------------------------------------------------- fresh
async function freshPhase() {
  const { migrations } = await import('../../src/migrations')
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  const head = (await execFileAsync('git', ['rev-parse', 'HEAD'])).stdout.trim()
  const result = await run('npm', ['run', 'test:migrations:fresh'], {
    ...process.env,
    DATABASE_URL: FRESH_URL,
  })
  check(
    'shipped fresh-migration verifier exits 0 (all migrations applied twice, runtime schema assertions)',
    result.code === 0 && result.stdout.includes('Fresh migration acceptance passed.'),
    `exit ${result.code}`,
  )
  const pool = poolFor(FRESH_URL)
  const count = Number(
    (await (await pool).query('SELECT count(*)::int AS c FROM payload_migrations')).rows[0].c,
  )
  const pgVersion = (await (await pool).query('SHOW server_version')).rows[0].server_version
  check(
    'payload_migrations records every migration exactly once',
    count === migrations.length,
    `${count} = ${migrations.length}`,
  )
  const status = await run('npm', ['run', 'db:status'], {
    ...process.env,
    DATABASE_URL: FRESH_URL,
  })
  check(
    'operator command `npm run db:status` runs against the fresh database',
    status.code === 0,
    `exit ${status.code}`,
  )
  observe('dbStatusTail', status.stdout.trim().split('\n').slice(-4).join('\n'))
  await (await pool).end()
  await finish({
    database: dbName(FRESH_URL),
    migrationsApplied: count,
    migrationsTotal: migrations.length,
    postgresql: pgVersion,
    appVersion: pkg.version,
    sourceHead: head,
  })
}

// ---------------------------------------------------------------- upgrade
async function upgradePhase() {
  const { migrations } = await import('../../src/migrations')
  const { UPGRADE_BASELINE } = await import('../../src/scripts/verify-upgrade-migration')
  const baselineIndex = migrations.findIndex((m) => m.name === UPGRADE_BASELINE)
  const result = await run('npm', ['run', 'test:migrations:upgrade'], {
    ...process.env,
    DATABASE_URL: FRESH_URL,
    UPGRADE_MIGRATION_DATABASE_URL: UPGRADE_URL,
  })
  check(
    'shipped synthetic fixture-upgrade verifier exits 0 (baseline fixture data survives; entitlement down/up replay preserves schema and data)',
    result.code === 0 && result.stdout.includes('Upgrade rehearsal passed'),
    `exit ${result.code}`,
  )
  const pool = await poolFor(UPGRADE_URL)
  const count = Number(
    (await pool.query('SELECT count(*)::int AS c FROM payload_migrations')).rows[0].c,
  )
  check(
    'upgraded database ledger holds every migration exactly once',
    count === migrations.length,
    `${count} = ${migrations.length}`,
  )
  const sentinel = await pool.query(
    `SELECT slug, canonical_path FROM content WHERE slug = 'upgrade-sentinel-article'`,
  )
  check(
    'sentinel article created at the baseline survives the upgrade with canonical data intact',
    sentinel.rows.length === 1 &&
      sentinel.rows[0].canonical_path === '/blogs/upgrade-sentinel/upgrade-sentinel-article',
    `${sentinel.rows.length} row(s)`,
  )
  await pool.end()
  await finish({
    database: dbName(UPGRADE_URL),
    baseline: UPGRADE_BASELINE,
    baselineMigrations: baselineIndex + 1,
    migrationsTotal: migrations.length,
    claimBoundary:
      'Synthetic fixture upgrade (schema evidence only) — not a historical customer upgrade.',
  })
}

// ---------------------------------------------------------------- commerce
async function commercePhase() {
  const result = await run('npm', ['run', 'test:migrations:commerce'], {
    ...process.env,
    DATABASE_URL: COMMERCE_URL,
  })
  check(
    'shipped commerce-migration verifier exits 0 (commerce subset rehearsed from its baseline, applied twice)',
    result.code === 0 && result.stdout.includes('Commerce migration acceptance passed'),
    `exit ${result.code}`,
  )
  await finish({ database: dbName(COMMERCE_URL) })
}

// ---------------------------------------------------------------- drift
async function schemaInventory(url: string) {
  const pool = await poolFor(url)
  const tables = (
    await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)
  ).rows.map((r) => r.tablename as string)
  const columns = (
    await pool.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, COALESCE(column_default, '') AS dflt
       FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`,
    )
  ).rows.map((r) => `${r.table_name}.${r.column_name}:${r.udt_name}:${r.is_nullable}:${r.dflt}`)
  const enums = (
    await pool.query(
      `SELECT t.typname AS typ, e.enumlabel AS label FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid ORDER BY 1, e.enumsortorder`,
    )
  ).rows.map((r) => `${r.typ}:${r.label}`)
  const indexes = (
    await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
    )
  ).rows.map((r) => `${r.indexname}:${r.indexdef}`)
  await pool.end()
  return { tables, columns, enums, indexes }
}
const diff = (a: string[], b: string[]) => ({
  onlyInA: a.filter((x) => !b.includes(x)).slice(0, 20),
  onlyInB: b.filter((x) => !a.includes(x)).slice(0, 20),
})
async function driftPhase() {
  const freshInv = await schemaInventory(FRESH_URL)
  const upgradeInv = await schemaInventory(UPGRADE_URL)
  const d = {
    tables: diff(freshInv.tables, upgradeInv.tables),
    columns: diff(freshInv.columns, upgradeInv.columns),
    enums: diff(freshInv.enums, upgradeInv.enums),
    indexes: diff(freshInv.indexes, upgradeInv.indexes),
  }
  const empty = (x: { onlyInA: string[]; onlyInB: string[] }) =>
    x.onlyInA.length === 0 && x.onlyInB.length === 0
  check(
    'schema drift: table sets converge between fresh install and fixture upgrade',
    empty(d.tables),
  )
  check('schema drift: column sets (type/nullability/default) converge', empty(d.columns))
  check('schema drift: enum label sets converge', empty(d.enums))
  check('schema drift: index definitions converge', empty(d.indexes))
  await finish({
    fresh: {
      tables: freshInv.tables.length,
      columns: freshInv.columns.length,
      enums: freshInv.enums.length,
      indexes: freshInv.indexes.length,
    },
    upgraded: {
      tables: upgradeInv.tables.length,
      columns: upgradeInv.columns.length,
      enums: upgradeInv.enums.length,
      indexes: upgradeInv.indexes.length,
    },
    diffs: d,
  })
}

// ---------------------------------------------------------------- additive
async function additivePhase() {
  const { migrations } = await import('../../src/migrations')
  const { UPGRADE_BASELINE } = await import('../../src/scripts/verify-upgrade-migration')
  const baselineIndex = migrations.findIndex((m) => m.name === UPGRADE_BASELINE)
  const files = (await readdir('src/migrations')).filter(
    (f) => f.endsWith('.ts') && f !== 'index.ts',
  )
  check(
    'migration index exports exactly the migration files on disk',
    files.length === migrations.length,
    `${files.length} files, ${migrations.length} exported`,
  )
  const patterns: Array<[string, RegExp]> = [
    ['DROP TABLE', /DROP\s+TABLE/i],
    ['DROP COLUMN', /DROP\s+COLUMN/i],
    ['DROP TYPE', /DROP\s+TYPE/i],
    ['TRUNCATE', /TRUNCATE/i],
    ['DELETE FROM', /DELETE\s+FROM/i],
    ['RENAME', /RENAME\s+(COLUMN|TO)\b/i],
  ]
  const hits: Array<{ migration: string; pattern: string; snippet: string }> = []
  for (const name of migrations.slice(baselineIndex + 1).map((m) => m.name)) {
    const source = await readFile(`src/migrations/${name}.ts`, 'utf8')
    const downAt = source.search(/export\s+async\s+function\s+down|export\s+const\s+down/)
    const upRegion = downAt >= 0 ? source.slice(0, downAt) : source
    for (const [label, re] of patterns) {
      const match = upRegion.match(re)
      if (match) {
        const at = match.index ?? 0
        hits.push({
          migration: name,
          pattern: label,
          snippet: upRegion
            .slice(Math.max(0, at - 60), at + 100)
            .replace(/\s+/g, ' ')
            .trim(),
        })
      }
    }
  }
  observe('postBaselineDestructivePatternHits', hits)
  const types = await readFile('src/payload-types.ts', 'utf8')
  check(
    'generated types cover post-baseline collections (form-definitions, experiments, network-relationships)',
    types.includes('form-definitions') &&
      types.includes('experiments') &&
      types.includes('network-relationships'),
  )
  const importMapPath = 'src/app/(payload)/admin/importMap.js'
  const importMap = existsSync(importMapPath) ? await readFile(importMapPath, 'utf8') : ''
  const importCount = (importMap.match(/^import /gm) ?? []).length
  check(
    'admin import map exists and is populated',
    importCount >= 20,
    `${importCount} import statements`,
  )
  const snapshots = (await readdir('src/migrations')).filter((f) => f.endsWith('.json')).length
  await finish({
    baseline: UPGRADE_BASELINE,
    baselineIndex,
    postBaselineMigrations: migrations.length - baselineIndex - 1,
    destructivePatternHits: hits,
    drizzleSnapshots: snapshots,
    note: 'Only 11 of 131 migrations carry drizzle JSON snapshots; the remainder are hand-authored SQL migrations (codebase convention).',
  })
}

// ---------------------------------------------------------------- operators
async function operatorsPhase() {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  const docs = [
    'docs/OPERATIONAL_BACKUP.md',
    'docs/PRODUCTION_DEPLOYMENT.md',
    'docs/RELEASE_CHECKLIST.md',
    'README.md',
  ]
  const referenced = new Set<string>()
  for (const doc of docs) {
    if (!existsSync(doc)) continue
    const text = await readFile(doc, 'utf8')
    for (const match of text.matchAll(/npm run ([a-z0-9:_-]+)/g)) referenced.add(match[1])
  }
  const missing = [...referenced].filter((name) => !(name in pkg.scripts))
  check(
    'every `npm run …` command referenced by the operator docs exists in package.json',
    missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${referenced.size} commands verified`,
  )
  observe('operatorCommandsVerified', [...referenced].sort())
  const compose = await readFile('compose.production.yaml', 'utf8')
  check(
    'production Compose defines the one-shot migrate service and gates app services on it',
    /^\s{2}migrate:/m.test(compose) && compose.includes('depends_on'),
  )
  check(
    'multi-instance guard module ships (operations execution lock)',
    existsSync('src/modules/operations/execution-lock.ts'),
  )
  await finish({ referencedCommands: [...referenced].sort(), missing })
}

// ---------------------------------------------------------------- rollback
const TS = '2026-08-25T12:34:56.789Z'
const IDS = {
  site: '20000000-0000-4000-8000-000000000001',
  member: '20000000-0000-4000-8000-000000000002',
  profile: '20000000-0000-4000-8000-000000000004',
  space: '20000000-0000-4000-8000-000000000005',
  publication: '20000000-0000-4000-8000-000000000006',
  media: '20000000-0000-4000-8000-000000000007',
  content: '20000000-0000-4000-8000-000000000008',
}
async function rollbackPhase() {
  const { migrations } = await import('../../src/migrations')
  const { UPGRADE_BASELINE } = await import('../../src/scripts/verify-upgrade-migration')
  const baselineIndex = migrations.findIndex((m) => m.name === UPGRADE_BASELINE)
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  process.env.DATABASE_URL = ROLLBACK_URL
  const { getPayload } = await import('payload')
  const config = (await import('../../src/payload.config')).default
  const payload = await getPayload({ config })
  const db = payload.db as typeof payload.db & {
    migrate: (args: { migrations: typeof migrations }) => Promise<void>
    pool: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }
  }
  const pool = db.pool
  try {
    // -- Pre-upgrade state: baseline schema + sentinel fixture data.
    await db.migrate({ migrations: migrations.slice(0, baselineIndex + 1) })
    const state0 = (await pool.query('SELECT name FROM payload_migrations ORDER BY name')).rows.map(
      (r) => r.name as string,
    )
    check(
      'rollback fixture database migrated to the synthetic baseline only',
      state0.length === baselineIndex + 1,
      `${state0.length} migrations`,
    )
    // Introspection-driven fixture seeder: inserts only columns that exist
    // at the baseline schema, filling NOT NULL columns from known values or
    // type-appropriate sentinels.
    const known: Record<string, Record<string, unknown>> = {
      sites: {
        id: IDS.site,
        name: 'Rollback Sentinel Site',
        slug: 'rollback-sentinel',
        lifecycle: 'active',
        created_at: TS,
        updated_at: TS,
      },
      members: {
        id: IDS.member,
        display_name: 'Rollback Sentinel Member',
        email: 'rollback-sentinel@example.test',
        status: 'active',
        created_at: TS,
        updated_at: TS,
      },
      profiles: {
        id: IDS.profile,
        member_id: IDS.member,
        display_name: 'Rollback Sentinel Member',
        handle: 'rollback-sentinel',
        visibility: 'public',
        created_at: TS,
        updated_at: TS,
      },
      spaces: {
        id: IDS.space,
        site_id: IDS.site,
        member_id: IDS.member,
        profile_id: IDS.profile,
        handle: 'rollback-sentinel',
        canonical_path: '/members/rollback-sentinel',
        display_name: 'Rollback Sentinel Space',
        visibility: 'public',
        moderation_state: 'clear',
        transfer_state: 'none',
        created_at: TS,
        updated_at: TS,
      },
      publications: {
        id: IDS.publication,
        site_id: IDS.site,
        owner_id: IDS.member,
        space_id: IDS.space,
        name: 'Rollback Sentinel Publication',
        slug: 'rollback-sentinel',
        canonical_base_path: '/blogs/rollback-sentinel',
        status: 'active',
        visibility: 'public',
        created_at: TS,
        updated_at: TS,
      },
      media_assets: {
        id: IDS.media,
        site_id: IDS.site,
        publication_id: IDS.publication,
        space_id: IDS.space,
        owner_id: IDS.member,
        title: 'Rollback sentinel image',
        kind: 'image',
        storage_location: 'local://rollback-sentinel/image.jpg',
        storage_provider: 'local',
        mime_type: 'image/jpeg',
        alt_text: 'A rollback sentinel image',
        created_at: TS,
        updated_at: TS,
      },
      content: {
        id: IDS.content,
        site_id: IDS.site,
        publication_id: IDS.publication,
        space_id: IDS.space,
        owner_id: IDS.member,
        content_type: 'article',
        title: 'Rollback Sentinel Article',
        slug: 'rollback-sentinel-article',
        canonical_path: '/blogs/rollback-sentinel/rollback-sentinel-article',
        summary: 'Pre-upgrade editorial content.',
        status: 'published',
        published_at: TS,
        hero_media_id: IDS.media,
        created_at: TS,
        updated_at: TS,
      },
    }
    const insertFixture = async (table: string) => {
      const cols = (
        await pool.query(
          `SELECT column_name, is_nullable, column_default, data_type FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
          [table],
        )
      ).rows
      const names: string[] = []
      const values: unknown[] = []
      for (const col of cols) {
        const name = col.column_name as string
        if (name in known[table]) {
          names.push(name)
          values.push(known[table][name])
        } else if (col.is_nullable === 'NO' && col.column_default === null) {
          names.push(name)
          values.push(
            col.data_type === 'uuid'
              ? IDS.site
              : col.data_type === 'boolean'
                ? false
                : col.data_type === 'jsonb'
                  ? {}
                  : col.data_type.includes('timestamp')
                    ? TS
                    : col.data_type.includes('int') || col.data_type === 'numeric'
                      ? 0
                      : 'sentinel',
          )
        }
      }
      await pool.query(
        `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`,
        values,
      )
    }
    for (const table of [
      'sites',
      'members',
      'profiles',
      'spaces',
      'publications',
      'media_assets',
      'content',
    ])
      await insertFixture(table)
    const rowHash = async (p: { query: typeof pool.query }, table: string, id: string) =>
      (await p.query(`SELECT md5(row_to_json(t)::text) AS h FROM "${table}" t WHERE id = $1`, [id]))
        .rows[0].h as string
    const hashes0: Record<string, string> = {}
    for (const [table, id] of [
      ['sites', IDS.site],
      ['members', IDS.member],
      ['media_assets', IDS.media],
      ['content', IDS.content],
    ] as const)
      hashes0[table] = await rowHash(pool, table, id)
    check(
      'baseline sentinel fixture rows inserted (site/member/media/content)',
      Object.values(hashes0).every(Boolean),
    )

    // Sentinel media on disk.
    const mediaDir = path.resolve(process.env.MEDIA_DIR!)
    await writeFile(
      path.join(mediaDir, 'sentinel-a.bin'),
      Buffer.from('rollback-sentinel-a\0'.repeat(64)),
    )
    await writeFile(
      path.join(mediaDir, 'sentinel-b.bin'),
      Buffer.from('rollback-sentinel-b\0'.repeat(64)),
    )
    const mediaHash = async (dir: string, file: string) =>
      createHash('sha256')
        .update(await readFile(path.join(dir, file)))
        .digest('hex')
    const media0 = {
      'sentinel-a.bin': await mediaHash(mediaDir, 'sentinel-a.bin'),
      'sentinel-b.bin': await mediaHash(mediaDir, 'sentinel-b.bin'),
    }

    // -- Pre-upgrade operational backup, captured with the product module.
    const backupModule = await import('../../src/modules/operations/backup')
    const lifecycle = await import('../../src/modules/operations/lifecycle')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const archive = path.resolve(`${scratch}/backups/renegade-backup-${stamp}`)
    await mkdir(archive, { recursive: true })
    const pgEnv = { ...process.env, PGPASSWORD: 'postgres' }
    await execFileAsync(
      'pg_dump',
      [
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-Fc',
        '-d',
        dbName(ROLLBACK_URL),
        '-f',
        path.join(archive, 'database.dump'),
      ],
      { env: pgEnv, maxBuffer: 1024 * 1024 * 64 },
    )
    await execFileAsync(
      'tar',
      [
        '-C',
        mediaDir,
        '--exclude=./.upload-sessions',
        '--exclude=.upload-sessions',
        '--exclude=./.renegade/backup-status.json',
        '--exclude=.renegade/backup-status.json',
        '-czf',
        path.join(archive, 'media.tar.gz'),
        '.',
      ],
      { maxBuffer: 1024 * 1024 * 64 },
    )
    const pgVersion = (await pool.query('SHOW server_version')).rows[0].server_version as string
    const headSha = (await execFileAsync('git', ['rev-parse', 'HEAD'])).stdout.trim()
    const manifest = await backupModule.createOperationalBackupManifest(archive, {
      createdAt: new Date().toISOString(),
      renegade: { version: pkg.version, buildSha: headSha },
      postgresql: { version: pgVersion },
      consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
      includedComponents: [
        'postgresql-data',
        'media-and-local-generated-assets',
        'db-extension-and-capability-state',
        'non-secret-installation-metadata',
      ],
      migrationState: state0,
      installation: { storageDriver: 'local', mediaDir, imageTag: null },
    })
    await writeFile(path.join(archive, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    })
    const verified = await backupModule.verifyOperationalBackup(archive)
    check(
      'pre-upgrade backup archive created and verified by the product backup module',
      verified.migrationState.length === state0.length && verified.totals.files === 2,
    )

    // -- Lifecycle guards: the rollback boundary, exercised directly.
    assert.doesNotThrow(() =>
      lifecycle.assertRollbackSchemaCompatibility({
        preUpgradeMigrationState: state0,
        currentMigrationState: state0,
      }),
    )
    check('image-rollback guard permits rollback when the migration ledger is unchanged', true)
    assert.throws(
      () =>
        lifecycle.assertRollbackSchemaCompatibility({
          preUpgradeMigrationState: state0,
          currentMigrationState: [...state0, '20990101_000000_future'],
        }),
      /Restore the pre-upgrade operational backup instead/,
    )
    check(
      'image-rollback guard refuses when the ledger moved, directing the operator to restore the backup',
      true,
    )
    assert.doesNotThrow(() =>
      lifecycle.assertRestoreVersionCompatibility({
        archiveVersion: pkg.version,
        targetVersion: pkg.version,
      }),
    )
    assert.doesNotThrow(() =>
      lifecycle.assertRestoreVersionCompatibility({
        archiveVersion: '0.1.0',
        targetVersion: '0.2.0',
      }),
    )
    assert.throws(() =>
      lifecycle.assertRestoreVersionCompatibility({
        archiveVersion: '1.0.0',
        targetVersion: '0.1.0',
      }),
    )
    assert.throws(() =>
      lifecycle.assertRestoreVersionCompatibility({
        archiveVersion: '0.2.0',
        targetVersion: '0.1.0',
      }),
    )
    check(
      'restore version guard: same-version and same-major forward restores pass; cross-major and newer-into-older are refused',
      true,
    )
    assert.throws(() =>
      lifecycle.assertDestructiveOperationAuthorized({
        operation: 'rollback',
        maintenanceWindowConfirmed: false,
      }),
    )
    assert.doesNotThrow(() =>
      lifecycle.assertDestructiveOperationAuthorized({
        operation: 'rollback',
        maintenanceWindowConfirmed: true,
      }),
    )
    check('destructive-operation guard requires an explicitly confirmed maintenance window', true)
    const plan = lifecycle.createUpgradePlan({
      targetImageTag: '0.1.0',
      backup: { kind: 'existing', archive },
    })
    check(
      'upgrade plan is the documented seven-step sequence (backup before migrations)',
      JSON.stringify(plan) ===
        JSON.stringify([
          'inspect-current-state',
          'verify-or-create-backup',
          'obtain-target-image',
          'enter-maintenance-mode',
          'run-migrations',
          'start-services',
          'verify-health',
        ]),
    )

    // -- Corrupted archive negative.
    const corrupt = path.resolve(`${scratch}/corrupt`)
    await execFileAsync('rm', ['-rf', corrupt])
    await execFileAsync('cp', ['-r', archive, corrupt])
    const dumpPath = path.join(corrupt, 'database.dump')
    const dumpBytes = await readFile(dumpPath)
    dumpBytes[128] = dumpBytes[128] ^ 0xff
    await writeFile(dumpPath, dumpBytes)
    await assert.rejects(() => backupModule.verifyOperationalBackup(corrupt), /checksum mismatch/)
    check(
      'corrupted pre-upgrade archive is rejected by checksum verification before any restore',
      true,
    )

    // -- Upgrade in place; data must survive.
    await db.migrate({ migrations })
    const stateNow = (
      await pool.query('SELECT name FROM payload_migrations ORDER BY name')
    ).rows.map((r) => r.name as string)
    check(
      'in-place upgrade applies every remaining migration',
      stateNow.length === migrations.length,
      `${state0.length} -> ${stateNow.length}`,
    )
    const hashesAfterUpgrade: Record<string, string> = {}
    for (const table of Object.keys(hashes0))
      hashesAfterUpgrade[table] = await rowHash(
        pool,
        table,
        IDS[
          table === 'sites'
            ? 'site'
            : table === 'members'
              ? 'member'
              : table === 'media_assets'
                ? 'media'
                : 'content'
        ],
      )
    // Note: additive migrations may add columns (row_to_json grows), so compare
    // identity-bearing fields rather than whole-row hashes after an upgrade.
    const contentAfter = (
      await pool.query('SELECT slug, canonical_path, title FROM content WHERE id = $1', [
        IDS.content,
      ])
    ).rows[0]
    check(
      'sentinel content survives the in-place upgrade with identity and canonical data intact',
      contentAfter?.slug === 'rollback-sentinel-article' &&
        contentAfter?.canonical_path === '/blogs/rollback-sentinel/rollback-sentinel-article' &&
        contentAfter?.title === 'Rollback Sentinel Article',
    )
    observe('wholeRowHashMayGrowWithAdditiveColumns', {
      before: hashes0,
      after: hashesAfterUpgrade,
    })

    // -- The supported rollback for a schema-changing upgrade is restore.
    assert.throws(
      () =>
        lifecycle.assertRollbackSchemaCompatibility({
          preUpgradeMigrationState: state0,
          currentMigrationState: stateNow,
        }),
      /Restore the pre-upgrade operational backup instead/,
    )
    check(
      'after the schema-changing upgrade, image rollback is refused on the real ledger states',
      true,
    )
    await execFileAsync(
      'pg_restore',
      [
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        dbName(RESTORED_URL),
        path.join(archive, 'database.dump'),
      ],
      { env: pgEnv, maxBuffer: 1024 * 1024 * 64 },
    )
    const restoredMedia = path.resolve(`${scratch}/restored-media`)
    await mkdir(restoredMedia, { recursive: true })
    // --no-same-owner: this sandbox denies chown even to root; file bytes are
    // what the byte-identity check below verifies.
    await execFileAsync('tar', [
      '--no-same-owner',
      '-xzf',
      path.join(archive, 'media.tar.gz'),
      '-C',
      restoredMedia,
    ])
    const restoredPool = await poolFor(RESTORED_URL)
    const restoredState = (
      await restoredPool.query('SELECT name FROM payload_migrations ORDER BY name')
    ).rows.map((r) => r.name as string)
    check(
      'restored target ledger equals the pre-upgrade baseline ledger exactly',
      JSON.stringify(restoredState) === JSON.stringify(state0),
      `${restoredState.length} migrations`,
    )
    let restoredHashesOk = true
    for (const [table, id] of [
      ['sites', IDS.site],
      ['members', IDS.member],
      ['media_assets', IDS.media],
      ['content', IDS.content],
    ] as const)
      if ((await rowHash(restoredPool, table, id)) !== hashes0[table]) restoredHashesOk = false
    check('restored sentinel rows are byte-identical to the pre-upgrade rows', restoredHashesOk)
    const mediaRestored = {
      'sentinel-a.bin': await mediaHash(restoredMedia, 'sentinel-a.bin'),
      'sentinel-b.bin': await mediaHash(restoredMedia, 'sentinel-b.bin'),
    }
    check(
      'restored media files are byte-identical to the pre-upgrade media',
      mediaRestored['sentinel-a.bin'] === media0['sentinel-a.bin'] &&
        mediaRestored['sentinel-b.bin'] === media0['sentinel-b.bin'],
    )
    await restoredPool.end()
    await finish({
      baseline: UPGRADE_BASELINE,
      baselineMigrations: state0.length,
      upgradedMigrations: stateNow.length,
      archive,
      manifestVersion: manifest.renegade.version,
      claimBoundary:
        'Rollback rehearsal on a synthetic baseline fixture via the shipped backup data-plane; not a historical customer upgrade/rollback.',
    })
  } finally {
    await payload.db.destroy?.()
  }
}

// ---------------------------------------------------------------- web
async function webPhase() {
  const port = 39175
  const env = { ...process.env, DATABASE_URL: UPGRADE_URL }
  const child: ChildProcess = spawn('npx', ['next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    env,
    detached: true,
    stdio: 'ignore',
  })
  try {
    let ready = 0
    for (let i = 0; i < 75 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/health/ready`)).status
      } catch {
        ready = 0
      }
    }
    check(
      'web boots on the fixture-upgraded database and reports ready',
      ready === 200,
      `status ${ready}`,
    )
    const home = await fetch(`http://127.0.0.1:${port}/`)
    observe('homepageStatusOnUpgradedDb', home.status)
    const article = await fetch(
      `http://127.0.0.1:${port}/blogs/upgrade-sentinel/upgrade-sentinel-article`,
    )
    const articleBody = await article.text()
    observe('sentinelArticleStatusOnUpgradedDb', article.status)
    observe('sentinelArticleRendersTitle', articleBody.includes('Upgrade Sentinel Article'))
  } finally {
    if (child.pid) process.kill(-child.pid, 'SIGKILL')
    // next dev rewrites these for custom dist dirs; restore the committed tree.
    await run('git', ['checkout', '--', 'next-env.d.ts', 'tsconfig.json'])
  }
  await finish({ database: dbName(UPGRADE_URL), port })
}

const phases: Record<string, () => Promise<void>> = {
  fresh: freshPhase,
  upgrade: upgradePhase,
  commerce: commercePhase,
  drift: driftPhase,
  additive: additivePhase,
  operators: operatorsPhase,
  rollback: rollbackPhase,
  web: webPhase,
}
const main = phases[phase]
if (!main) throw new Error(`Unknown phase ${phase}`)
await main()
