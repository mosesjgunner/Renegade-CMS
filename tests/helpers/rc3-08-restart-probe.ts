import pg from 'pg'

/**
 * RC3-08 restart probe: runs in a FRESH process after the migration
 * process has finished and reads the persisted rows straight from
 * PostgreSQL — media references, author mapping, SEO fields and draft
 * state — printing one RESULT=<json> line for the integration test to
 * assert on. It deliberately does not boot Payload: a second Payload
 * instance in parallel with the test's own instance can block on the
 * jobs concurrency lock, and the property under test is that the data
 * was committed durably, readable by any new process.
 *
 * Usage: rc3-08-restart-probe.ts <siteId> <heroMediaId>
 */

const [siteId, heroMediaId] = process.argv.slice(2)
if (!siteId || !heroMediaId) throw new Error('Expected <siteId> <heroMediaId>')
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')

const client = new pg.Client({ connectionString })
await client.connect()
try {
  const one = async (sql: string, values: unknown[]) =>
    (await client.query(sql, values)).rows[0] as Record<string, unknown> | undefined

  const post = await one(
    'SELECT status, seo_title, hero_media_id, body FROM content WHERE site_id = $1 AND slug = $2',
    [siteId, 'spring-refit'],
  )
  const home = await one('SELECT body FROM content WHERE site_id = $1 AND slug = $2', [
    siteId,
    'home',
  ])
  const draft = await one('SELECT status FROM content WHERE site_id = $1 AND slug = $2', [
    siteId,
    'varnish-note',
  ])
  const ana = await one('SELECT id FROM authors WHERE slug = $1', ['ana-harbor'])
  const authorRefs = (
    await client.query(
      'SELECT author_id FROM content_authors WHERE _parent_id = (SELECT id FROM content WHERE site_id = $1 AND slug = $2)',
      [siteId, 'spring-refit'],
    )
  ).rows.map((row) => String((row as { author_id: unknown }).author_id))
  const media = await one('SELECT checksum FROM media_assets WHERE id = $1', [heroMediaId])

  const homeBody = JSON.stringify(home?.body ?? null)
  process.stdout.write(
    `RESULT=${JSON.stringify({
      postStatus: post?.status ?? null,
      seoTitle: post?.seo_title ?? null,
      heroRef: post?.hero_media_id ? String(post.hero_media_id) : null,
      authorRefs,
      anaAuthorId: ana?.id ? String(ana.id) : null,
      bodyHasSurveyHeading: JSON.stringify(post?.body ?? null).includes('What the Survey Found'),
      homeBodyHasRelationshipNode: homeBody.includes('"relationship"'),
      homeBodyHasHeroMedia: homeBody.includes(heroMediaId),
      mediaChecksum: media?.checksum ? String(media.checksum).replace(/^sha256:/, '') : null,
      draftStatus: draft?.status ?? null,
    })}\n`,
  )
} finally {
  await client.end()
}
