/* eslint-disable @typescript-eslint/no-explicit-any */
import { createLocalReq, type Payload } from 'payload'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mediaStorage } from '../media/storage'
import { loadConfig } from '../core/config'
import { transactionPayload } from '../core/transaction-payload'

import { starterDefinitions } from './definitions'
import { exampleContentChecksum } from './provenance'
import type { StarterId, StarterInstallStatus } from './contracts'
import { snapshotLayout } from '../presentation/snapshots'
import { importMarkdownToRichText } from '../editorial/markdown'
import { withExecutionLock } from '../operations/execution-lock'
import {
  beginRecipeRun,
  completeRecipeRun,
  failRecipeRun,
  recordRecipeSteps,
  stageRecipeMedia,
  type RecipeRunHandle,
  type RecipeStepOutcome,
} from '../operations/recipe-execution'

export const toLexicalDocument = (text: string) => {
  const convert = (node: any): any => {
    const type =
      node.type === 'markdown-heading'
        ? 'heading'
        : node.type === 'blockquote'
          ? 'quote'
          : node.type
    const result: any = { type, version: 1, format: node.format ?? '', indent: 0, direction: 'ltr' }
    if (node.children) result.children = node.children.map(convert)
    if (type === 'heading') result.tag = `h${node.level}`
    if (type === 'list') {
      result.tag = node.listType === 'ordered' ? 'ol' : 'ul'
      result.listType = node.listType === 'ordered' ? 'number' : 'bullet'
      result.start = 1
    }
    if (type === 'listitem') result.value = 1
    if (type === 'text')
      Object.assign(result, { text: node.text, format: 0, detail: 0, mode: 'normal', style: '' })
    return result
  }
  return { root: convert(importMarkdownToRichText(text).document.document.root) }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`
}

/**
 * Blocks are compared with link/media references reduced to the identity of
 * the record they point at plus their label: the two binding passes (install
 * and upgrade) legitimately produce different href spellings for the same
 * target, while a re-pointed reference or an edited label is a real change.
 */
function normalizeBlocksForCompare(blocks: unknown): unknown {
  if (Array.isArray(blocks)) return blocks.map(normalizeBlocksForCompare)
  if (blocks && typeof blocks === 'object') {
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(blocks as Record<string, unknown>)) {
      if (
        (key === 'link' || key === 'media') &&
        value &&
        typeof value === 'object' &&
        typeof (value as { id?: unknown }).id === 'string'
      ) {
        const reference = value as { id: string; label?: unknown }
        normalized[key] = { id: reference.id, label: reference.label ?? null }
      } else {
        normalized[key] = normalizeBlocksForCompare(value)
      }
    }
    return normalized
  }
  return blocks
}

export function blocksMatch(a: unknown, b: unknown): boolean {
  return (
    stableStringify(normalizeBlocksForCompare(a)) === stableStringify(normalizeBlocksForCompare(b))
  )
}

const STARTER_HISTORY_ACTIONS = new Set(['starter-install', 'starter-upgrade'])

/**
 * The last starter-generated blocks recorded for a layout, or undefined when
 * no reliable baseline exists (older installs, imported records). Without a
 * baseline an upgrade cannot prove a record is uncustomized, so callers must
 * preserve the record and surface a conflict instead of overwriting it.
 */
export function starterBaselineBlocks(doc: {
  revisionHistory?: unknown
}): Record<string, unknown>[] | undefined {
  if (!Array.isArray(doc.revisionHistory)) return undefined
  for (let index = doc.revisionHistory.length - 1; index >= 0; index--) {
    const entry = doc.revisionHistory[index] as {
      action?: unknown
      blocks?: unknown
    } | null
    if (entry && STARTER_HISTORY_ACTIONS.has(String(entry.action)) && Array.isArray(entry.blocks)) {
      return entry.blocks as Record<string, unknown>[]
    }
  }
  return undefined
}

async function upsertRecord(
  payload: Payload,
  collection: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  context: Record<string, unknown> = {},
): Promise<any> {
  const existing = await (payload as any).find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    // Starters may reference an existing identity, never rewrite its profile.
    if (collection === 'members' || collection === 'profiles') return existing.docs[0]
    const docId = existing.docs[0].id
    const updated = await (payload as any).update({
      collection,
      id: docId,
      data,
      context,
      overrideAccess: true,
    })
    return { id: String(docId), ...data, ...updated }
  }

  const created = await (payload as any).create({
    collection,
    data,
    context,
    overrideAccess: true,
  })
  return { id: String(created.id), ...data, ...created }
}

/** The starter pipeline's phases, recorded as journal step outcomes. */
const STARTER_STEP_KEYS = [
  'site',
  'owner',
  'publication',
  'media',
  'members',
  'pages',
  'articles',
  'products',
  'campaign',
  'templates',
  'patterns',
  'globals',
  'home-layout',
  'settings',
] as const

export type StarterInstallPlan = {
  siteId: string
  starterId: StarterId
  empty: boolean
  collisions: Array<{ kind: 'content' | 'layout' | 'media'; key: string; existingId: string }>
  additions: { content: number; layouts: number; media: number }
}

/**
 * The additive plan for installing a starter on a site that may already
 * have content (S2-10): every starter item is checked against the site's
 * actual records by its natural key, so an operator sees exactly what
 * would collide before anything is written. Installation itself still
 * refuses a non-empty site — the plan is the reviewable path forward
 * (upgrade, or install on an empty site), never a silent overwrite.
 */
export async function planStarterInstall(
  payload: Payload,
  input: { siteId: string; starterId: StarterId },
): Promise<StarterInstallPlan> {
  const starter = starterDefinitions[input.starterId]
  if (!Object.hasOwn(starterDefinitions, input.starterId))
    throw new Error(`Unknown starter experience: ${input.starterId}`)
  const collisions: StarterInstallPlan['collisions'] = []
  const findByKeys = async (
    collection: string,
    field: string,
    keys: string[],
    kind: StarterInstallPlan['collisions'][number]['kind'],
  ) => {
    if (!keys.length) return 0
    const found = await payload.find({
      collection,
      where: {
        and: [{ site: { equals: input.siteId } }, { [field]: { in: keys } }],
      },
      limit: keys.length,
      depth: 0,
      overrideAccess: true,
    } as never)
    const byKey = new Map(
      (found.docs as unknown as Array<Record<string, unknown>>).map((doc) => [
        String(doc[field]),
        String(doc.id),
      ]),
    )
    let hits = 0
    for (const key of keys) {
      const existingId = byKey.get(key)
      if (existingId) {
        hits += 1
        collisions.push({ kind, key, existingId })
      }
    }
    return hits
  }
  const contentKeys = [
    ...starter.pages.map((page) => page.canonicalPath),
    ...starter.articles.map((article) => article.canonicalPath),
  ]
  const layoutDefs = [
    ...starter.templates,
    ...starter.patterns,
    ...starter.globals,
    ...starter.layouts,
  ]
  const contentHits = await findByKeys('content', 'canonicalPath', contentKeys, 'content')
  const layoutHits = await findByKeys(
    'page-layouts',
    'path',
    layoutDefs.map((layout) => layout.path),
    'layout',
  )
  const mediaHits = await findByKeys(
    'media-assets',
    'originalFilename',
    starter.media.map((media) => media.originalFilename),
    'media',
  )
  const contentCount = await payload.count({
    collection: 'content',
    where: { site: { equals: input.siteId } },
    overrideAccess: true,
  })
  const layoutCount = await payload.count({
    collection: 'page-layouts',
    where: { site: { equals: input.siteId } },
    overrideAccess: true,
  })
  return {
    siteId: input.siteId,
    starterId: input.starterId,
    empty: contentCount.totalDocs === 0 && layoutCount.totalDocs === 0,
    collisions,
    additions: {
      content: contentKeys.length - contentHits,
      layouts: layoutDefs.length - layoutHits,
      media: starter.media.length - mediaHits,
    },
  }
}

export async function installStarter(
  payload: Payload,
  input:
    | StarterId
    | {
        siteId?: string
        starterId: StarterId
        ownerEmail?: string
      },
): Promise<{
  success: boolean
  starterId: StarterId
  siteId: string
  summary: string
  nextSteps?: { homeLayoutId?: string; homePath: string; firstArticleId?: string }
}> {
  const writtenKeys: string[] = []
  const storage = mediaStorage(loadConfig())
  const key = typeof input === 'string' ? input : (input.siteId ?? input.starterId)
  return withExecutionLock(payload, `starter-install:${key}`, async () => {
    const args = typeof input === 'string' ? { starterId: input } : input
    const starter = starterDefinitions[args.starterId]
    if (!Object.hasOwn(starterDefinitions, args.starterId))
      throw new Error(`Unknown starter experience: ${args.starterId}`)

    // Unified recipe execution (S2-10): the run is journaled before any
    // write, media keys are staged before any file exists, and a
    // completed run returns its prior outcome instead of re-installing.
    let siteId = args.siteId
    if (!siteId) {
      const existing = await payload.find({
        collection: 'sites',
        where: { slug: { equals: starter.id } },
        limit: 1,
        overrideAccess: true,
      })
      if (existing.docs[0]) siteId = String(existing.docs[0].id)
    }
    let run: RecipeRunHandle | undefined
    if (siteId) {
      run = await beginRecipeRun(payload, {
        siteId,
        kind: 'starter',
        recipeId: starter.id,
        recipeVersion: starter.version,
      })
      if (run.state === 'completed')
        return {
          success: true,
          starterId: starter.id,
          siteId,
          summary: run.data.summary ?? `Installed ${starter.name} (${starter.version}).`,
        }
      const stagedKeys: string[] = []
      for (const media of starter.media) {
        const bytes = await readFile(path.join(process.cwd(), 'public', media.localAssetPath))
        stagedKeys.push(
          `starters/${siteId}/${createHash('sha256').update(bytes).digest('hex')}/${media.originalFilename}`,
        )
      }
      await stageRecipeMedia(payload, run, stagedKeys)
    }

    const transactionID = await payload.db.beginTransaction()
    if (!transactionID) throw new Error('Starter installation requires transactional storage.')
    const req = await createLocalReq({}, payload)
    req.transactionID = transactionID
    let result: Awaited<ReturnType<typeof provisionStarter>>
    try {
      result = await provisionStarter(transactionPayload(payload, req), input, writtenKeys)
      await payload.db.commitTransaction(transactionID)
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID)
      for (const writtenKey of writtenKeys) await storage.remove(writtenKey)
      if (run) await failRecipeRun(payload, run, error)
      // A non-empty site refusal carries the additive collision plan, so
      // the operator sees exactly what overlaps instead of a dead end.
      if (
        siteId &&
        error instanceof Error &&
        error.message.startsWith('Install a starter on an empty site')
      ) {
        const plan = await planStarterInstall(payload, { siteId, starterId: starter.id })
        const preview = plan.collisions
          .slice(0, 5)
          .map((collision) => `${collision.kind}:${collision.key}`)
          .join(', ')
        throw new Error(
          `${error.message} Collision plan: ${plan.collisions.length} existing record(s) overlap this starter` +
            (preview ? ` (${preview}${plan.collisions.length > 5 ? ', …' : ''})` : '') +
            `; ${plan.additions.content} content, ${plan.additions.layouts} layout and ${plan.additions.media} media item(s) would be new.`,
        )
      }
      throw error
    }

    // Step outcomes persist only now: inside the rolled-back transaction
    // they would not have durably happened. A first-ever install created
    // its site inside the transaction, so its run starts here.
    if (!run) {
      run = await beginRecipeRun(payload, {
        siteId: result.siteId,
        kind: 'starter',
        recipeId: starter.id,
        recipeVersion: starter.version,
      })
      const stagedKeys: string[] = []
      for (const media of starter.media) {
        const bytes = await readFile(path.join(process.cwd(), 'public', media.localAssetPath))
        stagedKeys.push(
          `starters/${result.siteId}/${createHash('sha256').update(bytes).digest('hex')}/${media.originalFilename}`,
        )
      }
      await stageRecipeMedia(payload, run, stagedKeys)
    }
    const steps: Record<string, RecipeStepOutcome> = {}
    for (const stepKey of STARTER_STEP_KEYS)
      steps[stepKey] = { status: 'done', targetId: result.siteId }
    await recordRecipeSteps(payload, run, steps)
    await completeRecipeRun(payload, run, {
      summary: result.summary,
      targets: { site: result.siteId },
    })
    return result
  })
}

async function provisionStarter(
  payload: Payload,
  input: Parameters<typeof installStarter>[1],
  writtenKeys: string[],
): ReturnType<typeof installStarter> {
  const args = typeof input === 'string' ? { starterId: input } : input
  const starter = starterDefinitions[args.starterId]
  if (!Object.hasOwn(starterDefinitions, args.starterId))
    throw new Error(`Unknown starter experience: ${args.starterId}`)

  const ownerEmail = args.ownerEmail || 'admin@renegade.local'
  let siteId = args.siteId

  if (!siteId) {
    const existing = await payload.find({
      collection: 'sites',
      where: { slug: { equals: starter.id } },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs[0]) siteId = String(existing.docs[0].id)
  }
  if (siteId) {
    await payload.findByID({ collection: 'sites', id: siteId, overrideAccess: true })
    for (const collection of ['content', 'page-layouts'] as const) {
      const existing = await payload.count({
        collection,
        where: { site: { equals: siteId } },
        overrideAccess: true,
      })
      if (existing.totalDocs)
        throw new Error(
          'Install a starter on an empty site. Existing content and layouts are preserved; use upgrade for installed templates.',
        )
    }
  }

  // 1. Ensure site exists
  if (siteId) {
    const existing = await payload.find({
      collection: 'sites',
      where: { id: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)
    const existingDoc = existing.docs[0] as { slug?: string; name?: string } | undefined
    const currentSlug = existingDoc?.slug ?? starter.id
    await upsertRecord(
      payload,
      'sites',
      { id: { equals: siteId } },
      {
        name: existingDoc?.name ?? starter.name,
        slug: currentSlug,
        description: starter.summary,
        lifecycle: 'active',
      },
    )
  } else {
    const existing = await payload.find({
      collection: 'sites',
      where: { slug: { equals: starter.id } },
      limit: 1,
      overrideAccess: true,
    } as never)
    if (existing.docs[0]?.id) {
      siteId = String(existing.docs[0].id)
      await payload.update({
        collection: 'sites',
        id: siteId,
        data: {
          name: starter.name,
          description: starter.summary,
          lifecycle: 'active',
        },
        overrideAccess: true,
      } as never)
    } else {
      const created = await payload.create({
        collection: 'sites',
        data: {
          name: starter.name,
          slug: starter.id,
          description: starter.summary,
          lifecycle: 'active',
        },
        overrideAccess: true,
      } as never)
      siteId = String(created.id)
    }
  }

  // 2. Ensure member & profile exist
  const ownerMember = await upsertRecord(
    payload,
    'members',
    { email: { equals: ownerEmail } },
    { displayName: starter.name, email: ownerEmail, status: 'active' },
  )

  await upsertRecord(
    payload,
    'profiles',
    { member: { equals: ownerMember.id } },
    {
      member: ownerMember.id,
      displayName: starter.name,
      handle: `${starter.id}-${siteId.slice(0, 8)}`.toLowerCase(),
      bio: starter.summary,
      visibility: 'public',
      fieldAudience: { email: 'private', bio: 'public' },
    },
  )

  // Reuse the canonical publication created with the site.
  const existingPublications = await payload.find({
    collection: 'publications',
    where: { site: { equals: siteId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  // 3. Ensure publication exists
  await upsertRecord(
    payload,
    'publications',
    existingPublications.docs[0]
      ? { id: { equals: existingPublications.docs[0].id } }
      : { site: { equals: siteId }, slug: { equals: 'main' } },
    {
      site: siteId,
      owner: ownerMember.id,
      name: starter.siteSettings.siteName,
      slug: 'main',
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
      themePreset: starter.themeId,
      navigation: {
        primary: starter.navigation.primary,
        secondary: [],
        footer: starter.navigation.footer,
      },
    },
  )

  const mediaReferences = new Map<string, any>()
  // 4. Provision Media Assets
  for (const m of starter.media) {
    const bytes = await readFile(path.join(process.cwd(), 'public', m.localAssetPath))
    const storage = mediaStorage(loadConfig())
    const storageKey = `starters/${siteId}/${createHash('sha256').update(bytes).digest('hex')}/${m.originalFilename}`
    if (!(await storage.get(storageKey))) {
      writtenKeys.push(storageKey)
      await storage.put(storageKey, bytes, m.mimeType)
    }
    const asset = await upsertRecord(
      payload,
      'media-assets',
      {
        and: [{ site: { equals: siteId } }, { originalFilename: { equals: m.originalFilename } }],
      },
      {
        site: siteId,
        title: m.title,
        originalFilename: m.originalFilename,
        mimeType: m.mimeType,
        kind: m.kind,
        altText: m.altText,
        description: m.description,
        creatorCredit: m.creatorCredit,
        source: 'Renegade CMS Starter Kit',
        copyrightOwner: 'Renegade CMS contributors',
        licenseType: starter.id === 'publication-community' ? 'licensed' : m.licenseType,
        license:
          starter.id === 'publication-community'
            ? 'AGPL-3.0-or-later (repository sample vector artwork)'
            : undefined,
        licenseUrl:
          starter.id === 'publication-community'
            ? 'https://www.gnu.org/licenses/agpl-3.0.html'
            : undefined,
        governanceEnabled: m.governanceEnabled,
        storageProvider: storage.provider,
        storageLocation: storageKey,
        width: m.width,
        height: m.height,
        aspectRatio: m.aspectRatio,
      },
    )
    mediaReferences.set(m.localAssetPath, {
      id: asset.id,
      siteId,
      label: m.altText,
      href: `/media/${asset.id}`,
    })
  }

  // 5. Provision Additional Member Profiles
  for (const memberDef of starter.members) {
    const mem = await upsertRecord(
      payload,
      'members',
      { email: { equals: `${siteId}-${memberDef.email}` } },
      {
        displayName: memberDef.displayName,
        email: `${siteId}-${memberDef.email}`,
        status: 'active',
      },
    )
    await upsertRecord(
      payload,
      'profiles',
      { member: { equals: mem.id } },
      {
        member: mem.id,
        displayName: memberDef.displayName,
        handle: `${memberDef.handle}-${siteId.slice(0, 8)}`,
        bio: `${memberDef.roleTitle} — ${memberDef.bio}`,
        visibility: 'public',
        fieldAudience: { email: 'private', bio: 'public' },
      },
    )
  }

  const linkReferences = new Map<string, any>()
  for (const [routePath, routeLabel] of [
    ['/', 'Home'],
    ['/articles', 'Articles'],
    ['/store', 'Store'],
    ['/donate', 'Donate'],
    ['/search', 'Search'],
    ['/members', 'Community'],
    ['/subscribe', 'Subscribe'],
    ['/cart', 'Cart'],
    ['/checkout', 'Checkout'],
  ] as const) {
    linkReferences.set(routePath, {
      id: `route:${routePath.slice(1) || 'home'}`,
      siteId,
      label: routeLabel,
      href: routePath,
    })
  }

  // 6. Provision Canonical Pages
  for (const page of starter.pages) {
    const pageBody = toLexicalDocument(page.body || page.summary || page.title)
    const record = await upsertRecord(
      payload,
      'content',
      { and: [{ site: { equals: siteId } }, { canonicalPath: { equals: page.canonicalPath } }] },
      {
        site: siteId,
        owner: ownerMember.id,
        contentType: 'page',
        title: page.title,
        slug: page.slug,
        canonicalPath: page.canonicalPath,
        summary: page.summary,
        body: pageBody,
        publishedAt: new Date().toISOString(),
        status: page.status,
        commentsPolicy: 'closed',
        importSourceSystem: `starter:${starter.id}`,
        importSourceIdentifier: `page:${page.slug}`,
        importSourceChecksum: exampleContentChecksum({
          title: page.title,
          summary: page.summary,
          status: page.status,
          body: pageBody,
        }),
        exportFormatVersion: 1,
      },
    )
    linkReferences.set(page.canonicalPath, {
      id: `content:${record.id}`,
      siteId,
      label: page.title,
      href: page.canonicalPath,
    })
  }

  const bindBlocks = (blocks: any[]) =>
    blocks.map((block) => {
      const next = structuredClone(block)
      for (const field of ['link', 'media']) {
        const reference = next.props[field]
        if (reference) {
          const canonical = (field === 'link' ? linkReferences : mediaReferences).get(
            reference.href,
          )
          if (!canonical) throw new Error(`Starter ${field} target missing: ${reference.href}`)
          next.props[field] = { ...canonical, label: reference.label || canonical.label }
        }
      }
      return next
    })

  // 7. Provision Canonical Articles
  let firstArticleId = ''
  for (const article of starter.articles) {
    const articleBody = toLexicalDocument(article.body)
    const record = await upsertRecord(
      payload,
      'content',
      { and: [{ site: { equals: siteId } }, { canonicalPath: { equals: article.canonicalPath } }] },
      {
        site: siteId,
        owner: ownerMember.id,
        contentType: 'article',
        title: article.title,
        slug: article.slug,
        canonicalPath: article.canonicalPath,
        summary: article.summary,
        body: articleBody,
        publishedAt: article.publishedAt,
        status: 'published',
        commentsPolicy: article.commentsPolicy,
        importSourceSystem: `starter:${starter.id}`,
        importSourceIdentifier: `article:${article.slug}`,
        importSourceChecksum: exampleContentChecksum({
          title: article.title,
          summary: article.summary,
          status: 'published',
          body: articleBody,
        }),
        exportFormatVersion: 1,
      },
    )
    if (!firstArticleId) firstArticleId = String(record.id)
    linkReferences.set(article.canonicalPath, {
      id: `content:${record.id}`,
      siteId,
      label: article.title,
      href: article.canonicalPath,
    })
  }

  // 8. Provision Products (if commerce starter and collection registered)
  if (starter.products && starter.products.length > 0 && Boolean(payload.collections['products'])) {
    for (const prod of starter.products) {
      await upsertRecord(
        payload,
        'products',
        { and: [{ site: { equals: siteId } }, { canonicalPath: { equals: prod.canonicalPath } }] },
        {
          site: siteId,
          name: prod.name,
          slug: prod.slug,
          canonicalPath: prod.canonicalPath,
          summary: prod.summary,
          description: prod.description,
          catalogContractVersion: 1,
          kind: prod.kind,
          state: 'published',
          publishedAt: new Date().toISOString(),
          productCapabilities: ['shippable'],
          variants: [
            {
              sku: prod.sku,
              title: 'Default Variant',
              optionValues: {},
              status: 'active',
              weightGrams: prod.weightGrams,
              dimensionsMm: { length: 250, width: 200, height: 30 },
              inventoryPolicy: 'tracked',
              inventoryQuantity: prod.inventoryQuantity,
            },
          ],
          stockLevels: [
            {
              variantSku: prod.sku,
              onHand: prod.inventoryQuantity,
              reserved: 0,
            },
          ],
          offers: [
            {
              id: `offer-${prod.sku.toLowerCase()}`,
              version: 1,
              status: 'active',
              variantSku: prod.sku,
              amountMinor: prod.priceMinor,
              currency: prod.currency,
              taxDisplay: 'inclusive',
            },
          ],
        },
        { catalogWorkflow: true },
      )
      linkReferences.set(prod.canonicalPath, {
        id: `product:${prod.slug}`,
        siteId,
        label: prod.name,
        href: prod.canonicalPath,
      })
    }
  }

  // 9. Provision Donation Campaign (if applicable and collection registered)
  if (starter.donationCampaign && Boolean(payload.collections['donation-campaigns'])) {
    const dc = starter.donationCampaign
    linkReferences.set(`/donate/${dc.slug}`, {
      id: `donation-campaign:${dc.slug}`,
      siteId,
      label: dc.title,
      href: `/donate/${dc.slug}`,
    })
    const existing = await payload.find({
      collection: 'donation-campaigns',
      where: { and: [{ site: { equals: siteId } }, { campaignKey: { equals: dc.slug } }] },
      limit: 1,
      overrideAccess: true,
    } as never)

    if (existing.docs[0]?.id) {
      if ((existing.docs[0] as any).lifecycle !== 'active') {
        await payload.update({
          collection: 'donation-campaigns',
          id: existing.docs[0].id,
          data: { lifecycle: 'active' },
          overrideAccess: true,
        } as never)
      }
    } else {
      const created = await payload.create({
        collection: 'donation-campaigns',
        data: {
          site: siteId,
          campaignKey: dc.slug,
          version: 1,
          title: dc.title,
          purpose: dc.purpose,
          lifecycle: 'draft',
          goalAmountMinor: dc.goalMinor,
          currency: dc.currency,
          allowedAmounts: dc.suggestedTiersMinor,
          recurrence: ['one-time'],
          disclosures: [dc.complianceDisclosure],
          taxDisclaimer: dc.complianceDisclosure,
          startsAt: new Date(Date.now() - 86400000).toISOString(),
        },
        overrideAccess: true,
      } as never)

      await payload.update({
        collection: 'donation-campaigns',
        id: created.id,
        data: { lifecycle: 'active' },
        overrideAccess: true,
      } as never)
    }
  }

  // 10. Provision Reusable Templates
  for (const tpl of starter.templates) {
    const tplDoc = {
      site: siteId,
      name: tpl.name,
      path: tpl.path,
      themeId: starter.themeId,
      surface: 'template',
      slot: 'main',
      category: tpl.category || 'General',
      layoutVersion: 1,
      status: 'published',
      visibility: 'public',
      blocks: bindBlocks(tpl.blocks),
      unknownBlocks: [],
      revision: 1,
      publishedRevision: 1,
    }
    const snapshot = snapshotLayout(tplDoc as any)
    await upsertRecord(
      payload,
      'page-layouts',
      { and: [{ site: { equals: siteId } }, { path: { equals: tpl.path } }] },
      {
        ...tplDoc,
        publishedPresentation: snapshot,
        revisionHistory: [
          {
            revision: 1,
            blocks: bindBlocks(tpl.blocks),
            action: 'starter-install',
            savedAt: new Date().toISOString(),
          },
        ],
      },
      { publishPresentation: true },
    )
  }

  // 11. Provision Reusable Patterns
  for (const pat of starter.patterns) {
    const patDoc = {
      site: siteId,
      name: pat.name,
      path: pat.path,
      themeId: starter.themeId,
      surface: 'pattern',
      slot: 'main',
      category: pat.category || 'Sections',
      layoutVersion: 1,
      status: 'published',
      visibility: 'public',
      blocks: bindBlocks(pat.blocks),
      unknownBlocks: [],
      revision: 1,
      publishedRevision: 1,
    }
    const snapshot = snapshotLayout(patDoc as any)
    await upsertRecord(
      payload,
      'page-layouts',
      { and: [{ site: { equals: siteId } }, { path: { equals: pat.path } }] },
      {
        ...patDoc,
        publishedPresentation: snapshot,
        revisionHistory: [
          {
            revision: 1,
            blocks: bindBlocks(pat.blocks),
            action: 'starter-install',
            savedAt: new Date().toISOString(),
          },
        ],
      },
      { publishPresentation: true },
    )
  }

  // 12. Provision Global Regions
  for (const glob of starter.globals) {
    const globDoc = {
      site: siteId,
      name: glob.name,
      path: glob.path,
      themeId: starter.themeId,
      surface: 'global',
      slot: glob.slot,
      layoutVersion: 1,
      status: 'published',
      visibility: 'public',
      blocks: bindBlocks(glob.blocks),
      unknownBlocks: [],
      revision: 1,
      publishedRevision: 1,
    }
    const snapshot = snapshotLayout(globDoc as any)
    await upsertRecord(
      payload,
      'page-layouts',
      { and: [{ site: { equals: siteId } }, { path: { equals: glob.path } }] },
      {
        ...globDoc,
        publishedPresentation: snapshot,
        revisionHistory: [
          {
            revision: 1,
            blocks: bindBlocks(glob.blocks),
            action: 'starter-install',
            savedAt: new Date().toISOString(),
          },
        ],
      },
      { publishPresentation: true },
    )
  }

  // 13. Provision Home Page Layout
  let homeLayoutId = ''
  for (const layout of starter.layouts) {
    const layoutDoc = {
      site: siteId,
      name: layout.name,
      path: layout.path,
      themeId: starter.themeId,
      surface: 'page',
      slot: 'main',
      layoutVersion: 1,
      status: 'published',
      visibility: 'public',
      blocks: bindBlocks(layout.blocks),
      unknownBlocks: [],
      revision: 1,
      publishedRevision: 1,
    }
    const snapshot = snapshotLayout(layoutDoc as any)
    const result = await upsertRecord(
      payload,
      'page-layouts',
      { and: [{ site: { equals: siteId } }, { path: { equals: layout.path } }] },
      {
        ...layoutDoc,
        publishedPresentation: snapshot,
        revisionHistory: [
          {
            revision: 1,
            blocks: bindBlocks(layout.blocks),
            action: 'starter-install',
            savedAt: new Date().toISOString(),
          },
        ],
      },
      { publishPresentation: true },
    )
    if (layout.path === '/') homeLayoutId = result.id
  }

  // 14. Update Site Settings
  // Global defaults are shared across sites; never replace another site's identity.
  const siteCount = await payload.count({ collection: 'sites', overrideAccess: true })
  if (siteCount.totalDocs === 1)
    await (payload as any).updateGlobal({
      slug: 'site-settings',
      overrideAccess: true,
      data: {
        siteName: starter.siteSettings.siteName,
        siteDescription: starter.siteSettings.siteDescription,
        footerText: starter.siteSettings.footerText,
        themeId: starter.themeId,
        themeTokens: starter.siteSettings.themeTokens,
        homepageSelection: {
          mode: homeLayoutId ? 'layout' : 'default',
          layout: homeLayoutId || undefined,
        },
        onboarding: {
          starterType: starter.id,
          featureProfile: 'Standard',
          starterContent: true,
        },
      },
    })

  return {
    success: true,
    starterId: starter.id,
    siteId,
    summary: `Installed ${starter.name} (${starter.version}) with ${starter.pages.length} pages, ${starter.articles.length} dispatches, ${starter.templates.length} templates, ${starter.patterns.length} patterns, ${starter.globals.length} global regions, and ${starter.media.length} governed media assets.`,
    // Designed next steps (UXI-06): real records the operator can open
    // next — the installed homepage layout and the first sample post.
    nextSteps: {
      homeLayoutId: homeLayoutId || undefined,
      homePath: '/',
      firstArticleId: firstArticleId || undefined,
    },
  }
}

export async function getStarterStatus(
  payload: Payload,
  siteId: string,
): Promise<StarterInstallStatus> {
  const hasProducts = Boolean(payload.collections['products'])
  const hasDonations = Boolean(payload.collections['donation-campaigns'])

  const [layoutsResult, contentResult, productsResult, donationsResult] = await Promise.all([
    (payload as any).find({
      collection: 'page-layouts',
      where: { site: { equals: siteId } },
      limit: 500,
      overrideAccess: true,
    }),
    (payload as any).find({
      collection: 'content',
      where: { site: { equals: siteId } },
      limit: 500,
      overrideAccess: true,
    }),
    hasProducts
      ? (payload as any)
          .find({
            collection: 'products',
            where: { site: { equals: siteId } },
            limit: 100,
            overrideAccess: true,
          })
          .catch(() => ({ docs: [] }))
      : Promise.resolve({ docs: [] }),
    hasDonations
      ? (payload as any)
          .find({
            collection: 'donation-campaigns',
            where: { site: { equals: siteId } },
            limit: 50,
            overrideAccess: true,
          })
          .catch(() => ({ docs: [] }))
      : Promise.resolve({ docs: [] }),
  ])

  const layouts = layoutsResult.docs as any[]
  const content = contentResult.docs as any[]

  const pagesCount = content.filter((c) => c.contentType === 'page').length
  const articlesCount = content.filter((c) => c.contentType === 'article').length
  const templatesCount = layouts.filter((l) => l.surface === 'template').length
  const patternsCount = layouts.filter((l) => l.surface === 'pattern').length
  const globalsCount = layouts.filter((l) => l.surface === 'global').length
  const productsCount = productsResult.docs.length
  const donationsCount = donationsResult.docs.length

  // A shared global theme/onboarding selection does not identify this site's starter.
  const source = content.find((record) =>
    ['starter:publication-community', 'starter:campaign-commerce'].includes(
      record.importSourceSystem,
    ),
  )?.importSourceSystem
  const activeStarterId = source?.slice('starter:'.length) as StarterId | undefined

  const installed = Boolean(layouts.length > 0 && activeStarterId)
  const starter = activeStarterId ? starterDefinitions[activeStarterId] : undefined

  // Upgradable is computed from the actual records, not asserted: an upgrade
  // has work to do when a starter template/pattern is missing, when a record
  // has no starter baseline or was customized (a conflict to review), or
  // when the recorded baseline differs from the current starter definition.
  let upgradable = false
  if (installed && starter) {
    const byPath = new Map(layouts.map((layout) => [String(layout.path), layout]))
    for (const definition of [...starter.templates, ...starter.patterns]) {
      const doc = byPath.get(definition.path)
      if (!doc) {
        upgradable = true
        break
      }
      const baseline = starterBaselineBlocks(doc)
      if (
        !baseline ||
        !blocksMatch(doc.blocks, baseline) ||
        !blocksMatch(baseline, definition.blocks)
      ) {
        upgradable = true
        break
      }
    }
  }

  return {
    installed,
    starterId: activeStarterId,
    version: starter?.version,
    siteId,
    upgradable,
    availableUpgradeVersion: upgradable ? starter?.version : undefined,
    stats: {
      pagesCount,
      articlesCount,
      templatesCount,
      patternsCount,
      globalsCount,
      productsCount,
      donationsCount,
    },
  }
}

/**
 * Non-destructive upgrade: refreshes pristine templates and patterns as new
 * draft revisions, stages missing starter assets as drafts, and preserves
 * customized records as reviewable conflicts. It never publishes and never
 * alters canonical content or custom page layouts.
 */
export type StarterUpgradeConflict = {
  path: string
  surface: 'template' | 'pattern'
  reason: string
  candidateBlocks: unknown[]
}

export async function upgradeStarter(
  payload: Payload,
  input: StarterId | { siteId: string; starterId: StarterId },
  siteIdParam?: string,
): Promise<{
  success: boolean
  updatedCount: number
  conflicts: StarterUpgradeConflict[]
  message: string
}> {
  const starterId = typeof input === 'string' ? input : input.starterId
  const siteId = typeof input === 'string' ? siteIdParam || '1' : input.siteId

  const starter = starterDefinitions[starterId]
  if (!starter) throw new Error(`Unknown starter: ${starterId}`)

  const bindBlocks = async (blocks: any[]) => {
    const next = structuredClone(blocks)
    for (const block of next)
      for (const field of ['link', 'media']) {
        const value = block.props[field]
        if (!value) continue
        const media = field === 'media'
        const result = await (payload as any).find({
          collection: media ? 'media-assets' : 'content',
          where: {
            and: [
              { site: { equals: siteId } },
              media
                ? { originalFilename: { equals: String(value.href).split('/').pop() } }
                : { canonicalPath: { equals: value.href } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const record = result.docs[0]
        if (!record)
          throw new Error(
            `Starter ${field} target unavailable. Preserve the current template and repair the target before upgrading.`,
          )
        block.props[field] = {
          id: media ? record.id : `content:${record.id}`,
          siteId,
          label: value.label,
          href: media ? `/media/${record.id}` : record.canonicalPath,
        }
      }
    return next
  }
  let updatedCount = 0
  const conflicts: StarterUpgradeConflict[] = []

  /**
   * One template/pattern upgrade step. A record is refreshed only when its
   * current blocks still equal the last starter-generated baseline — and
   * even then the refresh is staged as a new draft revision: published
   * output changes only through an explicit publication. A customized
   * record, or one with no reliable baseline, is preserved untouched and
   * reported as a conflict carrying the candidate blocks for review.
   */
  const upgradeLayout = async (
    definition: { name: string; path: string; blocks: any[]; category?: string },
    surface: 'template' | 'pattern',
  ) => {
    const existing = await (payload as any).find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: siteId } }, { path: { equals: definition.path } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    let candidate: any[]
    try {
      candidate = await bindBlocks(definition.blocks)
    } catch {
      conflicts.push({
        path: definition.path,
        surface,
        reason:
          'The upgrade candidate references content or media that is unavailable in this site; the current record was preserved.',
        candidateBlocks: definition.blocks,
      })
      return
    }

    if (existing.docs.length === 0) {
      // Missing starter asset: stage it as a draft, never published.
      await (payload as any).create({
        collection: 'page-layouts',
        data: {
          site: siteId,
          name: definition.name,
          path: definition.path,
          themeId: starter.themeId,
          surface,
          slot: 'main',
          category: definition.category || (surface === 'template' ? 'General' : 'Sections'),
          layoutVersion: 1,
          status: 'draft',
          visibility: 'public',
          blocks: candidate,
          unknownBlocks: [],
          revision: 1,
          revisionHistory: [
            {
              revision: 1,
              blocks: candidate,
              action: 'starter-upgrade',
              savedAt: new Date().toISOString(),
            },
          ],
        },
        overrideAccess: true,
      })
      updatedCount++
      return
    }

    const doc = existing.docs[0]
    const baseline = starterBaselineBlocks(doc)
    if (!baseline) {
      conflicts.push({
        path: definition.path,
        surface,
        reason:
          'No starter-generated baseline is recorded for this record, so customization cannot be ruled out; the current record was preserved for review.',
        candidateBlocks: candidate,
      })
      return
    }
    if (!blocksMatch(doc.blocks, baseline)) {
      conflicts.push({
        path: definition.path,
        surface,
        reason:
          'This record was customized after the last starter-generated revision; the current record was preserved for review.',
        candidateBlocks: candidate,
      })
      return
    }
    if (blocksMatch(candidate, doc.blocks)) return // already current; no empty revision

    const nextRev = (Number(doc.revision) || 1) + 1
    await (payload as any).update({
      collection: 'page-layouts',
      id: doc.id,
      data: {
        blocks: candidate,
        revision: nextRev,
        revisionHistory: [
          ...(Array.isArray(doc.revisionHistory) ? doc.revisionHistory : []),
          {
            revision: nextRev,
            blocks: candidate,
            action: 'starter-upgrade',
            savedAt: new Date().toISOString(),
          },
        ],
      },
      overrideAccess: true,
    })
    updatedCount++
  }

  // 1. Refresh templates with the latest defaults (draft-staged, see above)
  for (const tpl of starter.templates) {
    await upgradeLayout(tpl, 'template')
  }

  // 2. Refresh patterns with the latest defaults (draft-staged, see above)
  for (const pat of starter.patterns) {
    await upgradeLayout(pat, 'pattern')
  }

  return {
    success: true,
    updatedCount,
    conflicts,
    message:
      `Starter "${starter.name}" upgrade staged. ${updatedCount} templates/patterns updated as drafts for v${starter.version}; ` +
      (conflicts.length > 0
        ? `${conflicts.length} customized record(s) were preserved and reported as conflicts for review. `
        : '') +
      'Published output is unchanged until a draft is published. Canonical content and custom page layouts were preserved.',
  }
}

/** Rollback starter layouts to a target revision */
export async function rollbackStarterLayout(
  payload: Payload,
  input: string | { siteId: string; path: string; targetRevision: number },
  pathParam?: string,
  targetRevisionParam?: number,
): Promise<{ success: boolean; message: string }> {
  const siteId = typeof input === 'string' ? input : input.siteId
  const path = typeof input === 'string' ? pathParam! : input.path
  const targetRevision = typeof input === 'string' ? targetRevisionParam! : input.targetRevision

  const existing = await (payload as any).find({
    collection: 'page-layouts',
    where: { and: [{ site: { equals: siteId } }, { path: { equals: path } }] },
    limit: 1,
    overrideAccess: true,
  })

  if (!existing.docs.length) {
    throw new Error(`No layout found at path ${path}`)
  }

  const doc = existing.docs[0]
  const history = Array.isArray(doc.revisionHistory) ? doc.revisionHistory : []
  const entry = history.find((h: any) => h.revision === targetRevision)

  if (!entry) {
    throw new Error(`Revision ${targetRevision} not found in history for ${path}`)
  }

  const nextRev = (Number(doc.revision) || 1) + 1
  const snapshot = snapshotLayout({
    ...doc,
    blocks: entry.blocks,
    revision: nextRev,
    publishedRevision: nextRev,
  })

  await (payload as any).update({
    collection: 'page-layouts',
    id: doc.id,
    data: {
      blocks: entry.blocks,
      revision: nextRev,
      publishedRevision: nextRev,
      publishedPresentation: snapshot,
      revisionHistory: [
        ...history,
        {
          revision: nextRev,
          blocks: entry.blocks,
          action: 'starter-rollback',
          rollbackTo: targetRevision,
          savedAt: new Date().toISOString(),
        },
      ],
    },
    context: { publishPresentation: true },
    overrideAccess: true,
  })

  return {
    success: true,
    message: `Layout for ${path} rolled back to revision ${targetRevision} (now published as rev ${nextRev}).`,
  }
}
