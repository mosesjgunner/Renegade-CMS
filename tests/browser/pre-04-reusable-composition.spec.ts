import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import {
  createPageFromTemplate,
  createPattern,
  createTemplate,
  instantiatePattern,
  rollbackLayout,
} from '@/modules/presentation/composition'
import type { LayoutBlock, PageLayout } from '@/modules/public/page-builder'

test('PRE-04: multi-page Renegade Party mini-site, pattern reuse, template inheritance, responsive preview presets, and published stability', async ({
  page,
  context,
  playwright,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)

  // 1. Setup test site and publication with renegade-party theme
  const site = await payload.create({
    collection: 'sites',
    data: { name: `Party MiniSite ${suffix}`, slug: `party-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)

  const publication = await payload.create({
    collection: 'publications',
    data: {
      site: site.id,
      name: `Party MiniSite ${suffix}`,
      slug: `party-${suffix}`,
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)

  const user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string | number; email?: string }
  expect(user).toBeTruthy()

  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sessionId, user.id, expiresAt],
      )
    },
  )

  await context.addCookies([
    { name: 'renegade-passkey', value: session.token, url: 'http://localhost:3110' },
  ])

  const heroBlock: LayoutBlock = {
    id: `hero-${suffix}`,
    component: 'publisher.hero',
    componentVersion: 1,
    props: {
      title: 'Renegade Party 2026',
      body: 'Autonomous, resilient, and community-owned publishing.',
      alignment: 'center',
      spacing: 'normal',
      width: 'standard',
      background: 'canvas',
      emphasis: 'bold',
    },
    visible: { desktop: true, tablet: true, mobile: true },
  }

  const ctaBlock: LayoutBlock = {
    id: `cta-${suffix}`,
    component: 'publisher.cta',
    componentVersion: 1,
    props: {
      title: 'Join the Movement',
      body: 'Get your membership card today.',
      alignment: 'center',
      spacing: 'compact',
      width: 'wide',
      background: 'brand',
      emphasis: 'normal',
    },
    visible: { desktop: true, tablet: true, mobile: false },
  }

  try {
    // 2. Create a reusable Page Template
    const template = await createTemplate(payload, {
      siteId: String(site.id),
      name: 'Renegade Campaign Template',
      themeId: 'renegade-party',
      category: 'Campaign',
      blocks: [heroBlock, ctaBlock],
    })
    expect(template.surface).toBe('template')

    // 3. Create a reusable Pattern
    const pattern = await createPattern(payload, {
      siteId: String(site.id),
      name: 'Party Membership Banner',
      themeId: 'renegade-party',
      category: 'Actions',
      blocks: [ctaBlock],
    })
    expect(pattern.surface).toBe('pattern')

    // 4. Create Page 1 (Home) reusing pattern as linked instance
    const linkedPatternBlocks = instantiatePattern(pattern, 'linked')
    const page1Path = `/party-home-${suffix}`
    const page1 = (await payload.create({
      collection: 'page-layouts',
      overrideAccess: true,
      data: {
        site: site.id,
        name: 'Party Home',
        path: page1Path,
        themeId: 'renegade-party',
        surface: 'page',
        slot: 'main',
        layoutVersion: 1,
        status: 'published',
        visibility: 'public',
        blocks: [heroBlock, ...linkedPatternBlocks],
        unknownBlocks: [],
        revision: 1,
        publishedRevision: 1,
      },
    } as never)) as unknown as PageLayout

    // 5. Create Page 2 (Events) from the reusable template
    const page2Path = `/party-events-${suffix}`
    const page2 = await createPageFromTemplate(payload, {
      siteId: String(site.id),
      path: page2Path,
      name: 'Party Events & Rallies',
      templateId: template.id,
      templateMode: 'inherited',
    })
    expect(page2.templateId).toBe(template.id)

    // Publish Page 2 explicitly
    await payload.update({
      collection: 'page-layouts',
      id: page2.id,
      overrideAccess: true,
      context: { publishPresentation: true },
      data: {
        status: 'published',
        publishedRevision: page2.revision,
      },
    } as never)

    // 6. Test anonymous public access to Page 2
    const anonymous = await playwright.request.newContext({ baseURL: 'http://localhost:3110' })
    const initialPage2Res = await anonymous.get(page2Path)
    expect(initialPage2Res.status()).toBe(200)
    const initialPage2Html = await initialPage2Res.text()
    expect(initialPage2Html).toContain('Renegade Party 2026')
    expect(initialPage2Html).toContain('Join the Movement')

    // 7. Update the template to revision 2 with brand new title
    await payload.update({
      collection: 'page-layouts',
      id: template.id,
      overrideAccess: true,
      data: {
        blocks: [
          {
            ...heroBlock,
            props: { ...heroBlock.props, title: 'BRAND NEW TEMPLATE TITLE V2' },
          },
        ],
        revision: template.revision + 1,
      },
    } as never)

    // 8. PROVE PUBLISHED PAGE 2 IS NOT SURPRISE-UPDATED!
    // An anonymous visitor MUST continue seeing the original published title!
    const page2AfterTemplateChange = await anonymous.get(page2Path)
    expect(page2AfterTemplateChange.status()).toBe(200)
    const page2AfterTemplateChangeHtml = await page2AfterTemplateChange.text()
    expect(page2AfterTemplateChangeHtml).toContain('Renegade Party 2026')
    expect(page2AfterTemplateChangeHtml).not.toContain('BRAND NEW TEMPLATE TITLE V2')

    // 9. Versioned Global Region: create, edit, and rollback
    const globalPath = `__global__/announcement-${suffix}`
    const globalRegion = (await payload.create({
      collection: 'page-layouts',
      overrideAccess: true,
      data: {
        site: site.id,
        name: 'Site-wide Announcement Banner',
        path: globalPath,
        themeId: 'renegade-party',
        surface: 'global',
        slot: 'announcement',
        layoutVersion: 1,
        status: 'published',
        visibility: 'public',
        blocks: [
          {
            id: `ann-${suffix}`,
            component: 'publisher.rich-content',
            componentVersion: 1,
            props: {
              title: 'Global Announcement Revision 1',
              body: 'Welcome to the rally!',
              alignment: 'center',
            },
          },
        ],
        unknownBlocks: [],
        revision: 1,
        publishedRevision: 1,
        revisionHistory: [
          {
            revision: 1,
            blocks: [
              {
                id: `ann-${suffix}`,
                component: 'publisher.rich-content',
                componentVersion: 1,
                props: {
                  title: 'Global Announcement Revision 1',
                  body: 'Welcome to the rally!',
                  alignment: 'center',
                },
              },
            ],
            action: 'created',
            savedAt: new Date().toISOString(),
          },
        ],
      },
    } as never)) as unknown as { id: string | number }

    // Editing the stored draft after publication must not leak through the shell.
    await payload.update({
      collection: 'page-layouts',
      id: globalRegion.id,
      overrideAccess: true,
      data: {
        revision: 2,
        blocks: [
          {
            id: `ann-${suffix}`,
            component: 'publisher.rich-content',
            componentVersion: 1,
            props: {
              title: 'UNPUBLISHED GLOBAL DRAFT',
              body: 'This must stay private.',
              alignment: 'center',
            },
          },
        ],
      },
    } as never)

    // A global region is more than a stored PageLayout: only its published
    // snapshot may reach the anonymous public shell.
    const pageWithGlobal = await anonymous.get(page1Path)
    await expect(pageWithGlobal.text()).resolves.toContain('Global Announcement Revision 1')
    await expect(pageWithGlobal.text()).resolves.not.toContain('UNPUBLISHED GLOBAL DRAFT')

    // Rollback global region test
    const rolledBack = await rollbackLayout(payload, {
      layoutId: String(globalRegion.id),
      targetRevision: 1,
    })
    expect(rolledBack.blocks[0].props.title).toBe('Global Announcement Revision 1')

    // 10. Studio Navigation verification in Visual Editor Shell
    await page.goto(`/builder/${page1.id}`)
    await expect(page.getByText('Renegade visual editor')).toBeVisible()

    // Verify Navigator Tabs
    const studioNav = page.getByTestId('studio-navigator')
    await expect(studioNav.getByRole('button', { name: /^Pages/i })).toBeVisible()
    await expect(studioNav.getByRole('button', { name: /^Templates/i })).toBeVisible()
    await expect(studioNav.getByRole('button', { name: /^Globals/i })).toBeVisible()
    await expect(studioNav.getByRole('button', { name: /^Patterns/i })).toBeVisible()

    // Click Templates tab
    await studioNav.getByRole('button', { name: /^Templates/i }).click()
    await expect(page.getByRole('cell', { name: 'Renegade Campaign Template' })).toBeVisible()

    // Click Patterns tab
    await studioNav.getByRole('button', { name: /^Patterns/i }).click()
    await expect(page.getByText('Party Membership Banner')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Insert Linked' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Insert Snapshot' }).first()).toBeVisible()

    // 11. Responsive Preview Presets verification
    // Desktop preview
    await page.goto(`/builder/${page1.id}/preview?viewport=desktop`)
    const desktopMain = page.locator('main[data-authenticated-draft-preview]')
    await expect(desktopMain).toHaveAttribute('data-viewport', 'desktop')
    await expect(desktopMain).toContainText('Renegade Party 2026')

    // Tablet preview
    await page.goto(`/builder/${page1.id}/preview?viewport=tablet`)
    const tabletMain = page.locator('main[data-authenticated-draft-preview]')
    await expect(tabletMain).toHaveAttribute('data-viewport', 'tablet')

    // Mobile preview
    await page.goto(`/builder/${page1.id}/preview?viewport=mobile`)
    const mobileMain = page.locator('main[data-authenticated-draft-preview]')
    await expect(mobileMain).toHaveAttribute('data-viewport', 'mobile')

    await anonymous.dispose()
  } finally {
    // Cleanup
    await payload.delete({
      collection: 'page-layouts',
      where: { site: { equals: site.id } },
      overrideAccess: true,
    } as never)
    await payload.delete({ collection: 'publications', id: publication.id, overrideAccess: true })
    await payload.db.pool.query('DELETE FROM admin_sessions WHERE id=$1', [session.sessionId])
    await payload.delete({ collection: 'sites', id: site.id, overrideAccess: true })
  }
})
