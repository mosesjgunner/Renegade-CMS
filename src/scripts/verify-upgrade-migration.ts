import { Client } from 'pg'
import { getPayload, type Payload } from 'payload'

import { migrations } from '../migrations'

/** Advance this name, and only this name, when the supported upgrade baseline moves. */
export const UPGRADE_BASELINE = '20260825_180000_calendar_graphics'
const baselineIndex = migrations.findIndex(({ name }) => name === UPGRADE_BASELINE)
const ids = {
  site: '10000000-0000-4000-8000-000000000001',
  member: '10000000-0000-4000-8000-000000000002',
  identity: '10000000-0000-4000-8000-000000000003',
  profile: '10000000-0000-4000-8000-000000000004',
  space: '10000000-0000-4000-8000-000000000005',
  publication: '10000000-0000-4000-8000-000000000006',
  media: '10000000-0000-4000-8000-000000000007',
  content: '10000000-0000-4000-8000-000000000008',
  account: '10000000-0000-4000-8000-000000000009',
  draft: '10000000-0000-4000-8000-000000000010',
  variant: '10000000-0000-4000-8000-000000000011',
  queue: '10000000-0000-4000-8000-000000000012',
}
const timestamp = '2026-08-25T12:34:56.789Z'
type Pool = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}
const poolFor = (payload: Payload) => (payload.db as Payload['db'] & { pool: Pool }).pool
const migrationDb = (payload: Payload) =>
  payload.db as Payload['db'] & {
    migrate: (args: { migrations: typeof migrations }) => Promise<void>
  }

function scratchUrl() {
  const url = process.env.UPGRADE_MIGRATION_DATABASE_URL
  if (!url)
    throw new Error(
      'Set UPGRADE_MIGRATION_DATABASE_URL to a dedicated database ending in _upgrade_acceptance.',
    )
  if (!new URL(url).pathname.replace(/^\//, '').endsWith('_upgrade_acceptance'))
    throw new Error('Refusing to reset a database not named *_upgrade_acceptance.')
  return url
}

async function createHistoricalFixture(payload: Payload) {
  const create = (collection: string, data: Record<string, unknown>) =>
    payload.create({ collection: collection as never, data: data as never, overrideAccess: true })
  const sentinel = async (
    key: keyof typeof ids,
    collection: string,
    data: Record<string, unknown>,
  ) => {
    const record = await create(collection, data)
    ids[key] = String((record as { id: string }).id)
  }
  await sentinel('site', 'sites', {
    id: ids.site,
    name: 'Upgrade Sentinel Site',
    slug: 'upgrade-sentinel',
    lifecycle: 'active',
  })
  await sentinel('member', 'members', {
    id: ids.member,
    displayName: 'Upgrade Sentinel Member',
    email: 'upgrade-sentinel@example.test',
    status: 'active',
  })
  await sentinel('identity', 'linked-identities', {
    id: ids.identity,
    member: ids.member,
    kind: 'email-magic-link',
    providerKey: 'email',
    externalSubject: 'upgrade-sentinel@example.test',
    verifiedAt: timestamp,
  })
  await sentinel('profile', 'profiles', {
    id: ids.profile,
    member: ids.member,
    displayName: 'Upgrade Sentinel Member',
    visibility: 'public',
  })
  await sentinel('space', 'spaces', {
    id: ids.space,
    member: ids.member,
    profile: ids.profile,
    handle: 'upgrade-sentinel',
    canonicalPath: '/members/upgrade-sentinel',
    displayName: 'Upgrade Sentinel Space',
    visibility: 'public',
  })
  await sentinel('publication', 'publications', {
    id: ids.publication,
    site: ids.site,
    owner: ids.member,
    space: ids.space,
    name: 'Upgrade Sentinel Publication',
    slug: 'upgrade-sentinel',
    canonicalBasePath: '/blogs/upgrade-sentinel',
    status: 'active',
    visibility: 'public',
  })
  await sentinel('media', 'media-assets', {
    id: ids.media,
    site: ids.site,
    publication: ids.publication,
    space: ids.space,
    owner: ids.member,
    title: 'Upgrade sentinel image',
    kind: 'image',
    storageLocation: 'local://upgrade-sentinel/image.jpg',
    storageProvider: 'local',
    mimeType: 'image/jpeg',
    altText: 'A migration sentinel image',
  })
  await sentinel('content', 'content', {
    id: ids.content,
    site: ids.site,
    publication: ids.publication,
    space: ids.space,
    owner: ids.member,
    contentType: 'article',
    title: 'Upgrade Sentinel Article',
    slug: 'upgrade-sentinel-article',
    canonicalPath: '/blogs/upgrade-sentinel/upgrade-sentinel-article',
    summary: 'Pre-Second-Pass editorial content.',
    status: 'published',
    publishedAt: timestamp,
    heroMedia: ids.media,
  })
  await sentinel('account', 'social-accounts', {
    id: ids.account,
    site: ids.site,
    publication: ids.publication,
    space: ids.space,
    owner: ids.member,
    displayName: 'Upgrade Sentinel Bluesky',
    network: 'bluesky',
    actorType: 'publication',
    externalAccountId: 'upgrade-sentinel',
    capabilities: {},
  })
  await sentinel('draft', 'social-drafts', {
    id: ids.draft,
    site: ids.site,
    publication: ids.publication,
    space: ids.space,
    owner: ids.member,
    title: 'Upgrade sentinel social draft',
    sourceContent: ids.content,
    status: 'scheduled',
    requiresReview: true,
    canonicalUrl: 'https://example.test/upgrade-sentinel-article',
  })
  await sentinel('variant', 'social-network-variants', {
    id: ids.variant,
    draft: ids.draft,
    account: ids.account,
    label: 'Bluesky',
    network: 'bluesky',
    text: 'Upgrade sentinel social content',
    status: 'scheduled',
    idempotencyKey: 'upgrade-sentinel-variant',
    attachments: [ids.media],
  })
  await sentinel('queue', 'social-queue-items', {
    id: ids.queue,
    variant: ids.variant,
    account: ids.account,
    scheduledFor: timestamp,
    timeZone: 'UTC',
    status: 'scheduled',
    idempotencyKey: 'upgrade-sentinel-queue',
  })
  for (const table of [
    'sites',
    'members',
    'linked_identities',
    'profiles',
    'spaces',
    'publications',
    'media_assets',
    'content',
    'social_accounts',
    'social_drafts',
    'social_network_variants',
    'social_queue_items',
  ])
    await poolFor(payload).query(
      `UPDATE ${table} SET created_at = $1, updated_at = $1 WHERE id = ANY($2::uuid[])`,
      [timestamp, Object.values(ids)],
    )
}

async function assertUpgrade(payload: Payload) {
  const one = async (sql: string, values: unknown[] = []) =>
    (await poolFor(payload).query(sql, values)).rows[0]
  const content = await one(
    'SELECT id, slug, canonical_path, created_at, hero_media_id FROM content WHERE id = $1',
    [ids.content],
  )
  if (
    !content ||
    content.id !== ids.content ||
    content.slug !== 'upgrade-sentinel-article' ||
    content.canonical_path !== '/blogs/upgrade-sentinel/upgrade-sentinel-article' ||
    content.hero_media_id !== ids.media ||
    new Date(content.created_at as Date).toISOString() !== timestamp
  )
    throw new Error(
      'Upgrade altered content identity, canonical data, timestamp, or media relationship.',
    )
  if (
    (await one('SELECT source_content_id FROM social_drafts WHERE id = $1', [ids.draft]))
      ?.source_content_id !== ids.content
  )
    throw new Error('Upgrade broke the social relationship.')
  const duplicate = await one(
    'SELECT (SELECT count(*) FROM content WHERE id = $1) AS content_count, (SELECT count(*) FROM social_queue_items WHERE id = $2) AS queue_count',
    [ids.content, ids.queue],
  )
  if (Number(duplicate?.content_count) !== 1 || Number(duplicate?.queue_count) !== 1)
    throw new Error('Upgrade duplicated sentinel records.')
  if (
    (await one('SELECT rights_status FROM media_assets WHERE id = $1', [ids.media]))
      ?.rights_status !== 'approved'
  )
    throw new Error('Existing media did not receive the safe rights default.')
  const enumRows = await poolFor(payload).query(
    "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'enum_payload_jobs_task_slug'",
  )
  for (const task of [
    'editorial-publish',
    'content-release-execute',
    'media-import',
    'social-publish',
    'audience-email-delivery',
    'commerce-abandon-checkouts',
  ])
    if (!enumRows.rows.some((row) => row.enumlabel === task))
      throw new Error(`Payload Jobs task enum missing ${task}.`)
  const purposeRows = await poolFor(payload).query(
    "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'enum_media_usages_purpose'",
  )
  if (!purposeRows.rows.some((row) => row.enumlabel === 'newsletter'))
    throw new Error('Shared media enum missing newsletter.')
  const form = await payload.create({
    collection: 'form-definitions',
    data: {
      site: ids.site,
      name: 'Upgrade-ready form',
      publicPath: '/upgrade-ready-form',
      settings: {},
    },
    overrideAccess: true,
  } as never)
  if (
    !form.id ||
    (
      await payload.findByID({
        collection: 'content',
        id: ids.content,
        depth: 1,
        overrideAccess: true,
      })
    ).id !== ids.content
  )
    throw new Error('Payload boot/read/write failed after upgrade.')
}

export async function verifyUpgradeMigration() {
  if (baselineIndex < 0) throw new Error(`Missing upgrade baseline ${UPGRADE_BASELINE}.`)
  const url = scratchUrl(),
    client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(
      'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;',
    )
  } finally {
    await client.end()
  }
  const previousDatabaseUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = url
  try {
    const { default: config } = await import('../payload.config')
    const payload = await getPayload({ config })
    try {
      await migrationDb(payload).migrate({ migrations: migrations.slice(0, baselineIndex + 1) })
      await createHistoricalFixture(payload)
      await migrationDb(payload).migrate({ migrations })
      await assertUpgrade(payload)
      await migrationDb(payload).migrate({ migrations })
      const applied = await poolFor(payload).query('SELECT count(*) FROM payload_migrations')
      if (Number(applied.rows[0]?.count) !== migrations.length)
        throw new Error('Repeat migration invocation changed migration state.')
    } finally {
      await payload.db.destroy?.()
    }
  } finally {
    process.env.DATABASE_URL = previousDatabaseUrl
  }
}

if (process.argv[1]?.endsWith('verify-upgrade-migration.ts'))
  verifyUpgradeMigration()
    .then(() => {
      console.log(`Upgrade rehearsal passed: ${UPGRADE_BASELINE} -> current.`)
      process.exit(0)
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
