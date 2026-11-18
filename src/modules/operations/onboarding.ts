import { themes } from '../presentation/registry'
import { randomUUID } from 'node:crypto'

import type { Payload } from 'payload'

import { previewRecipe } from '../public/page-builder'
import { installStarter, toLexicalDocument } from '../starters/service'
import {
  beginRecipeRun,
  completeRecipeRun,
  failRecipeRun,
  getRecipeRun,
  recordRecipeSteps,
  refreshRecipeRun,
} from './recipe-execution'

const CANONICAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Resolves a canonicalSlug-compliant, unique `handle` for the owner profile.
 * The site slug is already canonical, so it is the preferred handle. If another
 * profile already owns it (and it is not this member's own profile from a
 * re-run), a numeric suffix is appended so setup never crashes on a collision.
 */
async function resolveUniqueProfileHandle(
  payload: Payload,
  desired: string,
  memberId: string,
): Promise<string> {
  const base = CANONICAL_SLUG.test(desired) ? desired : 'owner'
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const existing = await payload.find({
      collection: 'profiles',
      where: { handle: { equals: candidate } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const doc = existing.docs[0] as { member?: unknown } | undefined
    if (!doc) return candidate
    const ownerId =
      doc.member && typeof doc.member === 'object'
        ? (doc.member as { id?: string }).id
        : (doc.member as string | undefined)
    // A collision on this member's own profile (idempotent re-run) is fine to keep.
    if (ownerId === memberId) return candidate
  }
  // Extremely unlikely; guarantee uniqueness without failing setup.
  return `${base}-${randomUUID().slice(0, 8)}`
}

export const onboardingProfiles = ['Lean', 'Standard'] as const
export const starterSiteTypes = [
  'publication-community',
  'campaign-commerce',
  'creator-publication',
  'business',
  'nonprofit-community',
  'portfolio',
  'blank-minimal',
] as const
export const optionalConnectionKeys = [
  'email',
  'ai',
  'social',
  'commerce',
  'analytics',
  'networking',
] as const

export type OnboardingInput = {
  name: string
  slug: string
  description: string
  primaryUrl: string
  locale: string
  timezone: string
  themeId: string
  starterType: (typeof starterSiteTypes)[number]
  featureProfile: (typeof onboardingProfiles)[number]
  optionalConnections: (typeof optionalConnectionKeys)[number][]
  logoMediaId?: string
  starterContent: boolean
  /**
   * 'prelaunch' creates the site in the draft lifecycle: it is not
   * publicly resolvable until an explicit launch (S2-11). Absent means
   * the historical behavior — the site goes active immediately.
   */
  launchState?: 'prelaunch' | 'active'
  publishingDefaults?: {
    indexingMode?: 'index' | 'noindex'
    commentsPolicy?: 'closed' | 'open' | 'members'
    visibility?: 'public' | 'members' | 'members-only'
  }
}

const connectionCapabilities = {
  email: 'audience.transactional-email',
  ai: 'ai.assistance',
  social: 'social.distribution',
  commerce: 'commerce.checkout',
  analytics: 'analytics.reporting',
  networking: 'networking.federation',
} as const
const recipeFor = (type: OnboardingInput['starterType']) =>
  type === 'portfolio'
    ? 'photographer-portfolio'
    : type === 'creator-publication'
      ? 'writer-blogger'
      : type === 'blank-minimal'
        ? undefined
        : 'organization'

export function validateOnboardingInput(input: OnboardingInput): OnboardingInput {
  const name = input.name.trim()
  const slug = input.slug.trim().toLowerCase()
  const primaryUrl = input.primaryUrl.trim()
  if (name.length < 2 || name.length > 120)
    throw new Error('Site name must be between 2 and 120 characters.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error('Site slug must use lowercase letters, numbers, and hyphens.')
  try {
    const url = new URL(primaryUrl)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
  } catch {
    throw new Error('Enter a valid primary URL.')
  }
  if (!onboardingProfiles.includes(input.featureProfile))
    throw new Error('Choose a supported feature profile.')
  if (!starterSiteTypes.includes(input.starterType))
    throw new Error('Choose a supported starter site type.')
  if (!Object.hasOwn(themes, input.themeId)) throw new Error('Choose an existing theme.')
  if (!input.locale.trim() || !input.timezone.trim())
    throw new Error('Locale and timezone are required.')
  if (input.launchState !== undefined && !['prelaunch', 'active'].includes(input.launchState))
    throw new Error('Launch state must be prelaunch or active.')
  const optionalConnections = [...new Set(input.optionalConnections)].filter(
    (key): key is (typeof optionalConnectionKeys)[number] => optionalConnectionKeys.includes(key),
  )

  const indexingMode = input.publishingDefaults?.indexingMode ?? 'index'
  if (!['index', 'noindex'].includes(indexingMode)) {
    throw new Error('Indexing mode must be "index" or "noindex".')
  }
  const commentsPolicy = input.publishingDefaults?.commentsPolicy ?? 'open'
  if (!['closed', 'open', 'members'].includes(commentsPolicy)) {
    throw new Error('Comments policy must be "closed", "open", or "members".')
  }
  const rawVisibility = input.publishingDefaults?.visibility ?? 'public'
  if (!['public', 'members', 'members-only'].includes(rawVisibility)) {
    throw new Error('Visibility must be "public", "members", or "members-only".')
  }
  const visibility = rawVisibility === 'members-only' ? 'members' : rawVisibility

  return {
    ...input,
    name,
    slug,
    primaryUrl,
    locale: input.locale.trim(),
    timezone: input.timezone.trim(),
    optionalConnections,
    publishingDefaults: { indexingMode, commentsPolicy, visibility },
  }
}

async function upsert(
  payload: Payload,
  collection: Parameters<Payload['find']>[0]['collection'],
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<{ id: string }> {
  const found = await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return found.docs[0]
    ? (payload.update({
        collection,
        id: found.docs[0].id,
        data,
        overrideAccess: true,
      } as never) as unknown as Promise<{ id: string }>)
    : (payload.create({ collection, data, overrideAccess: true } as never) as unknown as Promise<{
        id: string
      }>)
}

/** Identity records are referenced by setup, never rewritten by it. */
async function findOrCreate(
  payload: Payload,
  collection: Parameters<Payload['find']>[0]['collection'],
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<{ id: string }> {
  const found = await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (found.docs[0]) return { id: String(found.docs[0].id) }
  return payload.create({ collection, data, overrideAccess: true } as never) as unknown as Promise<{
    id: string
  }>
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
 * Starter content is setup-owned only while it is untouched. A record the
 * operator edited — or one setup did not generate — is preserved verbatim;
 * a rerun refreshes only a pristine starter record (an effective no-op) and
 * creates what is missing. Lookups are always scoped to the target site.
 */
async function upsertStarterContent(
  payload: Payload,
  data: Record<string, unknown>,
): Promise<{ id: string }> {
  const found = await payload.find({
    collection: 'content',
    where: {
      site: { equals: data.site },
      canonicalPath: { equals: data.canonicalPath },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const existing = found.docs[0] as unknown as Record<string, unknown> | undefined
  if (!existing) {
    return payload.create({
      collection: 'content',
      data,
      overrideAccess: true,
    } as never) as unknown as Promise<{ id: string }>
  }
  if (existing.importSourceSystem !== 'onboarding-starter') return { id: String(existing.id) }
  const managedFields = ['title', 'summary', 'status', 'commentsPolicy', 'contentType'] as const
  const pristine =
    managedFields.every((field) => existing[field] === data[field]) &&
    stableStringify(existing.body) === stableStringify(data.body)
  if (!pristine) return { id: String(existing.id) }
  return payload.update({
    collection: 'content',
    id: existing.id,
    data,
    overrideAccess: true,
  } as never) as unknown as Promise<{ id: string }>
}

/** Creates only canonical records. Re-running after an interrupted enrollment updates the same starter pack. */
async function provisionOnboardingSiteRecords(
  payload: Payload,
  ownerEmail: string,
  rawInput: OnboardingInput,
) {
  const input = validateOnboardingInput(rawInput)
  // Lifecycle is chosen once, at creation: prelaunch sites are created
  // in the draft lifecycle (not publicly resolvable); an existing site's
  // lifecycle is never moved by a refresh — launch is explicit (S2-11).
  const priorSite = await payload.find({
    collection: 'sites',
    where: { slug: { equals: input.slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const priorLifecycle = (priorSite.docs[0] as { lifecycle?: string } | undefined)?.lifecycle
  const site = await upsert(
    payload,
    'sites',
    { slug: { equals: input.slug } },
    {
      name: input.name,
      slug: input.slug,
      description: input.description || undefined,
      lifecycle: priorLifecycle ?? (input.launchState === 'prelaunch' ? 'draft' : 'active'),
    },
  )
  const member = await findOrCreate(
    payload,
    'members',
    { email: { equals: ownerEmail } },
    { displayName: input.name, email: ownerEmail, status: 'active' },
  )
  if (payload.collections?.['team-memberships']) {
    await upsert(
      payload,
      'team-memberships',
      { scopeKey: { equals: `site:${site.id}` }, member: { equals: member.id } },
      {
        scopeKind: 'site',
        site: site.id,
        member: member.id,
        role: 'owner',
        grants: [],
        status: 'active',
      },
    )
  }
  await upsert(
    payload,
    'member-site-roles',
    { site: { equals: site.id }, member: { equals: member.id } },
    { site: site.id, member: member.id, role: 'community-manager' },
  )
  const profileHandle = await resolveUniqueProfileHandle(payload, input.slug, member.id)
  const profile = await findOrCreate(
    payload,
    'profiles',
    { member: { equals: member.id } },
    {
      member: member.id,
      displayName: input.name,
      handle: profileHandle,
      bio: input.description || undefined,
      visibility: 'public',
      fieldAudience: { email: 'private', bio: 'public' },
    },
  )
  const space = await upsert(
    payload,
    'spaces',
    {
      and: [{ site: { equals: site.id } }, { profile: { equals: profile.id } }],
    },
    {
      site: site.id,
      profile: profile.id,
      canonicalPath: `/members/${profileHandle}`,
      moderationState: 'clear',
      capabilities: [{ key: 'space.blog', status: 'enabled' }],
      providerOwnership: { local: true },
    },
  )
  const brand = await upsert(
    payload,
    'brands',
    { site: { equals: site.id }, name: { equals: input.name } },
    {
      site: site.id,
      name: input.name,
      kind: 'organization',
      description: input.description || undefined,
      logo: input.logoMediaId || undefined,
      typography: { theme: input.themeId },
    },
  )
  const enabledCapabilities = [
    'publication.content',
    ...input.optionalConnections.map((key) => connectionCapabilities[key]),
  ]
  const publication = await upsert(
    payload,
    'publications',
    { site: { equals: site.id }, slug: { equals: 'main' } },
    {
      site: site.id,
      owner: member.id,
      space: space.id,
      name: input.name,
      slug: 'main',
      canonicalBasePath: '/',
      status: 'active',
      visibility:
        input.publishingDefaults?.visibility === 'members-only' ||
        input.publishingDefaults?.visibility === 'members'
          ? 'members'
          : 'public',
      brand: brand.id,
      profile: profile.id,
      themePreset: input.themeId,
      capabilities: enabledCapabilities.map((key) => ({ key, status: 'enabled' })),
      navigation: [
        { label: 'Home', href: '/' },
        { label: 'About', href: '/about' },
        { label: 'Contact', href: '/contact' },
      ],
    },
  )
  const optional = new Set(input.optionalConnections)
  const priorSettings = await payload.findGlobal({
    slug: 'site-settings',
    depth: 0,
    overrideAccess: true,
  })
  // Site settings are one shared global: in a multi-site installation the
  // identity fields belong to the first site, so a later site's setup merges
  // only its per-site canonical origin and never replaces another site's
  // identity. The full block is written when this is the only site (the
  // same guard installStarter uses).
  const allSites = await payload.find({
    collection: 'sites',
    where: {},
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const canonicalOriginsBySite = {
    ...(priorSettings.canonicalOriginsBySite as Record<string, string> | null),
    [site.id]: input.primaryUrl,
  }
  const identitySettings =
    allSites.docs.length <= 1
      ? {
          siteName: input.name,
          defaultTitle: input.name,
          defaultDescription: input.description || undefined,
          canonicalOrigin: input.primaryUrl,
          locale: input.locale,
          timezone: input.timezone,
          themeId: input.themeId,
          ownerKind: 'organization',
          organizationName: input.name,
          logo: input.logoMediaId || undefined,
        }
      : {}
  /* Setup-run state is not identity: the publishing defaults and the
     onboarding audit block describe the most recent setup's choices and
     have no per-site home in this global's schema, so every provision
     records them (the model the first-run acceptance tests encode).
     Identity above — name, origin, theme, organization — stays with
     the first site and is never rewritten by a later site's setup. */
  const setupState = {
    indexingMode: input.publishingDefaults?.indexingMode ?? 'index',
    seoNoIndex: (input.publishingDefaults?.indexingMode ?? 'index') === 'noindex',
    onboarding: {
      primaryUrl: input.primaryUrl,
      locale: input.locale,
      timezone: input.timezone,
      featureProfile: input.featureProfile,
      starterType: input.starterType,
      starterContent: input.starterContent,
    },
    adminExperience: {
      optionalCapabilities: {
        mediaProcessing: input.featureProfile === 'Standard',
        socialDistribution: optional.has('social'),
        transactionalEmail: optional.has('email'),
        commerceCheckout: optional.has('commerce'),
        analyticsReporting: optional.has('analytics'),
        experiments: false,
        qualityScanning: input.featureProfile === 'Standard',
      },
    },
  }
  await payload.updateGlobal({
    slug: 'site-settings',
    overrideAccess: true,
    data: {
      ...identitySettings,
      ...setupState,
      canonicalOriginsBySite,
    },
  } as never)
  if (input.starterContent)
    await provisionStarterContent(payload, { input, site, publication, space, member })
  return { site, publication, space, member, configuredCapabilities: enabledCapabilities }
}

/**
 * Onboarding under the unified recipe execution policy (S2-10): the
 * whole provision is one journaled run (`onboarding@1`). A failed run
 * resumes; a completed run reopens as an edit-preserving refresh —
 * onboarding reruns are a designed refresh path (S2-02), and the
 * journal keeps their step outcomes and conflicts reviewable.
 */
export async function provisionOnboardingSite(
  payload: Payload,
  ownerEmail: string,
  rawInput: OnboardingInput,
) {
  const input = validateOnboardingInput(rawInput)
  const existing = await payload.find({
    collection: 'sites',
    where: { slug: { equals: input.slug } },
    limit: 1,
    overrideAccess: true,
  })
  const existingSiteId = existing.docs[0] ? String(existing.docs[0].id) : undefined
  let run = existingSiteId
    ? await beginRecipeRun(payload, {
        siteId: existingSiteId,
        kind: 'onboarding',
        recipeId: 'onboarding',
        recipeVersion: '1',
      })
    : undefined
  if (run?.state === 'completed') run = await refreshRecipeRun(payload, run)
  try {
    const result = await provisionOnboardingSiteRecords(payload, ownerEmail, rawInput)
    if (!run) {
      run = await beginRecipeRun(payload, {
        siteId: String(result.site.id),
        kind: 'onboarding',
        recipeId: 'onboarding',
        recipeVersion: '1',
      })
      if (run.state === 'completed') run = await refreshRecipeRun(payload, run)
    }
    await recordRecipeSteps(payload, run, {
      site: { status: 'done', targetId: String(result.site.id) },
      owner: { status: 'done', targetId: String(result.member.id) },
      publication: { status: 'done', targetId: String(result.publication.id) },
      space: { status: 'done', targetId: String(result.space.id) },
      starter: {
        status: 'done',
        detail: input.starterContent ? input.starterType : 'skipped-no-starter-content',
      },
    })
    await completeRecipeRun(payload, run, {
      summary: `Onboarded ${input.name} (${input.starterType}).`,
      targets: {
        site: String(result.site.id),
        member: String(result.member.id),
        publication: String(result.publication.id),
      },
    })
    return result
  } catch (error) {
    if (run) await failRecipeRun(payload, run, error)
    throw error
  }
}

/* ------------------------------------------------------------------ */
/* Progressive onboarding (S2-11)                                      */
/*                                                                     */
/* The first run needs only a name, an address, a starter type and a   */
/* theme. Every other backend requirement is supplied as a compatible  */
/* default and reported in `defaultsApplied`, so nothing about the     */
/* site's state is fictional: the operator refines locale, branding,   */
/* navigation, media and connections afterward in the normal editors   */
/* and settings. The site is created prelaunch (draft lifecycle — not  */
/* publicly resolvable) and goes public only at explicit launch.      */
/* ------------------------------------------------------------------ */

export type ProgressiveOnboardingInput = {
  name: string
  primaryUrl: string
  starterType: OnboardingInput['starterType']
  themeId: string
  slug?: string
}

export function buildProgressiveOnboardingInput(minimal: ProgressiveOnboardingInput): {
  input: OnboardingInput
  defaultsApplied: string[]
} {
  const slug =
    minimal.slug ??
    (minimal.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') ||
      new URL(minimal.primaryUrl).hostname.split('.')[0] ||
      'site')
  const input: OnboardingInput = {
    name: minimal.name,
    slug,
    description: '',
    primaryUrl: minimal.primaryUrl,
    locale: 'en',
    timezone: 'UTC',
    themeId: minimal.themeId,
    starterType: minimal.starterType,
    featureProfile: 'Lean',
    optionalConnections: [],
    starterContent: true,
    launchState: 'prelaunch',
  }
  return {
    input: validateOnboardingInput(input),
    defaultsApplied: [
      'description',
      'locale',
      'timezone',
      'featureProfile',
      'optionalConnections',
      'starterContent',
      'launchState',
    ],
  }
}

export async function startProgressiveOnboarding(
  payload: Payload,
  ownerEmail: string,
  minimal: ProgressiveOnboardingInput,
) {
  const { input, defaultsApplied } = buildProgressiveOnboardingInput(minimal)
  const result = await provisionOnboardingSite(payload, ownerEmail, input)
  const run = await getRecipeRun(payload, String(result.site.id), 'onboarding', '1')
  return {
    ...result,
    defaultsApplied,
    journal: run ? { status: run.status, summary: run.summary, steps: run.steps } : undefined,
    preview: {
      siteId: String(result.site.id),
      path: '/',
      themeId: input.themeId,
      state: 'prelaunch' as const,
    },
  }
}

/**
 * Explicit launch: the only transition that makes an onboarded site
 * public. Draft → active; already-active is a no-op; archived sites
 * cannot launch through onboarding.
 */
export async function launchOnboardedSite(payload: Payload, siteId: string) {
  const site = (await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })) as { id: string; lifecycle?: string }
  if (site.lifecycle === 'active') return site
  if (site.lifecycle !== 'draft')
    throw new Error(`Site cannot launch from lifecycle state: ${site.lifecycle ?? 'unknown'}.`)
  const updated = (await payload.update({
    collection: 'sites',
    id: siteId,
    overrideAccess: true,
    data: { lifecycle: 'active' },
  })) as { id: string; lifecycle?: string }
  return updated
}

export type OnboardingStatus = {
  siteId: string
  state: 'not-started' | 'in-progress' | 'failed' | 'prelaunch' | 'launched'
  lifecycle?: string
  journal?: {
    status: string
    summary?: string
    updatedAt: string
    steps: Record<string, { status: string; detail?: string }>
    conflicts: Array<{ step: string; detail?: string }>
  }
}

/** Resume + review surface: site lifecycle read together with the
 * recipe journal, including any step recorded as a conflict. */
export async function getOnboardingStatus(
  payload: Payload,
  siteId: string,
): Promise<OnboardingStatus> {
  const site = (await payload
    .findByID({ collection: 'sites', id: siteId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: string; lifecycle?: string } | null
  const run = await getRecipeRun(payload, siteId, 'onboarding', '1')
  if (!site && !run) return { siteId, state: 'not-started' }
  const conflicts = run
    ? Object.entries(run.steps)
        .filter(([, step]) => step.status === 'conflict')
        .map(([step, outcome]) => ({ step, detail: outcome.detail }))
    : []
  const state: OnboardingStatus['state'] =
    run?.status === 'failed'
      ? 'failed'
      : run?.status === 'running'
        ? 'in-progress'
        : site?.lifecycle === 'active'
          ? 'launched'
          : 'prelaunch'
  return {
    siteId,
    state,
    lifecycle: site?.lifecycle,
    journal: run
      ? {
          status: run.status,
          summary: run.summary,
          updatedAt: run.updatedAt,
          steps: run.steps,
          conflicts,
        }
      : undefined,
  }
}

async function provisionStarterContent(
  payload: Payload,
  context: {
    input: OnboardingInput
    site: { id: string }
    publication: { id: string }
    space: { id: string }
    member: { id: string }
  },
) {
  const { input, site, publication, space, member } = context
  if (input.starterType === 'publication-community' || input.starterType === 'campaign-commerce') {
    await installStarter(payload, { siteId: site.id, starterId: input.starterType })
    return
  }
  const recipe = recipeFor(input.starterType)
  const defaultComments = input.publishingDefaults?.commentsPolicy ?? 'closed'
  const pages = [
    [
      '/',
      'Home',
      `Welcome to ${input.name}. Replace this starter page with your story.`,
      'published',
    ],
    ['/about', 'About', 'Use this starter page to explain who you are and what you do.', 'draft'],
    ['/contact', 'Contact', 'Add the best way for visitors to reach you.', 'draft'],
    [
      '/privacy',
      'Privacy',
      'Replace this placeholder with your privacy policy before publishing.',
      'draft',
    ],
  ] as const
  for (const [path, title, summary, status] of pages)
    await upsertStarterContent(payload, {
      site: site.id,
      publication: publication.id,
      space: space.id,
      owner: member.id,
      contentType: 'page',
      title,
      slug: path === '/' ? 'home' : path.slice(1),
      canonicalPath: path,
      summary,
      body: toLexicalDocument(summary),
      status,
      commentsPolicy: defaultComments,
      importSourceSystem: 'onboarding-starter',
      importSourceIdentifier: `starter:${path}`,
      exportFormatVersion: 1,
    })
  await upsertStarterContent(payload, {
    site: site.id,
    publication: publication.id,
    space: space.id,
    owner: member.id,
    contentType: 'article',
    title: 'Your first draft',
    slug: 'welcome-draft',
    canonicalPath: '/articles/welcome-draft',
    summary: 'A private starter draft. Edit it or delete it whenever you are ready.',
    body: toLexicalDocument(
      'A private starter draft. Edit it or delete it whenever you are ready.',
    ),
    status: 'draft',
    commentsPolicy: defaultComments,
    importSourceSystem: 'onboarding-starter',
    importSourceIdentifier: 'starter:welcome-draft',
    exportFormatVersion: 1,
  })
  const layout = recipe
    ? previewRecipe(recipe, site.id)
    : { version: 1, blocks: [] as unknown[], revision: 1 }
  const layoutData = {
    site: site.id,
    publication: publication.id,
    space: space.id,
    path: '/',
    themeId: input.themeId,
    layoutVersion: layout.version,
    status: 'published',
    visibility: 'public',
    blocks: layout.blocks,
    unknownBlocks: [],
    revision: layout.revision,
    publishedRevision: layout.revision,
    revisionHistory: [
      {
        revision: layout.revision,
        installedRecipe: recipe ?? 'blank-minimal',
        source: 'onboarding-starter',
      },
    ],
  }
  const existingLayout = await payload.find({
    collection: 'page-layouts',
    where: { site: { equals: site.id }, path: { equals: '/' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const homeLayout = existingLayout.docs[0] as unknown as Record<string, unknown> | undefined
  if (!homeLayout) {
    await payload.create({
      collection: 'page-layouts',
      data: layoutData,
      overrideAccess: true,
    } as never)
  } else {
    // Refresh only the untouched onboarding baseline; an operator-edited
    // home layout is preserved exactly as authored.
    const history = Array.isArray(homeLayout.revisionHistory) ? homeLayout.revisionHistory : []
    const fromOnboarding = history.some(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        (entry as { source?: unknown }).source === 'onboarding-starter',
    )
    const pristine =
      fromOnboarding &&
      Number(homeLayout.revision) === layout.revision &&
      stableStringify(homeLayout.blocks) === stableStringify(layout.blocks)
    if (pristine) {
      await payload.update({
        collection: 'page-layouts',
        id: homeLayout.id,
        data: layoutData,
        overrideAccess: true,
      } as never)
    }
  }
}
