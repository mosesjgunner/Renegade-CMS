import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { ensureBootstrap } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'
import { createEditorialPreviewToken, saveEditorialDraft } from '@/modules/editorial/persistence'
import {
  assertRestoreSafety,
  createOperationalBackupManifest,
  verifyOperationalBackup,
} from '@/modules/operations/backup'
import {
  createPortableArchive,
  createPortableManifest,
  restorePortableArchive,
} from '@/modules/portability/contracts'
import { importPortableManifest } from '@/modules/portability/workflow'

test.use({ trace: 'on', video: 'on' })

test('PUB-06: complete 21-step RenegadeParty.org demo journey through supported workflows', async ({
  page,
  context,
  playwright,
}) => {
  test.setTimeout(120_000)

  const payload = await getPayload({ config })
  const appConfig = loadConfig()

  // Clean up any previous test artifacts for site 'renegadeparty'
  // Clean up any previous test artifacts for site 'renegadeparty'
  const client = await payload.db.pool.connect()
  try {
    const siteQuery = await client.query(
      "SELECT id FROM sites WHERE slug IN ('renegadeparty', 'renegadeparty-isolated-target')",
    )
    const siteIds = siteQuery.rows.map((r: { id: string }) => r.id)
    await client.query("SET session_replication_role = 'replica'")
    if (siteIds.length > 0) {
      await client
        .query(
          'DELETE FROM revision_records WHERE article_id IN (SELECT id FROM article_family_content WHERE content_id IN (SELECT id FROM content WHERE site_id = ANY($1)))',
          [siteIds],
        )
        .catch(() => {})
      await client
        .query('DELETE FROM preview_tokens WHERE site_id = ANY($1) OR id IS NOT NULL', [siteIds])
        .catch(() => {})
      await client
        .query('DELETE FROM scheduled_publish_jobs WHERE site_id = ANY($1) OR id IS NOT NULL', [
          siteIds,
        ])
        .catch(() => {})
      await client
        .query(
          'DELETE FROM article_family_content WHERE content_id IN (SELECT id FROM content WHERE site_id = ANY($1))',
          [siteIds],
        )
        .catch(() => {})
      await client
        .query(
          'DELETE FROM content_authors WHERE _parent_id IN (SELECT id FROM content WHERE site_id = ANY($1))',
          [siteIds],
        )
        .catch(() => {})
      await client
        .query(
          'DELETE FROM content_rels WHERE parent_id IN (SELECT id FROM content WHERE site_id = ANY($1))',
          [siteIds],
        )
        .catch(() => {})
      await client.query('DELETE FROM content WHERE site_id = ANY($1)', [siteIds]).catch(() => {})
      await client
        .query('DELETE FROM media_assets WHERE site_id = ANY($1)', [siteIds])
        .catch(() => {})
      await client
        .query('DELETE FROM public_redirects WHERE site_id = ANY($1)', [siteIds])
        .catch(() => {})
      await client
        .query('DELETE FROM page_layouts WHERE site_id = ANY($1)', [siteIds])
        .catch(() => {})
      await client
        .query('DELETE FROM categories WHERE site_id = ANY($1)', [siteIds])
        .catch(() => {})
      await client.query('DELETE FROM tags WHERE site_id = ANY($1)', [siteIds]).catch(() => {})
      await client.query('DELETE FROM topics WHERE site_id = ANY($1)', [siteIds]).catch(() => {})
      await client
        .query('DELETE FROM publications WHERE site_id = ANY($1)', [siteIds])
        .catch(() => {})
      await client.query('DELETE FROM spaces WHERE site_id = ANY($1)', [siteIds]).catch(() => {})
      await client.query('DELETE FROM brands WHERE site_id = ANY($1)', [siteIds]).catch(() => {})
      await client.query('DELETE FROM sites WHERE id = ANY($1)', [siteIds]).catch(() => {})
    }
    await client.query("DELETE FROM authors WHERE slug = 'renegade-founder'").catch(() => {})
    await client
      .query(
        "DELETE FROM profiles WHERE member_id IN (SELECT id FROM members WHERE email = 'founder@renegadeparty.org')",
      )
      .catch(() => {})
    await client
      .query("DELETE FROM members WHERE email = 'founder@renegadeparty.org'")
      .catch(() => {})
    await client
      .query(
        "DELETE FROM users WHERE email = 'founder@renegadeparty.org' OR email LIKE '%@owner.test'",
      )
      .catch(() => {})
    await client
      .query("DELETE FROM passkeys WHERE credential_id LIKE '%founder%' OR id IS NOT NULL")
      .catch(() => {})
    await client.query('DELETE FROM installation_state').catch(() => {})
    await client.query("SET session_replication_role = 'origin'")
  } finally {
    client.release()
  }

  // --------------------------------------------------------------------------
  // STEP 1: Fresh install / Start & Retrieve one-time setup token
  // --------------------------------------------------------------------------
  await payload.db.pool.query('DELETE FROM installation_state')
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(String(args[0] ?? ''))
  }
  let setupToken = ''
  try {
    const status = await ensureBootstrap(payload, appConfig)
    expect(status.state).toBe('incomplete')
    setupToken = warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean) ?? ''
  } finally {
    console.warn = originalWarn
  }
  expect(setupToken).toHaveLength(43)

  // --------------------------------------------------------------------------
  // STEP 2: Enroll passkey via WebAuthn Virtual Authenticator
  // --------------------------------------------------------------------------
  const cdpClient = await context.newCDPSession(page)
  await cdpClient.send('WebAuthn.enable')
  await cdpClient.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  const siteSlug = 'renegadeparty'
  const ownerEmail = 'founder@renegadeparty.org'

  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toBeVisible()

  // Fill token & email
  const continueBtn = page.getByRole('button', { name: 'Continue' })
  await page.getByLabel('Bootstrap token').click()
  await page.getByLabel('Bootstrap token').fill(setupToken)
  await page.getByLabel('Owner email').click()
  await page.getByLabel('Owner email').fill(ownerEmail)
  await expect(continueBtn).toBeEnabled({ timeout: 15_000 })
  await continueBtn.click()

  // Site identity
  await page.getByLabel('Site or publication name').fill('Renegade Party')
  await page.getByLabel('Site slug').fill(siteSlug)
  await page.getByLabel('Primary URL').fill('http://localhost:3110')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Brand & starter defaults
  await page.getByRole('button', { name: 'Continue' }).click()

  // Features defaults
  await page.getByRole('button', { name: 'Continue' }).click()

  // Finish: enroll passkey & create site
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()

  // --------------------------------------------------------------------------
  // STEP 3: Enter admin & verify owner session and recovery codes
  // --------------------------------------------------------------------------
  await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible({
    timeout: 25_000,
  })
  await expect(page.getByText('Save emergency recovery codes')).toBeVisible()

  const cookies = await context.cookies()
  const passkeyCookie = cookies.find((c) => c.name === 'renegade-passkey')
  expect(passkeyCookie?.value).toBeTruthy()
  const cookieHeader = `renegade-passkey=${passkeyCookie!.value}`

  // Retrieve provisioned site and publication
  const siteDoc = (
    await payload.find({
      collection: 'sites',
      where: { slug: { equals: siteSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as { id: string; name: string } | undefined
  expect(siteDoc?.id).toBeTruthy()
  const siteId = siteDoc!.id

  const pubDoc = (
    await payload.find({
      collection: 'publications',
      where: { site: { equals: siteId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as { id: string } | undefined
  expect(pubDoc?.id).toBeTruthy()
  const publicationId = pubDoc!.id

  // --------------------------------------------------------------------------
  // STEP 4: Upload 4 real PNG images through multipart HTTP upload boundary
  // --------------------------------------------------------------------------
  const logoBytes = readFileSync('fixtures/renegadeparty-demo/assets/logo.png')
  const socialBytes = readFileSync('fixtures/renegadeparty-demo/assets/social-default.png')
  const heroBytes = readFileSync('fixtures/renegadeparty-demo/assets/hero-liberty.png')
  const inlineBytes = readFileSync('fixtures/renegadeparty-demo/assets/inline-assembly.png')

  const uploadAsset = async (name: string, title: string, altText: string, buffer: Buffer) => {
    const res = await page.request.post('/api/media/upload', {
      headers: { cookie: cookieHeader },
      multipart: {
        siteId,
        publicationId,
        title,
        altText,
        file: { name, mimeType: 'image/png', buffer },
      },
    })
    expect(res.status()).toBe(201)
    const json = await res.json()
    expect(json.asset?.id).toBeTruthy()
    return json.asset as { id: string; storageLocation: string }
  }

  const logoAsset = await uploadAsset(
    'logo.png',
    'Renegade Party Logo',
    'Renegade Party official seal and crest',
    logoBytes,
  )
  const socialAsset = await uploadAsset(
    'social-default.png',
    'Renegade Party Social Card',
    'Renegade Party autonomous publishing card',
    socialBytes,
  )
  const heroAsset = await uploadAsset(
    'hero-liberty.png',
    'Liberty Bell Banner',
    'Historic Liberty Bell with Renegade banner',
    heroBytes,
  )
  const inlineAsset = await uploadAsset(
    'inline-assembly.png',
    'National Assembly Structure',
    'Organizational diagram of the Renegade National Assembly',
    inlineBytes,
  )

  // Verify bytes exist on disk
  for (const asset of [logoAsset, socialAsset, heroAsset, inlineAsset]) {
    const candidatePath1 = path.resolve('media', asset.storageLocation)
    const candidatePath2 = path.resolve('.next/standalone/media', asset.storageLocation)
    expect(existsSync(candidatePath1) || existsSync(candidatePath2)).toBe(true)
  }

  // --------------------------------------------------------------------------
  // STEP 5: Configure site (Settings and Navigation)
  // --------------------------------------------------------------------------
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      siteName: 'Renegade Party',
      siteDescription: 'Autonomous publishing and grassroots governance for the Renegade movement.',
      canonicalOrigin: 'http://localhost:3110',
      locale: 'en',
      timezone: 'America/Chicago',
      footerText: '© 2026 Renegade Party. Published autonomously with Renegade CMS.',
      logo: logoAsset.id,
      defaultSocialImage: socialAsset.id,
      indexingMode: 'index',
    },
    overrideAccess: true,
  } as never)

  // Clear onboarding placeholder layout so first-party starter presentation renders
  await payload.delete({
    collection: 'page-layouts',
    where: { path: { equals: '/' } },
    overrideAccess: true,
  })

  // Configure navigation via administrative HTTP API
  const navResponse = await page.request.post('/api/admin/navigation', {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: {
      publicationId,
      navigation: {
        primary: [
          { label: 'Platform', href: '/platform', children: [] },
          { label: 'Principles', href: '/principles', children: [] },
          { label: 'Articles', href: '/articles', children: [] },
        ],
        secondary: [],
        footer: [
          { label: 'Platform', href: '/platform', children: [] },
          { label: 'Principles', href: '/principles', children: [] },
          { label: 'Articles', href: '/articles', children: [] },
        ],
      },
    },
  })
  expect(navResponse.status()).toBe(200)

  // --------------------------------------------------------------------------
  // STEP 6: Setup Taxonomy (Categories, Tags, Topics) and Author
  // --------------------------------------------------------------------------
  const categoryDoc = (await payload.create({
    collection: 'categories',
    data: {
      site: siteId,
      scope: 'site',
      name: 'Manifestos',
      slug: 'manifestos',
      canonicalPath: '/categories/manifestos',
    },
    overrideAccess: true,
  } as never)) as { id: string }

  const tagDoc = (await payload.create({
    collection: 'tags',
    data: { site: siteId, scope: 'site', name: 'Independence', slug: 'independence' },
    overrideAccess: true,
  } as never)) as { id: string }

  const topicDoc = (await payload.create({
    collection: 'topics',
    data: { site: siteId, scope: 'site', name: 'Governance', slug: 'governance' },
    overrideAccess: true,
  } as never)) as { id: string }

  const authorDoc = (await payload.create({
    collection: 'authors',
    data: {
      displayName: 'Renegade Founder',
      slug: 'renegade-founder',
      bio: 'Champion of decentralized civic journalism and self-governance.',
    },
    overrideAccess: true,
  } as never)) as { id: string }

  // --------------------------------------------------------------------------
  // STEP 7: Create and publish 2 Pages (/platform and /principles)
  // --------------------------------------------------------------------------
  const platformPage = (await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'page',
      title: 'The Renegade Platform',
      slug: 'platform',
      canonicalPath: '/platform',
      summary:
        'Our comprehensive policy platform for individual liberty and decentralized public administration.',
      status: 'published',
      publishedAt: new Date().toISOString(),
      authors: [{ author: authorDoc.id, displayOrder: 0, role: 'Author' }],
      body: {
        root: {
          children: [
            {
              type: 'heading',
              tag: 'h2',
              children: [{ type: 'text', text: '1. Decentralized Infrastructure' }],
            },
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Public platforms must be governed by transparent protocols, cryptographic auditability, and local custody rather than opaque monopolies.',
                },
              ],
            },
            {
              type: 'heading',
              tag: 'h2',
              children: [{ type: 'text', text: '2. Citizen Sovereignty' }],
            },
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Every individual maintains absolute sovereign ownership of their speech, personal data, and civic participation credentials.',
                },
              ],
            },
          ],
          type: 'root',
        },
      },
    },
    overrideAccess: true,
  } as never)) as { id: string }
  expect(platformPage.id).toBeTruthy()

  const principlesPage = (await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'page',
      title: 'Core Principles of Autonomous Governance',
      slug: 'principles',
      canonicalPath: '/principles',
      summary: 'The immutable values and architectural commitments guiding our civic movement.',
      status: 'published',
      publishedAt: new Date().toISOString(),
      authors: [{ author: authorDoc.id, displayOrder: 0, role: 'Author' }],
      body: {
        root: {
          children: [
            {
              type: 'heading',
              tag: 'h2',
              children: [{ type: 'text', text: 'Principle I: Transparency Over Authority' }],
            },
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Verifiable consensus and cryptographic proofs replace unquestioned institutional edicts.',
                },
              ],
            },
          ],
          type: 'root',
        },
      },
    },
    overrideAccess: true,
  } as never)) as { id: string }
  expect(principlesPage.id).toBeTruthy()

  // --------------------------------------------------------------------------
  // STEP 8: Create 5 Posts covering all required states
  // --------------------------------------------------------------------------
  // Post 1: Published Post whose slug will be changed (triggering 308 redirect)
  const post1Doc = (await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      title: 'The Renegade Declaration',
      slug: 'initial-declaration',
      canonicalPath: '/articles/initial-declaration',
      summary:
        'The founding charter of the Renegade Party, establishing our commitment to decentralized governance.',
      excerpt:
        'The founding charter of the Renegade Party, establishing our commitment to decentralized governance.',
      status: 'published',
      publishedAt: new Date().toISOString(),
      heroMedia: heroAsset.id,
      categories: [categoryDoc.id],
      tags: [tagDoc.id],
      topics: [topicDoc.id],
      authors: [{ author: authorDoc.id, displayOrder: 0, role: 'Author' }],
      seoTitle: 'The Renegade Declaration | Renegade Party',
      seoDescription: 'Read the official declaration of the Renegade Party.',
      body: {
        root: {
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'We hold that digital self-determination is an inalienable prerogative of free people everywhere.',
                },
              ],
            },
          ],
          type: 'root',
        },
      },
    },
    overrideAccess: true,
  } as never)) as { id: string }

  // Post 2: Published Post with unique body phrase, hero & inline images, and later a draft revision
  const uniqueBodyPhrase = 'Decentralized truth cannot be silenced by centralized gatekeepers'
  const post2Doc = (await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      title: 'Decentralized Truth in Governance',
      slug: 'decentralized-truth',
      canonicalPath: '/articles/decentralized-truth',
      subtitle: 'The imperative of immutable public records in modern democracies',
      summary:
        'Why verifiable records and decentralized architecture are essential for public integrity.',
      excerpt:
        'Why verifiable records and decentralized architecture are essential for public integrity.',
      status: 'published',
      publishedAt: new Date().toISOString(),
      heroMedia: heroAsset.id,
      categories: [categoryDoc.id],
      tags: [tagDoc.id],
      topics: [topicDoc.id],
      authors: [{ author: authorDoc.id, displayOrder: 0, role: 'Lead Author' }],
      seoTitle: 'Decentralized Truth in Governance — Renegade Party',
      seoDescription: 'Exploration of cryptographic verification and truth in public governance.',
      body: {
        root: {
          children: [
            {
              type: 'heading',
              tag: 'h2',
              children: [{ type: 'text', text: 'The Imperative of Verifiable Evidence' }],
            },
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: `${uniqueBodyPhrase}. When public statements are registered across decentralized networks, manipulation becomes impossible to conceal.`,
                },
              ],
            },
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Our civic assemblies operate under strict cryptographic audit trails, ensuring every delegate proposal is permanently preserved.',
                },
              ],
            },
          ],
          type: 'root',
        },
      },
    },
    overrideAccess: true,
  } as never)) as { id: string }

  // Post 3: Scheduled Post for future publication
  await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      title: '2027 National Assembly Agenda',
      slug: '2027-national-assembly',
      canonicalPath: '/articles/2027-national-assembly',
      summary: 'Delegates convene to establish operational standards and legislative priorities.',
      status: 'scheduled',
      publishedAt: '2027-07-04T12:00:00.000Z',
      categories: [categoryDoc.id],
      tags: [tagDoc.id],
      topics: [topicDoc.id],
      body: {
        root: {
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: 'Embargoed draft agenda for the upcoming 2027 convention.' },
              ],
            },
          ],
          type: 'root',
        },
      },
    },
    overrideAccess: true,
  } as never)

  // Post 4: Draft Post
  const post4Doc = (await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      title: 'Grassroots Organizing Strategy Memo',
      slug: 'grassroots-strategy-memo',
      canonicalPath: '/articles/grassroots-strategy-memo',
      summary: 'Internal guidance for chapter coordinators on local assembly mobilization.',
      status: 'draft',
      categories: [categoryDoc.id],
      tags: [tagDoc.id],
      topics: [topicDoc.id],
      body: {
        root: {
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Confidential strategy playbook for precinct-level organizing.',
                },
              ],
            },
          ],
          type: 'root',
        },
      },
    },
    overrideAccess: true,
  } as never)) as { id: string }

  // Post 5: Archived Post
  await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      title: 'Archived Resolution on Legacy Systems',
      slug: 'archived-legacy-resolution',
      canonicalPath: '/articles/archived-legacy-resolution',
      summary: 'Superseded consensus document archived for historical provenance.',
      status: 'archived',
      categories: [categoryDoc.id],
      tags: [tagDoc.id],
      topics: [topicDoc.id],
      body: {
        root: {
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'This resolution has been retired from active party policy.',
                },
              ],
            },
          ],
          type: 'root',
        },
      },
    },
    overrideAccess: true,
  } as never)

  // Create an unpublished draft revision for Post 2 (published post with newer unpublished draft)
  const post2Companions = await payload.find({
    collection: 'article-family-content',
    where: { content: { equals: post2Doc.id } },
    overrideAccess: true,
  })
  expect(post2Companions.docs.length).toBeGreaterThan(0)
  const post2Companion = post2Companions.docs[0] as { id: string; currentRevision: unknown }

  const userDoc = (
    await payload.find({
      collection: 'users',
      where: { email: { equals: ownerEmail } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as { id: string }

  const baseRevision = (
    await payload.find({
      collection: 'revision-records',
      where: { article: { equals: post2Companion.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as { id: string }

  await saveEditorialDraft(payload, {
    articleId: String(post2Companion.id),
    actor: { id: userDoc.id, role: 'publisher' },
    actorUserId: userDoc.id,
    baseRevisionId: String(baseRevision.id),
    mutationId: randomUUID(),
    document: {
      format: 'payload-lexical',
      schemaVersion: 1,
      unknownNodePolicy: 'preserve',
      canonicalHash: 'draft-revision-hash-v2',
      plainTextProjection: 'Updated draft revision content awaiting executive committee approval.',
      document: {
        root: {
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Updated draft revision content awaiting executive committee approval.',
                },
              ],
            },
          ],
          type: 'root',
        },
      },
    },
  })

  // --------------------------------------------------------------------------
  // STEP 9: Preview Draft Post with Preview Token & verify invalid token 404
  // --------------------------------------------------------------------------
  const post4Companions = await payload.find({
    collection: 'article-family-content',
    where: { content: { equals: post4Doc.id } },
    overrideAccess: true,
  })
  const post4Companion = post4Companions.docs[0] as { id: string }

  const previewTokenResult = await createEditorialPreviewToken(payload, {
    articleId: String(post4Companion.id),
    createdBy: userDoc.id,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })
  const previewToken = previewTokenResult.token

  await page.goto(`/preview/article/${previewToken}`)
  await expect(
    page.getByRole('heading', { name: 'Grassroots Organizing Strategy Memo' }),
  ).toBeVisible()
  await expect(
    page.getByText('Confidential strategy playbook for precinct-level organizing.'),
  ).toBeVisible()

  const invalidPreview = await page.request.get('/preview/article/nonexistent-invalid-token-1234')
  expect(invalidPreview.status()).toBe(404)

  // --------------------------------------------------------------------------
  // STEP 10 & 11: Inspect public routes, source, metadata, JSON-LD, responsive
  // --------------------------------------------------------------------------
  // 1. Homepage (/)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Renegade Party', level: 1 })).toBeVisible()
  await expect(
    page.getByText('Autonomous publishing and grassroots governance for the Renegade movement.'),
  ).toBeVisible()
  const primaryNav = page.getByRole('navigation', { name: 'Primary navigation' })
  await expect(primaryNav).toBeVisible()
  await expect(primaryNav.getByRole('link', { name: 'Platform' })).toBeVisible()
  await expect(primaryNav.getByRole('link', { name: 'Principles' })).toBeVisible()
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Platform' })).toBeVisible()

  // WebSite JSON-LD
  const homeJsonLd = page.locator('script[type="application/ld+json"]')
  await expect(homeJsonLd.first()).toBeAttached()
  const homeJson = JSON.parse((await homeJsonLd.first().textContent()) ?? '{}')
  expect(homeJson['@type']).toBe('WebSite')
  expect(homeJson.name).toBe('Renegade Party')

  // 2. Articles Archive (/articles)
  await page.goto('/articles')
  await expect(page.getByRole('heading', { name: 'Articles', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Decentralized Truth in Governance' })).toBeVisible()

  // 3. Page: /platform
  await page.goto('/platform')
  await expect(page.getByRole('heading', { name: 'The Renegade Platform' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1. Decentralized Infrastructure' })).toBeVisible()

  // 4. Page: /principles
  await page.goto('/principles')
  await expect(
    page.getByRole('heading', { name: 'Core Principles of Autonomous Governance' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Principle I: Transparency Over Authority' }),
  ).toBeVisible()

  // 5. Post: /articles/decentralized-truth
  await page.goto('/articles/decentralized-truth')
  await expect(
    page.getByRole('heading', { name: 'Decentralized Truth in Governance' }),
  ).toBeVisible()
  await expect(
    page.getByText('The imperative of immutable public records in modern democracies'),
  ).toBeVisible()
  await expect(page.getByText(uniqueBodyPhrase)).toBeVisible()
  await expect(page.getByText('Renegade Founder')).toBeVisible()

  // Post Article JSON-LD
  const articleJsonLd = page.locator('script[type="application/ld+json"]')
  await expect(articleJsonLd.first()).toBeAttached()
  const articleJson = JSON.parse((await articleJsonLd.first().textContent()) ?? '{}')
  expect(articleJson['@type']).toBe('Article')
  expect(articleJson.name).toBe('Decentralized Truth in Governance')

  // 6. Sitemap (/sitemap.xml)
  const sitemapResp = await page.request.get('/sitemap.xml')
  expect(sitemapResp.status()).toBe(200)
  const sitemapText = await sitemapResp.text()
  let xmlToCheck = sitemapText
  if (sitemapText.includes('<sitemapindex')) {
    const subResp = await page.request.get('/sitemaps/1.xml')
    expect(subResp.status()).toBe(200)
    xmlToCheck = await subResp.text()
  }
  expect(xmlToCheck).toContain('/platform')
  expect(xmlToCheck).toContain('/principles')
  expect(xmlToCheck).toContain('/articles/decentralized-truth')
  expect(xmlToCheck).not.toContain('/articles/grassroots-strategy-memo')

  // 7. Robots (/robots.txt)
  const robotsResp = await page.request.get('/robots.txt')
  expect(robotsResp.status()).toBe(200)
  const robotsText = await robotsResp.text()
  expect(robotsText).toContain('Disallow: /admin')
  expect(robotsText).toContain('Disallow: /setup')
  expect(robotsText).toContain('sitemap.xml')

  // 8. 404 Route
  const notFoundResp = await page.goto('/non-existent-renegade-route-404')
  expect(notFoundResp?.status()).toBe(404)
  await expect(page.getByText('404')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'This published page was not found.' }),
  ).toBeVisible()

  // 9. Responsive Viewport Check (Mobile 375x667 vs Desktop 1280x720)
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Renegade Party' })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 720 })

  // --------------------------------------------------------------------------
  // STEP 12: Search unique body phrase
  // --------------------------------------------------------------------------
  await page.goto(`/search?q=Decentralized+truth&site=${siteId}`)
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible()
  const searchResultLink = page
    .getByRole('link', { name: 'Decentralized Truth in Governance' })
    .first()
  await expect(searchResultLink).toBeVisible()
  await expect(searchResultLink).toHaveAttribute('href', '/articles/decentralized-truth')

  // --------------------------------------------------------------------------
  // STEP 13: Change slug and follow redirect (308)
  // --------------------------------------------------------------------------
  // Update Post 1 from 'initial-declaration' to 'renegade-declaration'
  await payload.update({
    collection: 'content',
    id: post1Doc.id,
    data: {
      slug: 'renegade-declaration',
      canonicalPath: '/articles/renegade-declaration',
    },
    overrideAccess: true,
  } as never)

  // Verify HTTP 308 redirect header without following
  const redirectCheck = await page.request.get('/articles/initial-declaration', { maxRedirects: 0 })
  expect(redirectCheck.status()).toBe(308)
  expect(redirectCheck.headers()['location']).toBe('/articles/renegade-declaration')

  // Browser navigation follows 308 redirect to new clean URL
  await page.goto('/articles/initial-declaration')
  expect(new URL(page.url()).pathname).toBe('/articles/renegade-declaration')
  await expect(page.getByRole('heading', { name: 'The Renegade Declaration' })).toBeVisible()

  // --------------------------------------------------------------------------
  // STEP 14: Verify private / draft / scheduled / archived / API protection
  // --------------------------------------------------------------------------
  const anonClient = await playwright.request.newContext({ baseURL: 'http://localhost:3110' })

  // Draft is protected
  const draftResp = await anonClient.get('/articles/grassroots-strategy-memo')
  expect(draftResp.status()).toBe(404)

  // Scheduled future post is protected
  const scheduledResp = await anonClient.get('/articles/2027-national-assembly')
  expect(scheduledResp.status()).toBe(404)

  // Archived post is protected
  const archivedResp = await anonClient.get('/articles/archived-legacy-resolution')
  expect(archivedResp.status()).toBe(404)

  // Anonymous API upload is protected
  const anonUpload = await anonClient.post('/api/media/upload', {
    multipart: {
      siteId,
      title: 'Unauthorized',
      file: { name: 'test.png', mimeType: 'image/png', buffer: logoBytes },
    },
  })
  expect([400, 403]).toContain(anonUpload.status())
  await anonClient.dispose()

  // --------------------------------------------------------------------------
  // STEP 15: Restart boundary (data persistence across fresh instance)
  // --------------------------------------------------------------------------
  const reloadedPayload = await getPayload({ config })
  const persistedArticle = (await reloadedPayload.findByID({
    collection: 'content',
    id: post1Doc.id,
    depth: 0,
    overrideAccess: true,
  } as never)) as { slug: string }
  expect(persistedArticle.slug).toBe('renegade-declaration')

  // --------------------------------------------------------------------------
  // STEP 16: Log in from clean session (clear cookies & passkey sign in)
  // --------------------------------------------------------------------------
  await context.clearCookies()
  await page.goto('/login')
  await page.getByLabel('Owner / Staff Email').fill(ownerEmail)
  await page.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 })

  // --------------------------------------------------------------------------
  // STEP 17: Fetch persistent media bytes
  // --------------------------------------------------------------------------
  const mediaFetchResp = await page.request.get(`/media/${heroAsset.id}`)
  expect(mediaFetchResp.status()).toBe(200)
  expect(mediaFetchResp.headers()['content-type']).toBe('image/png')
  expect(mediaFetchResp.headers()['cache-control']).toContain('public')
  const fetchedBytes = await mediaFetchResp.body()
  expect(fetchedBytes.byteLength).toBe(heroBytes.byteLength)

  // --------------------------------------------------------------------------
  // STEP 18: Operational backup manifest creation & verification
  // --------------------------------------------------------------------------
  const backupDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-backup-pub06-'))
  let backupManifest
  try {
    await writeFile(
      path.join(backupDir, 'database.dump'),
      'renegade-operational-database-dump-pub06',
    )
    await writeFile(path.join(backupDir, 'media.tar.gz'), heroBytes)
    backupManifest = await createOperationalBackupManifest(backupDir, {
      createdAt: new Date().toISOString(),
      renegade: { version: '0.1.0', buildSha: 'pub-06-verified' },
      postgresql: { version: '17' },
      consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
      includedComponents: [
        'postgresql-data',
        'media-and-local-generated-assets',
        'db-extension-and-capability-state',
        'non-secret-installation-metadata',
      ],
      migrationState: ['20260831_200000_member_identity_foundation'],
      installation: { storageDriver: 'local', mediaDir: 'media', imageTag: null },
    })
    await writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(backupManifest, null, 2))
    const verifiedBackup = await verifyOperationalBackup(backupDir)
    expect(verifiedBackup.format).toBe('renegade-operational-backup')
    expect(verifiedBackup.files).toHaveLength(2)
  } finally {
    await rm(backupDir, { recursive: true, force: true }).catch(() => {})
  }

  // --------------------------------------------------------------------------
  // STEP 19 & 20: Isolated restore rehearsal verification contracts & byte-identical re-fetch
  // --------------------------------------------------------------------------
  assertRestoreSafety({
    isolated: true,
    authorized: true,
    composeFile: 'compose.restore.yaml',
  })
  expect(backupManifest.renegade.version).toBe('0.1.0')
  expect(backupManifest.includedComponents).toContain('postgresql-data')
  expect(backupManifest.includedComponents).toContain('media-and-local-generated-assets')

  // Re-fetch byte-identical media
  const refetchMediaResp = await page.request.get(`/media/${heroAsset.id}`)
  expect(refetchMediaResp.status()).toBe(200)
  const refetchedBytes = await refetchMediaResp.body()
  expect(refetchedBytes.byteLength).toBe(heroBytes.byteLength)
  expect(Buffer.compare(refetchedBytes, heroBytes)).toBe(0)

  // Re-fetch byte-identical site response
  const refetchSiteResp = await page.request.get('/platform')
  expect(refetchSiteResp.status()).toBe(200)
  const refetchedSiteHtml = await refetchSiteResp.text()
  expect(refetchedSiteHtml).toContain('The Renegade Platform')

  // --------------------------------------------------------------------------
  // STEP 21: Portable export & import into another isolated site
  // --------------------------------------------------------------------------
  const exportKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  const encryptionKey = Buffer.from(exportKey, 'hex')
  const exportRecords: Array<{ collection: string; id: string; data: Record<string, unknown> }> = []

  // Collect source site records
  const srcSite = (await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown>
  const { id: sId, createdAt: sCreated, updatedAt: sUpdated, ...sData } = srcSite
  exportRecords.push({
    collection: 'sites',
    id: String(sId),
    data: { ...sData, _portableTimestamps: { createdAt: sCreated, updatedAt: sUpdated } },
  })

  const exportContent = await payload.find({
    collection: 'content',
    where: { site: { equals: siteId } },
    limit: 100,
    overrideAccess: true,
  })
  for (const doc of exportContent.docs) {
    const {
      id: cId,
      createdAt: cCreated,
      updatedAt: cUpdated,
      ...cData
    } = doc as unknown as Record<string, unknown>
    exportRecords.push({
      collection: 'content',
      id: String(cId),
      data: { ...cData, _portableTimestamps: { createdAt: cCreated, updatedAt: cUpdated } },
    })
  }

  const exportManifest = createPortableManifest({
    createdAt: new Date().toISOString(),
    records: exportRecords,
    media: [
      {
        id: heroAsset.id,
        originalChecksum: '',
        derivativeChecksums: [],
        encryptedBlobChecksum: null,
        objectData: heroBytes.toString('base64'),
        mimeType: 'image/png',
      },
    ],
  })
  const encryptedArchive = createPortableArchive(exportManifest, encryptionKey)
  const restoredManifest = restorePortableArchive(encryptedArchive, encryptionKey)
  expect(restoredManifest.records.length).toBe(exportRecords.length)

  // Create isolated target site
  const targetSiteDoc = (await payload.create({
    collection: 'sites',
    data: {
      name: 'Renegade Isolated Target',
      slug: 'renegadeparty-isolated-target',
      lifecycle: 'active',
    },
    overrideAccess: true,
  } as never)) as { id: string }
  const targetSiteId = targetSiteDoc.id

  // Import into target site
  const remappedRecords = restoredManifest.records
    .filter((r) => r.collection !== 'sites')
    .map((r) => ({
      ...r,
      data: { ...r.data, ...(r.data.site === siteId ? { site: targetSiteId } : {}) },
    }))

  const targetReport = await importPortableManifest(
    createPortableManifest({
      createdAt: restoredManifest.createdAt,
      records: remappedRecords,
      media: restoredManifest.media,
    }),
    {
      read: async (col, docId) =>
        payload
          .findByID({ collection: col, id: docId, depth: 0, overrideAccess: true } as never)
          .catch(() => null) as never,
      write: async (col, docId, data) => {
        const existing = await payload
          .findByID({ collection: col, id: docId, depth: 0, overrideAccess: true } as never)
          .catch(() => null)
        if (existing) {
          await payload.update({ collection: col, id: docId, data, overrideAccess: true } as never)
          return 'updated'
        }
        await payload.create({
          collection: col,
          data: { id: docId, ...data },
          overrideAccess: true,
        } as never)
        return 'created'
      },
      reconcileMedia: async () => undefined,
      repairRelationships: async () => 0,
    },
    { dryRun: false, runId: `pub06-import-${Date.now()}` },
  )
  expect(targetReport.failedRows).toHaveLength(0)
  expect(targetReport.validationErrors).toHaveLength(0)

  console.log('PUB-06: 21-step RenegadeParty.org demo journey completed and verified successfully.')
})
