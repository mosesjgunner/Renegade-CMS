import { expect, test } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// UXI-15 remainder — live re-audit of the full shipped surface on the final
// tree. Every page route in the Stage 1 inventory's scope (all page.tsx
// under (frontend) and (embed)) is requested unauthenticated against the
// production build. Expected outcomes:
//   200            public surface renders
//   3xx → /login   staff-gated surface refuses anonymously (correct)
//   404            dynamic route without a record, or genuinely missing
//   5xx            FAILURE — a shipped surface must never error anonymously
// Results land in test-results/uxi15-crawl.json and feed the refreshed
// JOURNEY_AND_SURFACE_MATRIX.md dispositions in docs/rc/install-ux/.

const ROUTES: Array<{ path: string; note: string }> = [
  { path: '/', note: 'publication home' },
  { path: '/articles', note: 'article archive' },
  { path: '/videos', note: 'video archive (UXI-D16 empty state)' },
  { path: '/events', note: 'events archive' },
  { path: '/calendar', note: 'calendar (UXI-D13 orphan)' },
  { path: '/store', note: 'storefront' },
  { path: '/donate', note: 'donate' },
  { path: '/cart', note: 'cart' },
  { path: '/checkout', note: 'checkout (UXI-D17 duplicate of /cart)' },
  { path: '/forums', note: 'forums index (UXI-D13 orphan)' },
  { path: '/members', note: 'members directory' },
  { path: '/subscribe', note: 'subscribe landing' },
  { path: '/subscribe/preferences', note: 'email preferences (canonical)' },
  { path: '/preferences', note: 'UXI-D17: redirects to /subscribe/preferences' },
  { path: '/login', note: 'staff sign-in' },
  { path: '/member-auth', note: 'member sign-in' },
  { path: '/setup', note: 'setup spine' },
  { path: '/guided-setup', note: 'guided setup (staff APIs gate data)' },
  { path: '/enroll', note: 'staff enrollment (token-scoped panel without token)' },
  { path: '/pos', note: 'point of sale (UXI-D10: honest preview + staff gate)' },
  { path: '/moderation', note: 'moderation (UXI-D14: gated after Stage 5)' },
  { path: '/graphics-studio', note: 'graphics studio (UXI-D15 preview)' },
  { path: '/social-studio', note: 'social studio (preview)' },
  { path: '/connections', note: 'connections (redirects to /login)' },
  { path: '/admin/operations', note: 'operations (frontend admin gate)' },
  { path: '/admin/releases', note: 'releases (frontend admin gate)' },
  { path: '/podcasts/demo-show', note: 'podcast show page (dynamic; 404 if unseeded)' },
  { path: '/browse', note: 'browse/discovery' },
  { path: '/search', note: 'search' },
]

type CrawlEntry = {
  path: string
  note: string
  status: number
  finalUrl: string
  h1: string | null
  error: string | null
}

const results: CrawlEntry[] = []

test.describe.configure({ mode: 'serial' })
test.setTimeout(300_000)

test.afterAll(() => {
  const dir = path.resolve(process.cwd(), 'test-results')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'uxi15-crawl.json'), JSON.stringify(results, null, 2))
})

for (const route of ROUTES) {
  test(`crawl ${route.path}`, async ({ page }) => {
    let status = 0
    let error: string | null = null
    try {
      const response = await page.goto(route.path, { waitUntil: 'load', timeout: 30_000 })
      status = response?.status() ?? 0
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 160) : String(e)
    }
    const h1 = await page
      .locator('h1')
      .first()
      .textContent()
      .catch(() => null)
    const entry: CrawlEntry = {
      path: route.path,
      note: route.note,
      status,
      finalUrl: page.url(),
      h1: h1?.trim().slice(0, 80) ?? null,
      error,
    }
    results.push(entry)
    console.log(
      `CRAWL ${route.path} → ${status} ${entry.finalUrl.replace('http://localhost:3110', '')} h1=${JSON.stringify(entry.h1)}`,
    )
    expect(error, `${route.path} navigation error`).toBeNull()
    expect(status, `${route.path} must not 5xx anonymously`).toBeLessThan(500)
    expect(status, `${route.path} must resolve (not 0)`).toBeGreaterThan(0)
  })
}
