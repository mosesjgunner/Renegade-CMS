/** Read-only smoke against an already-running local app and published PostgreSQL fixtures. */
import assert from 'node:assert/strict'
import pg from 'pg'
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
process.loadEnvFile('.env')
const origin = process.env.PRESENTATION_SMOKE_URL ?? 'http://localhost:3120'
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  const layoutInventory =
    await client.query(`SELECT id, site_id, path, theme_id, layout_version, status, revision, published_revision,
    jsonb_array_length(blocks) AS block_count, jsonb_array_length(unknown_blocks) AS unknown_block_count
    FROM page_layouts ORDER BY site_id, path`)
  writeFileSync(
    'docs/presentation/page-layout-inventory.json',
    JSON.stringify(layoutInventory.rows, null, 2) + '\n',
  )
  const { rows } =
    await client.query(`SELECT c.id, c.content_type, c.title, c.canonical_path, a.latest_published_revision_id, r.document
    FROM content c JOIN article_family_content a ON a.content_id = c.id
    JOIN revision_records r ON r.id = a.latest_published_revision_id
    WHERE c.site_id = (SELECT site_id FROM publications WHERE status='active' AND visibility='public' ORDER BY created_at DESC LIMIT 1) AND c.content_type IN ('page', 'article') AND c.status IN ('published', 'updated')
    ORDER BY c.created_at DESC`)
  const page = rows.find((row) => row.content_type === 'page')
  const post = rows.find((row) => row.content_type === 'article')
  assert(page && post, 'A published Page and Post fixture are required.')
  const {
    rows: [selection],
  } = await client.query(`
    SELECT COALESCE(state.active->>'id', (SELECT theme_id FROM site_settings LIMIT 1), 'neutral-starter') AS id,
      COALESCE(state.active->>'version', '1.0.0') AS version
    FROM publications p LEFT JOIN presentation_theme_state state ON state.site_id=p.site_id
    WHERE p.status='active' AND p.visibility='public' ORDER BY p.created_at DESC LIMIT 1`)
  assert(selection, 'Public theme selection required')
  const cases = [
    ['home', '/', 200],
    ['Page', page.canonical_path, 200],
    ['Post', post.canonical_path, 200],
    ['archive', '/articles', 200],
    ['search', '/search?q=' + encodeURIComponent(post.title), 200],
    ['404', '/pre-00-missing-page-check', 404],
  ]
  for (const [surface, path, status] of cases) {
    const response = await fetch(origin + path)
    const html = await response.text()
    assert.equal(response.status, status, `${surface} status`)
    if (surface === '404') {
      const browser = await chromium.launch(
        process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
      )
      try {
        const tab = await browser.newPage()
        await tab.goto(origin + path)
        await tab.locator(`body[data-theme="${selection.id}"]`).waitFor()
        assert.equal(await tab.locator('h1').textContent(), 'This published page was not found.')
      } finally {
        await browser.close()
      }
    } else {
      assert(html.includes(`data-theme="${selection.id}"`), `${surface} manifest`)
      assert(html.includes(`data-theme-version="${selection.version}"`), `${surface} version`)
    }
    if (surface === 'Page' || surface === 'Post') {
      const row = surface === 'Page' ? page : post
      const escape = (value) =>
        value
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#x27;')
      assert(html.includes(escape(row.title)), `${surface} canonical title`)
      const texts = []
      const visit = (node) => {
        if (!node || typeof node !== 'object') return
        if (typeof node.text === 'string' && node.text.length > 15) texts.push(node.text)
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit)
          else if (value && typeof value === 'object') visit(value)
        }
      }
      visit(row.document)
      assert(
        texts.length && texts.some((text) => html.includes(escape(text))),
        `${surface} published revision text`,
      )
      console.log(
        JSON.stringify({
          surface,
          path,
          status,
          contentId: row.id,
          publishedRevision: row.latest_published_revision_id,
          template: row.content_type,
        }),
      )
    } else console.log(JSON.stringify({ surface, path, status }))
  }
} finally {
  await client.end()
}
