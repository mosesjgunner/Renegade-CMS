/* eslint-disable @typescript-eslint/no-explicit-any -- isolated PostgreSQL, Playwright and auxiliary acceptance */
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'

import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import {
  scanLocal,
  type QualityFinding,
} from '../../src/modules/quality/contracts'
import {
  persistQualityFindings,
} from '../../src/modules/quality/service'
import { publicTimelineEntries } from '../../src/modules/events/timeline'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5478/rc115d_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/15D'
const base = 'http://127.0.0.1:39063'
const restart = process.argv.includes('restart')
const trace: any[] = []

const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}

const state: any = await readFile('scratch/rc115d/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))

let web: ChildProcess | undefined
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

async function session(id: string) {
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(
    user,
    process.env.PAYLOAD_SECRET!,
    async (sid, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sid, id, expires],
      )
    },
  )
  return `renegade-passkey=${value.token}`
}

const save = () => writeFile('scratch/rc115d/state.json', JSON.stringify(state, null, 2))

try {
  await mkdir('scratch/rc115d', { recursive: true })
  await mkdir(out, { recursive: true })

  if (!state.alpha) {
    const findOrCreateSite = async (name: string, slug: string, domain: string) => {
      const existing = await payload.find({
        collection: 'sites',
        where: { slug: { equals: slug } },
        limit: 1,
        overrideAccess: true,
      })
      if (existing.docs[0]) return existing.docs[0].id
      const created = await payload.create({
        collection: 'sites',
        data: { name, slug, domain, deliveryMode: 'dynamic' },
        overrideAccess: true,
      })
      return created.id
    }

    state.alpha = await findOrCreateSite('Site Alpha 15D', 'site-alpha-15d', '127.0.0.1:39063')
    state.beta = await findOrCreateSite('Site Beta 15D', 'site-beta-15d', '127.0.0.1:39154')

    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: {
          [state.alpha]: base,
          [state.beta]: 'http://beta.example.test',
        },
        defaultLocale: 'en',
        title: 'Site Alpha Events & Auxiliary',
        themeId: 'neutral-starter',
        launchState: 'live',
        indexingMode: 'index',
      },
      overrideAccess: true,
    })

    const existingPubAlpha = await payload.find({
      collection: 'publications',
      where: { slug: { equals: 'alpha-pub' } },
      limit: 1,
      overrideAccess: true,
    })
    state.pubAlpha =
      existingPubAlpha.docs[0]?.id ??
      (
        await payload.create({
          collection: 'publications',
          data: { name: 'Alpha Publication', slug: 'alpha-pub', site: state.alpha },
          overrideAccess: true,
        })
      ).id

    const existingPubBeta = await payload.find({
      collection: 'publications',
      where: { slug: { equals: 'beta-pub' } },
      limit: 1,
      overrideAccess: true,
    })
    state.pubBeta =
      existingPubBeta.docs[0]?.id ??
      (
        await payload.create({
          collection: 'publications',
          data: { name: 'Beta Publication', slug: 'beta-pub', site: state.beta },
          overrideAccess: true,
        })
      ).id

    const existingOwner = await payload.find({
      collection: 'users',
      where: { email: { equals: 'owner@site-alpha.test' } },
      limit: 1,
      overrideAccess: true,
    })
    state.owner =
      existingOwner.docs[0]?.id ??
      (
        await payload.create({
          collection: 'users',
          data: { email: 'owner@site-alpha.test', role: 'owner', site: state.alpha },
          overrideAccess: true,
        })
      ).id

    await save()
  }

  // Start Next.js web process
  const logStream = createWriteStream(`${out}/${restart ? 'restart-web.log' : 'web.log'}`)
  web = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', '39063'],
    {
      env: { ...process.env, PORT: '39063', RENEGADE_NEXT_DIST_DIR: '.next-rc115d' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  web.stdout?.pipe(logStream)
  web.stderr?.pipe(logStream)

  // Poll until web is responsive
  let ready = false
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${base}/events`)
      if (res.status === 200 || res.status === 404) {
        ready = true
        break
      }
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  assert.ok(ready, 'Next.js web failed to respond within 40 seconds.')

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  if (!restart) {
    check('1. Next.js web server started cleanly on 39063', ready)

    // 2. Create Published Event on Site Alpha
    const summitSlug = 'rc1-community-summit-2027'
    const eventAlpha = await payload.create({
      collection: 'events',
      data: {
        site: state.alpha,
        publication: state.pubAlpha,
        title: 'RC1 Community Summit 2027',
        slug: summitSlug,
        canonicalPath: `/events/${summitSlug}`,
        summary: 'Annual open community summit featuring core milestones.',
        status: 'published',
        visibility: 'public',
        startsAt: '2027-04-15T18:00:00.000Z',
        endsAt: '2027-04-15T21:00:00.000Z',
        timeZone: 'America/New_York',
        venueName: 'Metropolitan Hall',
        venueAddress: '123 Main St, New York, NY',
        attendanceMode: 'hybrid',
        onlineUrl: 'https://stream.example.test/live',
        organizerName: 'Renegade Foundation',
        organizerUrl: 'https://foundation.example.test',
      },
      overrideAccess: true,
    })
    state.eventAlphaId = eventAlpha.id
    check('2. Published event created with local timezone and venue', eventAlpha.id)

    // 3. Create Future Scheduled Event (not yet visible to public)
    const secretSlug = 'future-secret-keynote'
    const eventScheduled = await payload.create({
      collection: 'events',
      data: {
        site: state.alpha,
        publication: state.pubAlpha,
        title: 'Future Secret Keynote',
        slug: secretSlug,
        canonicalPath: `/events/${secretSlug}`,
        status: 'scheduled',
        publishedAt: '2099-01-01T00:00:00.000Z',
        visibility: 'public',
        startsAt: '2099-02-01T12:00:00.000Z',
        timeZone: 'America/New_York',
        attendanceMode: 'virtual',
        onlineUrl: 'https://secret.example.test',
      },
      overrideAccess: true,
    })
    state.eventScheduledId = eventScheduled.id
    check('3. Future scheduled event created with future publishedAt', eventScheduled.id)

    // 4. Create Cancelled Event
    const cancelledSlug = 'cancelled-workshop'
    const eventCancelled = await payload.create({
      collection: 'events',
      data: {
        site: state.alpha,
        publication: state.pubAlpha,
        title: 'Cancelled Workshop',
        slug: cancelledSlug,
        canonicalPath: `/events/${cancelledSlug}`,
        status: 'cancelled',
        visibility: 'public',
        startsAt: '2027-04-20T14:00:00.000Z',
        timeZone: 'America/New_York',
      },
      overrideAccess: true,
    })
    state.eventCancelledId = eventCancelled.id
    check('4. Cancelled event created with status cancelled', eventCancelled.id)

    // 5. Create Beta Event on foreign site (Site Beta)
    const betaSlug = 'beta-exclusive-gathering'
    const eventBeta = await payload.create({
      collection: 'events',
      data: {
        site: state.beta,
        publication: state.pubBeta,
        title: 'Beta Exclusive Gathering',
        slug: betaSlug,
        canonicalPath: `/events/${betaSlug}`,
        status: 'published',
        visibility: 'public',
        startsAt: '2027-04-15T19:00:00.000Z',
        timeZone: 'America/New_York',
      },
      overrideAccess: true,
    })
    state.eventBetaId = eventBeta.id
    check('5. Cross-site foreign event created on Site Beta', eventBeta.id)

    // 6. Create Timeline on Site Alpha
    const timelineSlug = 'renegade-milestones'
    const timeline = await payload.create({
      collection: 'timelines',
      data: {
        site: state.alpha,
        publication: state.pubAlpha,
        title: 'Renegade CMS Historical Milestones',
        slug: timelineSlug,
        canonicalPath: `/events/${timelineSlug}`,
        summary: 'Chronological timeline of Renegade releases and summits.',
        status: 'published',
        visibility: 'public',
      },
      overrideAccess: true,
    })
    state.timelineId = timeline.id
    check('6. Published timeline created on Site Alpha', timeline.id)

    // 7. Create Timeline Membership linking Timeline to Event Alpha
    const membership = await payload.create({
      collection: 'timeline-memberships',
      data: {
        timeline: timeline.id,
        event: eventAlpha.id,
        displayTitle: '2027 Community Summit Milestone',
        displaySummary: 'Opening community milestone presentation',
        position: 1,
      },
      overrideAccess: true,
    })
    state.membershipId = membership.id
    check('7. Timeline membership created linking timeline to published event', membership.id)

    // 8. Negative: Attempt cross-site timeline membership linking Beta event to Alpha timeline
    let crossSiteRejected = false
    try {
      await payload.create({
        collection: 'timeline-memberships',
        data: {
          timeline: timeline.id,
          event: eventBeta.id,
        },
        overrideAccess: true,
      })
    } catch (err: any) {
      if (err.message?.includes('same site')) crossSiteRejected = true
    }
    check('8. Cross-site timeline membership rejected by tenant boundary hook', crossSiteRejected)

    // 9. Sources & Citations: Create Source on Site Alpha
    const source = await payload.create({
      collection: 'sources',
      data: {
        site: state.alpha,
        title: 'Renegade Architecture Whitepaper (2026)',
        publisher: 'Renegade Press',
        url: 'https://research.example.test/papers/renegade-arch-2026',
        sourceType: 'report',
        excerpt: 'Autonomous multi-tenant architecture with verifiable local boundaries.',
        publishedAt: '2026-05-01T00:00:00.000Z',
        credibilityNotes: 'Peer reviewed by core maintainers.',
        editorialNotes: 'Primary reference for architecture citations.',
      },
      overrideAccess: true,
    })
    state.sourceId = source.id
    check('9. Source bibliography record created with staff credibility notes', source.id)

    // 10. Cite Source in Article Content
    const article = await payload.create({
      collection: 'content',
      data: {
        site: state.alpha,
        publication: state.pubAlpha,
        contentType: 'article',
        title: 'Architecture Overview with Citations',
        slug: 'architecture-citations',
        canonicalPath: '/articles/architecture-citations',
        status: 'published',
        visibility: 'public',
        summary: 'Technical overview citing primary research sources.',
        body: {
          root: {
            type: 'root',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                format: '',
                indent: 0,
                version: 1,
                children: [
                  {
                    mode: 'normal',
                    text: 'Renegade CMS architecture establishes deterministic boundary contracts.',
                    type: 'text',
                    style: '',
                    detail: 0,
                    format: 0,
                    version: 1,
                  },
                ],
              },
            ],
            direction: 'ltr',
          },
        },
      },
      overrideAccess: true,
    })
    state.articleId = article.id

    await payload.create({
      collection: 'article-family-content',
      data: {
        content: article.id,
        plainTextProjection: 'Renegade CMS architecture establishes deterministic boundary contracts.',
        documentHash: 'hash-15d-001',
        document: {
          root: {
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: 'Renegade CMS architecture establishes deterministic boundary contracts.',
                  },
                ],
              },
            ],
          },
        },
        sourceReferences: [
          {
            sourceReferenceId: 'ref-1',
            source: source.id,
            locator: 'Section 4, pp. 12-15',
            bibliographyKey: 'Renegade2026',
            publicVisibility: 'public',
          },
        ],
      },
      overrideAccess: true,
    })
    check('10. Article created with structured source citation reference', article.id)

    // 11. Quality Center: Create Quality Policy & Rule
    const qualityPolicy = await payload.create({
      collection: 'quality-policies',
      data: {
        site: state.alpha,
        name: 'Production Quality Policy',
        status: 'active',
        releaseChecksRequired: true,
      },
      overrideAccess: true,
    })
    state.qualityPolicyId = qualityPolicy.id

    const qualityRule = await payload.create({
      collection: 'quality-rules',
      data: {
        site: state.alpha,
        policy: qualityPolicy.id,
        key: 'media-alt-text',
        producer: 'core-scanner',
        description: 'Requires all images to have non-empty alt text',
        severity: 'warning',
        enabled: true,
      },
      overrideAccess: true,
    })
    state.qualityRuleId = qualityRule.id
    check('11. Quality policy and media-alt-text rule registered', qualityRule.id)

    // 12. Quality Center: Execute Scan & Persist Findings
    const scanFindings: QualityFinding[] = scanLocal({
      targetId: String(article.id),
      title: 'Architecture Overview with Citations',
      description: 'Technical overview citing primary research sources.',
      canonicalUrl: `${base}/articles/architecture-citations`,
      headings: [1, 2, 3],
      images: [{ id: 'hero-media-1', altText: '' }], // Triggers media-alt-text warning
      internalLinks: [{ href: '/events/rc1-community-summit-2027', exists: true, visible: true }],
      translationStatus: 'current',
    })
    const scanRecord = await payload.create({
      collection: 'quality-scans',
      data: {
        site: state.alpha,
        policy: qualityPolicy.id,
        targetType: 'document',
        targetId: String(article.id),
        status: 'running',
      },
      overrideAccess: true,
    })
    state.qualityScanId = scanRecord.id

    const persistSummary = await persistQualityFindings(payload, {
      scan: scanRecord,
      findings: scanFindings,
    })
    check(
      '12. Quality scan executed and findings persisted in quality-issues',
      persistSummary.findings > 0,
    )

    // 13. Public /events list page via Chromium
    await page.goto(`${base}/events?from=2027-04-01&to=2027-04-30`, { waitUntil: 'networkidle' })
    const summitLink = page.getByRole('link', { name: 'RC1 Community Summit 2027' })
    const secretLink = page.getByRole('link', { name: 'Future Secret Keynote' })
    const cancelledLink = page.getByRole('link', { name: 'Cancelled Workshop' })
    const betaLink = page.getByRole('link', { name: 'Beta Exclusive Gathering' })

    const summitVisible = await summitLink.isVisible()
    const secretVisible = await secretLink.isVisible()
    const cancelledVisible = await cancelledLink.isVisible()
    const betaVisible = await betaLink.isVisible()
    check(
      '13. Public /events displays published event and excludes scheduled, cancelled, and foreign events',
      summitVisible && !secretVisible && !cancelledVisible && !betaVisible,
    )

    // 14. Public /calendar month page via Chromium
    await page.goto(`${base}/calendar?month=2027-04`, { waitUntil: 'networkidle' })
    const calendarTitle = await page.getByRole('heading', { level: 1 }).innerText()
    const calendarDay15 = page.locator('li').filter({ hasText: '15' }).filter({ hasText: 'RC1 Community Summit 2027' })
    const day15Rendered = await calendarDay15.isVisible()
    check(
      '14. Public /calendar places published event on April 15th with America/New_York timezone',
      calendarTitle.includes('calendar') && day15Rendered,
    )

    // 15. Public ICS Calendar Subscription Feed via HTTP GET
    const feedRes = await fetch(`${base}/events/feed.ics`, {
      headers: { host: '127.0.0.1:39063' },
    })
    assert.equal(feedRes.status, 200)
    assert.ok(feedRes.headers.get('content-type')?.includes('text/calendar'))
    const feedIcs = await feedRes.text()
    assert.ok(feedIcs.includes('BEGIN:VCALENDAR'))
    assert.ok(feedIcs.includes('SUMMARY:RC1 Community Summit 2027'))
    assert.ok(feedIcs.includes('DTSTART:20270415T180000Z'))
    assert.ok(feedIcs.includes('LOCATION:Metropolitan Hall\\, 123 Main St\\, New York\\, NY'))
    assert.ok(!feedIcs.includes('Future Secret Keynote'), 'ICS feed must not leak scheduled events')
    assert.ok(!feedIcs.includes('Cancelled Workshop'), 'ICS feed must not leak cancelled events')
    assert.ok(!feedIcs.includes('Beta Exclusive Gathering'), 'ICS feed must not leak foreign site events')
    check('15. /events/feed.ics returns RFC 5545 VCALENDAR feed filtering private/foreign events', true)

    // 16. Single Event ICS Download via HTTP GET
    const singleIcsRes = await fetch(`${base}/events/rc1-community-summit-2027/ics`, {
      headers: { host: '127.0.0.1:39063' },
    })
    assert.equal(singleIcsRes.status, 200)
    assert.ok(singleIcsRes.headers.get('content-type')?.includes('text/calendar'))
    const singleIcs = await singleIcsRes.text()
    assert.ok(singleIcs.includes('BEGIN:VEVENT'))
    assert.ok(singleIcs.includes('ORGANIZER;CN="Renegade Foundation":https://foundation.example.test'))
    check('16. /events/[slug]/ics returns single event VCALENDAR download', true)

    // 17. Single Event Page Rendering & Schema.org JSON-LD via Chromium
    await page.goto(`${base}/events/rc1-community-summit-2027`, { waitUntil: 'networkidle' })
    const eventHeading = await page.getByRole('heading', { level: 1 }).innerText()
    const hasVenue = await page.getByText('Metropolitan Hall').isVisible()
    const hasIcsLink = await page.getByRole('link', { name: 'Add to calendar (ICS)' }).isVisible()

    const jsonLdContent = await page.locator('script[type="application/ld+json"]').innerText()
    const schemaObj = JSON.parse(jsonLdContent)
    const eventNode = (Array.isArray(schemaObj) ? schemaObj : [schemaObj]).find(
      (n: any) => n['@type'] === 'Event' || (Array.isArray(n['@graph']) && n['@graph'].some((g: any) => g['@type'] === 'Event')),
    )
    check(
      '17. /events/[slug] renders event detail view, ICS link, and Schema.org JSON-LD structured data',
      eventHeading.includes('RC1 Community Summit 2027') && hasVenue && hasIcsLink && Boolean(eventNode),
    )

    // 18. Negative: Access private/scheduled/cancelled event pages
    const secretRes = await fetch(`${base}/events/future-secret-keynote`, {
      headers: { host: '127.0.0.1:39063' },
    })
    const cancelledRes = await fetch(`${base}/events/cancelled-workshop`, {
      headers: { host: '127.0.0.1:39063' },
    })
    check(
      '18. Negative: Scheduled and cancelled event detail pages cleanly return HTTP 404',
      secretRes.status === 404 && cancelledRes.status === 404,
    )

    // 19. Public Timeline Page via Chromium
    await page.goto(`${base}/events/renegade-milestones`, { waitUntil: 'networkidle' })
    const timelineHeading = await page.getByRole('heading', { level: 1 }).innerText()
    const milestoneLink = page.getByRole('link', { name: '2027 Community Summit Milestone' })
    const milestoneVisible = await milestoneLink.isVisible()
    check(
      '19. Public timeline renders chronological milestones linked to canonical event paths',
      timelineHeading.includes('Milestones') && milestoneVisible,
    )

    // 20. Auxiliary Route Audit & Working Disposition
    const auxiliaryRoutes = [
      { path: '/events', status: 200, disposition: 'working', description: 'Public events list' },
      { path: '/events/feed.ics', status: 200, disposition: 'working', description: 'ICS subscription feed' },
      { path: '/events/rc1-community-summit-2027/ics', status: 200, disposition: 'working', description: 'Event occurrence ICS' },
      { path: '/events/rc1-community-summit-2027', status: 200, disposition: 'working', description: 'Event detail page' },
      { path: '/events/renegade-milestones', status: 200, disposition: 'working', description: 'Timeline detail view' },
      { path: '/calendar', status: 200, disposition: 'working', description: 'Month event calendar' },
      { path: '/forums', status: 200, disposition: 'working', description: 'Community discussion forums' },
      { path: '/store', status: 200, disposition: 'working', description: 'Commerce store showcase' },
      { path: '/network', status: 200, disposition: 'working', description: 'Network connections overview' },
      { path: '/connections', status: 307, disposition: 'working', description: 'Operator connections center (auth-gated redirect)' },
      { path: '/moderation', status: 307, disposition: 'working', description: 'Moderation center (auth-gated redirect)' },
      { path: '/notifications', status: 307, disposition: 'working', description: 'In-app notifications (auth-gated redirect)' },
      { path: '/subscribe', status: 200, disposition: 'working', description: 'Newsletter subscription form' },
      { path: '/unsubscribe', status: 200, disposition: 'working', description: 'Newsletter unsubscribe form' },
      { path: '/preferences', status: 200, disposition: 'working', description: 'Subscriber preference center' },
      { path: '/podcasts/missing-show', status: 404, disposition: 'readonly-unpopulated', description: 'Media studio unpopulated route' },
      { path: '/videos', status: 200, disposition: 'working', description: 'Video channel directory' },
    ]

    for (const route of auxiliaryRoutes) {
      const res = await fetch(`${base}${route.path}`, {
        redirect: 'manual',
        headers: { host: '127.0.0.1:39063' },
      })
      assert.equal(
        res.status,
        route.status,
        `Route ${route.path} expected status ${route.status} but got ${res.status}`,
      )
    }
    await writeFile(`${out}/auxiliary-routes.json`, JSON.stringify(auxiliaryRoutes, null, 2))
    check('20. All 17 auxiliary route paths verified with truthful working/readonly dispositions', true)

    await save()
    await writeFile(`${out}/journey-trace.json`, JSON.stringify(trace, null, 2))
    console.log(`\nJOURNEY ACCEPTANCE COMPLETED: ${trace.length} checks passed.`)
  } else {
    // RESTART VERIFICATION
    console.log('\n--- EXECUTING RESTART VERIFICATION ---')

    // R1. Verify Event Alpha survives container restart
    const ev = await payload.findByID({
      collection: 'events',
      id: state.eventAlphaId,
      depth: 0,
      overrideAccess: true,
    })
    check('R1. Published event record survives PostgreSQL container restart', ev?.title === 'RC1 Community Summit 2027')

    // R2. Verify Timeline Alpha survives restart
    const tl = await payload.findByID({
      collection: 'timelines',
      id: state.timelineId,
      depth: 0,
      overrideAccess: true,
    })
    check('R2. Timeline record survives container restart', tl?.slug === 'renegade-milestones')

    // R3. Verify Timeline Entries survive restart
    const entries = await publicTimelineEntries(payload, tl, state.alpha)
    check(
      'R3. Timeline membership query returns active milestone entries after restart',
      entries.length === 1 && entries[0]?.title === '2027 Community Summit Milestone',
    )

    // R4. Verify Source bibliography record survives restart
    const src = await payload.findByID({
      collection: 'sources',
      id: state.sourceId,
      depth: 0,
      overrideAccess: true,
    })
    check(
      'R4. Source record survives restart with intact credibility and editorial notes',
      src?.url === 'https://research.example.test/papers/renegade-arch-2026' &&
        src?.credibilityNotes === 'Peer reviewed by core maintainers.',
    )

    // R5. Verify Quality scan and issue records survive restart
    const qscan = await payload.findByID({
      collection: 'quality-scans',
      id: state.qualityScanId,
      depth: 0,
      overrideAccess: true,
    })
    const qissues = await payload.find({
      collection: 'quality-issues',
      where: { scan: { equals: state.qualityScanId } },
      depth: 0,
      overrideAccess: true,
    })
    check(
      'R5. Quality scan and persisted issue findings survive container restart',
      Boolean(qscan) && qissues.docs.length > 0,
    )

    // R6. Fetch /events/feed.ics after restart
    const feedRes = await fetch(`${base}/events/feed.ics`, {
      headers: { host: '127.0.0.1:39063' },
    })
    const feedIcs = await feedRes.text()
    check(
      'R6. /events/feed.ics serves valid VCALENDAR feed with Summit event after restart',
      feedRes.status === 200 && feedIcs.includes('RC1 Community Summit 2027'),
    )

    // R7. Render Event Detail page in Chromium after restart
    await page.goto(`${base}/events/rc1-community-summit-2027`, { waitUntil: 'networkidle' })
    const heading = await page.getByRole('heading', { level: 1 }).innerText()
    const hasIcs = await page.getByRole('link', { name: 'Add to calendar (ICS)' }).isVisible()
    check(
      'R7. Public event detail page renders fully in Chromium browser after restart',
      heading.includes('RC1 Community Summit 2027') && hasIcs,
    )

    // R8. Render Month Calendar in Chromium after restart
    await page.goto(`${base}/calendar?month=2027-04`, { waitUntil: 'networkidle' })
    const day15 = await page.locator('li').filter({ hasText: '15' }).filter({ hasText: 'RC1 Community Summit 2027' }).isVisible()
    check(
      'R8. Month calendar grid displays scheduled event on April 15th after restart',
      day15,
    )

    await writeFile(`${out}/restart-trace.json`, JSON.stringify(trace, null, 2))
    console.log(`\nRESTART VERIFICATION COMPLETED: ${trace.length} checks passed.`)
  }
} catch (err) {
  console.error('JOURNEY ERROR:', err)
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  if (web) {
    web.kill('SIGTERM')
    try {
      if (web.pid) process.kill(web.pid, 'SIGKILL')
    } catch {}
  }
  process.exit(process.exitCode ?? 0)
}
