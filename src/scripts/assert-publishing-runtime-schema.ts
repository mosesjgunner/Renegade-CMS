type Pool = {
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>
}

/** Check the collection fields that postdate the historical publishing migrations. */
export async function assertPublishingRuntimeSchema(pool: Pool): Promise<void> {
  const columns = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('scheduled_publish_jobs', 'content_releases')
  `)
  const actual = new Map(columns.rows.map((row) => [`${row.table_name}.${row.column_name}`, row]))
  const expected: Array<[string, string, string, string | null]> = [
    ['scheduled_publish_jobs.lease_owner', 'character varying', 'YES', null],
    ['scheduled_publish_jobs.lease_expires_at', 'timestamp with time zone', 'YES', null],
    ['scheduled_publish_jobs.retry_count', 'numeric', 'NO', '0'],
    ['scheduled_publish_jobs.max_retries', 'numeric', 'NO', '3'],
    ['scheduled_publish_jobs.last_error', 'character varying', 'YES', null],
    ['content_releases.name', 'character varying', 'YES', null],
    ['content_releases.purpose', 'character varying', 'YES', null],
    ['content_releases.owner_team', 'character varying', 'YES', null],
    ['content_releases.planned_instant', 'timestamp with time zone', 'YES', null],
    ['content_releases.labels', 'jsonb', 'YES', "'[]'::jsonb"],
    ['content_releases.campaign', 'character varying', 'YES', null],
    ['content_releases.dependencies', 'jsonb', 'YES', "'[]'::jsonb"],
    ['content_releases.release_revision', 'numeric', 'YES', '1'],
    ['content_releases.artifacts', 'jsonb', 'YES', "'[]'::jsonb"],
    ['content_releases.gate_snapshot', 'jsonb', 'YES', null],
    ['content_releases.approvals', 'jsonb', 'YES', "'[]'::jsonb"],
    ['content_releases.saga_steps', 'jsonb', 'YES', "'[]'::jsonb"],
    ['content_releases.resulting_urls', 'jsonb', 'YES', "'[]'::jsonb"],
    ['content_releases.lease_owner', 'character varying', 'YES', null],
    ['content_releases.lease_expires_at', 'timestamp with time zone', 'YES', null],
  ]
  for (const [key, dataType, nullable, defaultValue] of expected) {
    const row = actual.get(key)
    if (
      !row ||
      row.data_type !== dataType ||
      row.is_nullable !== nullable ||
      row.column_default !== defaultValue
    )
      throw new Error(`Publishing runtime schema mismatch: ${key}.`)
  }

  const enumRows = await pool.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname IN ('enum_scheduled_publish_jobs_status', 'enum_content_releases_status')
  `)
  const labels = new Set(enumRows.rows.map((row) => `${row.typname}.${row.enumlabel}`))
  for (const value of [
    'enum_scheduled_publish_jobs_status.processing',
    'enum_content_releases_status.in-review',
    'enum_content_releases_status.approved',
    'enum_content_releases_status.completed',
    'enum_content_releases_status.partially-failed',
    'enum_content_releases_status.failed',
    'enum_content_releases_status.rolled-back',
  ]) {
    if (!labels.has(value)) throw new Error(`Publishing runtime status missing: ${value}.`)
  }
}
