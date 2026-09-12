/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import {
  checkLayoutDeletionSafeguards,
  createPageFromTemplate,
  createPattern,
  createTemplate,
  duplicateTemplate,
  exportPresentationPackage,
  getPagesUsingTemplate,
  importPresentationPackage,
  instantiatePattern,
  reactivateTemplate,
  retireTemplate,
  rollbackLayout,
  syncPageWithTemplate,
  validatePresentationImport,
} from '../../src/modules/presentation/composition'
import type { LayoutBlock } from '../../src/modules/public/page-builder'

let payload: Payload
let siteId: string

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  const site = (
    await payload.find({
      collection: 'sites',
      where: { slug: { equals: 'demo-publication' } },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as any
  siteId = String(site.id)
})

afterAll(async () => payload?.db.destroy?.())

describe('PRE-04 reusable composition integration', () => {
  const heroBlock: LayoutBlock = {
    id: `hero-${randomUUID().slice(0, 6)}`,
    component: 'publisher.hero',
    componentVersion: 1,
    props: {
      title: 'Party Campaign Hero',
      body: 'Building the visual platform for all',
      alignment: 'center',
      spacing: 'normal',
      width: 'standard',
      background: 'canvas',
      emphasis: 'bold',
    },
    visible: { desktop: true, tablet: true, mobile: true },
  }

  const ctaBlock: LayoutBlock = {
    id: `cta-${randomUUID().slice(0, 6)}`,
    component: 'publisher.cta',
    componentVersion: 1,
    props: {
      title: 'Join the Renegade Community',
      body: 'Sign up now',
      alignment: 'center',
      spacing: 'compact',
      width: 'wide',
      background: 'brand',
      emphasis: 'normal',
    },
    visible: { desktop: true, tablet: true, mobile: false },
  }

  it('1. manages template lifecycle: create, duplicate, retire, reactivate, and instantiate', async () => {
    // Create template
    const template = await createTemplate(payload, {
      siteId,
      name: 'Renegade Rally Template',
      themeId: 'neutral-starter',
      category: 'Events',
      blocks: [heroBlock, ctaBlock],
    })
    expect(template.surface).toBe('template')
    expect(template.slot).toBe('main')
    expect(template.blocks.length).toBe(2)
    expect(template.isRetired).toBe(false)

    // Duplicate template
    const duplicated = await duplicateTemplate(payload, template.id)
    expect(duplicated.name).toBe('Renegade Rally Template (Copy)')
    expect(duplicated.surface).toBe('template')
    expect(duplicated.blocks.length).toBe(2)
    expect(duplicated.blocks[0].id).not.toBe(template.blocks[0].id)

    // Retire template
    const retired = await retireTemplate(payload, template.id)
    expect(retired.isRetired).toBe(true)

    // Cannot create page from retired template
    await expect(
      createPageFromTemplate(payload, {
        siteId,
        path: `/event-${randomUUID().slice(0, 6)}`,
        name: 'Retired Test Page',
        templateId: template.id,
      }),
    ).rejects.toThrow('Retired templates cannot be used to create new pages.')

    // Reactivate template
    const reactivated = await reactivateTemplate(payload, template.id)
    expect(reactivated.isRetired).toBe(false)

    // Create page from active template
    const pagePath = `/rally-${randomUUID().slice(0, 6)}`
    const page = await createPageFromTemplate(payload, {
      siteId,
      path: pagePath,
      name: 'Spring Rally 2026',
      templateId: template.id,
      templateMode: 'inherited',
    })
    expect(page.surface).toBe('page')
    expect(page.templateId).toBe(template.id)
    expect(page.templateMode).toBe('inherited')
    expect(page.blocks.length).toBe(2)

    // Track pages using template
    const usage = await getPagesUsingTemplate(payload, template.id, siteId)
    expect(usage.pages.some((p) => p.id === page.id)).toBe(true)
  })

  it('2. proves published pages are never surprise-updated when templates change', async () => {
    // 1. Create a template
    const template = await createTemplate(payload, {
      siteId,
      name: 'Manifesto Template',
      themeId: 'neutral-starter',
      category: 'Publications',
      blocks: [heroBlock],
    })

    // 2. Create a page from the template and publish it
    const pagePath = `/manifesto-${randomUUID().slice(0, 6)}`
    const draftPage = await createPageFromTemplate(payload, {
      siteId,
      path: pagePath,
      name: 'Official Manifesto',
      templateId: template.id,
      templateMode: 'inherited',
    })

    // Publish the page explicitly
    const publishedDoc = (await payload.update({
      collection: 'page-layouts',
      id: draftPage.id,
      overrideAccess: true,
      context: { publishPresentation: true },
      data: {
        status: 'published',
        publishedRevision: draftPage.revision,
      },
    } as never)) as any

    expect(publishedDoc.status).toBe('published')
    expect(publishedDoc.publishedRevision).toBe(draftPage.revision)
    const initialBlocksJson = JSON.stringify(publishedDoc.blocks)

    // 3. Update the template (e.g. add a new block)
    const updatedTemplateDoc = (await payload.update({
      collection: 'page-layouts',
      id: template.id,
      overrideAccess: true,
      data: {
        blocks: [heroBlock, ctaBlock],
        revision: template.revision + 1,
      },
    } as never)) as any
    expect(updatedTemplateDoc.revision).toBe(template.revision + 1)

    // 4. Fetch the published page from the database: it MUST NOT be surprise-updated!
    const pageAfterTemplateUpdate = (await payload.findByID({
      collection: 'page-layouts',
      id: draftPage.id,
      overrideAccess: true,
    })) as any

    expect(JSON.stringify(pageAfterTemplateUpdate.blocks)).toBe(initialBlocksJson)
    expect(pageAfterTemplateUpdate.blocks.length).toBe(1)
    expect(pageAfterTemplateUpdate.publishedRevision).toBe(draftPage.revision)

    // 5. Synchronize draft with template
    const syncResult = await syncPageWithTemplate(payload, draftPage.id)
    expect(syncResult.updated).toBe(true)
    expect(syncResult.page.blocks.length).toBe(2)

    // 6. Verify published revision on the page was NOT changed by sync
    const pageAfterSync = (await payload.findByID({
      collection: 'page-layouts',
      id: draftPage.id,
      overrideAccess: true,
    })) as any
    // The draft has new blocks, but publishedRevision is STILL untouched!
    expect(pageAfterSync.publishedRevision).toBe(draftPage.revision)
  })

  it('3. creates reusable patterns and enforces deletion safeguards', async () => {
    // Create pattern
    const pattern = await createPattern(payload, {
      siteId,
      name: 'Call To Action Pattern',
      themeId: 'neutral-starter',
      category: 'Actions',
      blocks: [ctaBlock],
    })
    expect(pattern.surface).toBe('pattern')
    expect(pattern.slot).toBe('main')

    // Instantiate as linked
    const linkedBlocks = instantiatePattern(pattern, 'linked')
    expect(linkedBlocks[0].component).toBe('publisher.pattern')
    expect(linkedBlocks[0].props.patternId).toBe(pattern.id)

    // Create a page that uses the linked pattern
    const pagePath = `/pattern-user-${randomUUID().slice(0, 6)}`
    const pageWithPattern = (await payload.create({
      collection: 'page-layouts',
      overrideAccess: true,
      data: {
        site: siteId,
        name: 'Page with Linked Pattern',
        path: pagePath,
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        layoutVersion: 1,
        status: 'draft',
        visibility: 'public',
        blocks: linkedBlocks,
        unknownBlocks: [],
        revision: 1,
      },
    } as never)) as any

    // Safeguards: pattern deletion MUST be blocked because it is linked in a layout!
    const patternSafeguard = await checkLayoutDeletionSafeguards(payload, pattern.id)
    expect(patternSafeguard.safe).toBe(false)
    expect(patternSafeguard.reason).toContain('is linked in 1 layout(s)')
    expect(patternSafeguard.referencingPages?.[0].id).toBe(String(pageWithPattern.id))

    // Unlink pattern from the page
    await payload.update({
      collection: 'page-layouts',
      id: pageWithPattern.id,
      overrideAccess: true,
      data: { blocks: [] },
    } as never)

    // Now safeguard allows deletion
    const patternSafeguardAfter = await checkLayoutDeletionSafeguards(payload, pattern.id)
    expect(patternSafeguardAfter.safe).toBe(true)
  })

  it('4. manages global regions and supports rollback', async () => {
    const globalPath = `__global__/announcement-${randomUUID().slice(0, 6)}`
    const announcementBlock: LayoutBlock = {
      id: `ann-${randomUUID().slice(0, 6)}`,
      component: 'publisher.rich-content',
      componentVersion: 1,
      props: {
        title: 'Important Party Announcement v1',
        body: 'Party convention on Saturday!',
        alignment: 'center',
        spacing: 'compact',
      },
    }

    // 1. Create global announcement
    const globalDoc = (await payload.create({
      collection: 'page-layouts',
      overrideAccess: true,
      data: {
        site: siteId,
        name: 'Site-wide Announcement',
        path: globalPath,
        themeId: 'neutral-starter',
        surface: 'global',
        slot: 'announcement',
        layoutVersion: 1,
        status: 'draft',
        visibility: 'public',
        blocks: [announcementBlock],
        unknownBlocks: [],
        revision: 1,
        revisionHistory: [
          {
            revision: 1,
            blocks: [announcementBlock],
            action: 'created',
            savedAt: new Date().toISOString(),
          },
        ],
      },
    } as never)) as any
    expect(globalDoc.slot).toBe('announcement')

    // 2. Update announcement to v2
    const updatedAnnouncementBlock: LayoutBlock = {
      ...announcementBlock,
      props: { ...announcementBlock.props, title: 'Updated Announcement v2' },
    }
    await payload.update({
      collection: 'page-layouts',
      id: globalDoc.id,
      overrideAccess: true,
      data: {
        blocks: [updatedAnnouncementBlock],
        revision: 2,
        revisionHistory: [
          ...globalDoc.revisionHistory,
          {
            revision: 2,
            blocks: [updatedAnnouncementBlock],
            action: 'updated',
            savedAt: new Date().toISOString(),
          },
        ],
      },
    } as never)

    // 3. Rollback to revision 1
    const rolledBack = await rollbackLayout(payload, {
      layoutId: globalDoc.id,
      targetRevision: 1,
    })
    expect(rolledBack.revision).toBe(3)
    expect(rolledBack.blocks[0].props.title).toBe('Important Party Announcement v1')
  })

  it('5. exports and imports presentation packages with cross-theme validation', async () => {
    // Export site package
    const pkg = await exportPresentationPackage(payload, siteId)
    expect(pkg.schema).toBe('renegade-presentation-package')
    expect(pkg.version).toBe(1)
    expect(Array.isArray(pkg.pages)).toBe(true)
    expect(Array.isArray(pkg.templates)).toBe(true)

    // Validate import against current theme
    const validation = validatePresentationImport(pkg, 'neutral-starter')
    expect(validation.valid).toBe(true)
    expect(validation.compatible).toBe(true)

    // Dry-run import
    const dryRun = await importPresentationPackage(payload, {
      siteId,
      targetThemeId: 'neutral-starter',
      packageData: pkg,
      dryRun: true,
    })
    expect(dryRun.valid).toBe(true)
    expect(dryRun.compatible).toBe(true)
    expect(dryRun.importedCount).toBe(0)
  })
})
