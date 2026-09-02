import { randomUUID } from 'node:crypto'

import type { Payload } from 'payload'

import { previewRecipe } from '../public/page-builder'

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
  themeId: 'neutral-starter' | 'renegade-party'
  starterType: (typeof starterSiteTypes)[number]
  featureProfile: (typeof onboardingProfiles)[number]
  optionalConnections: (typeof optionalConnectionKeys)[number][]
  logoMediaId?: string
  starterContent: boolean
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
  if (!['neutral-starter', 'renegade-party'].includes(input.themeId))
    throw new Error('Choose an existing theme.')
  if (!input.locale.trim() || !input.timezone.trim())
    throw new Error('Locale and timezone are required.')
  const optionalConnections = [...new Set(input.optionalConnections)].filter(
    (key): key is (typeof optionalConnectionKeys)[number] => optionalConnectionKeys.includes(key),
  )
  return {
    ...input,
    name,
    slug,
    primaryUrl,
    locale: input.locale.trim(),
    timezone: input.timezone.trim(),
    optionalConnections,
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

/** Creates only canonical records. Re-running after an interrupted enrollment updates the same starter pack. */
export async function provisionOnboardingSite(
  payload: Payload,
  ownerEmail: string,
  rawInput: OnboardingInput,
) {
  const input = validateOnboardingInput(rawInput)
  const site = await upsert(
    payload,
    'sites',
    { slug: { equals: input.slug } },
    {
      name: input.name,
      slug: input.slug,
      description: input.description || undefined,
      lifecycle: 'active',
    },
  )
  const member = await upsert(
    payload,
    'members',
    { email: { equals: ownerEmail } },
    { displayName: input.name, email: ownerEmail, status: 'active' },
  )
  const profileHandle = await resolveUniqueProfileHandle(payload, input.slug, member.id)
  const profile = await upsert(
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
    { handle: { equals: input.slug } },
    {
      member: member.id,
      profile: profile.id,
      handle: input.slug,
      canonicalPath: `/members/${input.slug}`,
      displayName: `${input.name} Space`,
      bio: input.description || undefined,
      visibility: 'public',
      moderationState: 'clear',
      capabilities: [{ key: 'space.blog', status: 'enabled' }],
      providerOwnership: { local: true },
    },
  )
  const brand = await upsert(
    payload,
    'brands',
    { name: { equals: input.name } },
    {
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
      visibility: 'public',
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
  await payload.updateGlobal({
    slug: 'site-settings',
    overrideAccess: true,
    data: {
      ownerKind: 'organization',
      organizationName: input.name,
      defaultTitle: input.name,
      defaultDescription: input.description || undefined,
      logo: input.logoMediaId || undefined,
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
    },
  } as never)
  if (input.starterContent)
    await provisionStarterContent(payload, { input, site, publication, space, member })
  return { site, publication, space, member, configuredCapabilities: enabledCapabilities }
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
  const recipe = recipeFor(input.starterType)
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
    await upsert(
      payload,
      'content',
      { canonicalPath: { equals: path } },
      {
        site: site.id,
        publication: publication.id,
        space: space.id,
        owner: member.id,
        contentType: 'page',
        title,
        slug: path === '/' ? 'home' : path.slice(1),
        canonicalPath: path,
        summary,
        status,
        commentsPolicy: 'closed',
        importSourceSystem: 'onboarding-starter',
        importSourceIdentifier: `starter:${path}`,
        exportFormatVersion: 1,
      },
    )
  await upsert(
    payload,
    'content',
    { canonicalPath: { equals: '/articles/welcome-draft' } },
    {
      site: site.id,
      publication: publication.id,
      space: space.id,
      owner: member.id,
      contentType: 'article',
      title: 'Your first draft',
      slug: 'welcome-draft',
      canonicalPath: '/articles/welcome-draft',
      summary: 'A private starter draft. Edit it or delete it whenever you are ready.',
      status: 'draft',
      commentsPolicy: 'closed',
      importSourceSystem: 'onboarding-starter',
      importSourceIdentifier: 'starter:welcome-draft',
      exportFormatVersion: 1,
    },
  )
  const layout = recipe
    ? previewRecipe(recipe, site.id)
    : { version: 1, blocks: [] as unknown[], revision: 1 }
  await upsert(
    payload,
    'page-layouts',
    { site: { equals: site.id }, path: { equals: '/' } },
    {
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
    },
  )
}
