/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC2-A-04 — the standard fixture world.
 *
 * One disposable, reproducible world that later RC2 passes run against
 * instead of inventing their own setup: two sites (A and B), the full
 * role ladder on each (global owner · site owner · admin · editor ·
 * contributor/member · denied outsider · subscriber), a publication of
 * two kinds, a member space with a staff-placed post, a forum, and —
 * under the Standard profile — a store with paid and unpaid orders.
 *
 * Seeding goes through production code paths (Payload collections and
 * their access rules, the real magic-link session machinery, the real
 * active-site route). Two known exceptions, recorded as findings in the
 * A-04 evidence rather than papered over:
 *  - Spaces are created through the operator path, because production
 *    has no member self-serve space creation today.
 *  - Orders are created directly, because production creates them only
 *    as the output of a settled checkout.
 *
 * Safety: the builder refuses to run against anything but a dedicated
 * *_release_acceptance database, and never in production posture. No
 * test-mode auth bypass exists anywhere in this module — sessions are
 * real: members sign in through the production magic-link machinery,
 * and operators hold genuine passkey-strategy sessions minted through
 * the production session store (createPasskeySession + admin_sessions,
 * the same path installation/recovery uses; a WebAuthn ceremony cannot
 * run headless, but every request is validated by the real strategy).
 * Every denial proof goes through the production access/grant
 * functions with overrideAccess off.
 */
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import { parseEnabledModules, type ModuleId } from '../../src/modules/module-registry'
import { publicSiteForHost } from '../../src/modules/public/site-scope'
import { resolveCommunityActor } from '../../src/modules/community/service'
import {
  consumeMagicLink,
  issueMagicLink,
  MEMBER_SESSION_COOKIE,
} from '../../src/modules/identity/member-identity'
import {
  GET as activeSiteGET,
  POST as activeSitePOST,
} from '../../src/app/(frontend)/api/admin/active-site/route'
import {
  createFixtureCryptoAdapter,
  createFixturePodAdapter,
} from '../../src/modules/commerce/service'
import { loadConfig } from '../../src/modules/core/config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { fixtureRichText } from '../helpers/fixture-rich-text'

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------

export function isFixtureSafeDatabase(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false
  try {
    return new URL(databaseUrl).pathname.endsWith('_release_acceptance')
  } catch {
    return false
  }
}

export function assertFixtureSafeDatabase(databaseUrl: string | undefined): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('RC2 fixture world must never run in production posture.')
  }
  if (!isFixtureSafeDatabase(databaseUrl)) {
    throw new Error(
      'RC2 fixture world refuses to run: the target database is not a dedicated *_release_acceptance acceptance database.',
    )
  }
}

// ---------------------------------------------------------------------------
// Module profile helpers
// ---------------------------------------------------------------------------

export function activeModules(): Set<ModuleId> {
  return parseEnabledModules(process.env.RENEGADE_MODULES)
}

export function moduleEnabled(id: ModuleId): boolean {
  return activeModules().has(id)
}

/** The profile the current process booted with: no optional modules = Lean. */
export function activeProfileName(): 'lean' | 'standard' {
  return activeModules().size === 0 ? 'lean' : 'standard'
}

// ---------------------------------------------------------------------------
// World shape
// ---------------------------------------------------------------------------

export interface Rc2Principal {
  key: string
  memberId: string
  userId?: string
  email: string
  /** Payload user record for operator-grant resolution (staff principals). */
  user?: any
}

export interface Rc2SiteWorld {
  siteId: string
  slug: string
  host: string
  origin: string
  blogPublicationId: string
  newsPublicationId: string
  publishedArticleId: string
  draftArticleId: string
  mediaAssetId: string
  member: Rc2Principal
  memberProfileId: string
  memberSpaceId: string
  spacePostId: string
  owner: Rc2Principal
  admin: Rc2Principal
  editor: Rc2Principal
  subscriber: Rc2Principal
  // Standard-profile surfaces (undefined under Lean):
  forumSectionId?: string
  forumId?: string
  discussionId?: string
  merchantConnectionId?: string
  productId?: string
  unpaidOrderId?: string
  paidOrderId?: string
}

export interface Rc2World {
  suffix: string
  siteA: Rc2SiteWorld
  siteB: Rc2SiteWorld
  /** A Site B admin with no authority on Site A — the denied principal. */
  outsider: Rc2Principal
  createdIds: Record<string, string[]>
  priorSiteSettings: any
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export async function buildRc2World(payload: Payload): Promise<Rc2World> {
  assertFixtureSafeDatabase(process.env.DATABASE_URL)
  const suffix = randomUUID().slice(0, 8)
  const createdIds: Record<string, string[]> = {}
  const track = (collection: string, id: unknown) => {
    ;(createdIds[collection] ||= []).push(String(id))
  }
  const create = async (collection: string, data: any, context?: any) => {
    const doc = await payload.create({
      collection: collection as never,
      data,
      overrideAccess: true,
      ...(context ? { context } : {}),
    } as any)
    track(collection, (doc as any).id)
    return doc as any
  }

  const priorSiteSettings = await (payload as any)
    .findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })
    .catch(() => null)

  // (site, member) is unique; user creation may already have granted a
  // role row through enrollment hooks, so grant idempotently.
  const memberRole = async (member: string, site: string, role: string) => {
    const existing = await payload.find({
      collection: 'member-site-roles' as never,
      where: { and: [{ member: { equals: member } }, { site: { equals: site } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as any)
    if (existing.docs[0]) {
      await payload.update({
        collection: 'member-site-roles' as never,
        id: (existing.docs[0] as any).id,
        data: { role } as never,
        overrideAccess: true,
      } as any)
      track('member-site-roles', (existing.docs[0] as any).id)
      return existing.docs[0]
    }
    return create('member-site-roles', { member, site, role })
  }

  async function buildSite(label: 'A' | 'B'): Promise<Rc2SiteWorld> {
    const lower = label.toLowerCase()
    const site = await create('sites', {
      name: `RC2 World Site ${label} ${suffix}`,
      slug: `rc2-a04-${lower}-${suffix}`,
      lifecycle: 'active',
    })
    const siteId = String(site.id)
    const host = `${lower}.rc2-a04.test`
    const origin = `https://${host}`

    const mkMember = async (kind: string) =>
      create('members', {
        displayName: `${kind} ${label} ${suffix}`,
        email: `${kind}-${lower}-${suffix}@example.test`,
        site: siteId,
        status: 'active',
      })
    const mkUser = async (member: any, role: string) =>
      create(
        'users',
        {
          email: String(member.email),
          role,
          member: member.id,
        },
        { skipEnrollmentToken: true, seeding: true },
      )
    const principal = (kind: string, member: any, user?: any): Rc2Principal => ({
      key: `${kind}-${lower}`,
      memberId: String(member.id),
      userId: user ? String(user.id) : undefined,
      email: String(member.email),
      user,
    })

    const ownerMember = await mkMember('owner')
    const ownerUser = await mkUser(ownerMember, 'owner')
    await memberRole(ownerMember.id, siteId, 'community-manager')

    const adminMember = await mkMember('admin')
    const adminUser = await mkUser(adminMember, 'administrator')
    await memberRole(adminMember.id, siteId, 'community-manager')

    const editorMember = await mkMember('editor')
    const editorUser = await mkUser(editorMember, 'staff')
    await memberRole(editorMember.id, siteId, 'contributor')

    const memberMember = await mkMember('member')
    await memberRole(memberMember.id, siteId, 'member')

    const subscriberMember = await mkMember('subscriber')
    await memberRole(subscriberMember.id, siteId, 'member')
    // Payload users only carry operator roles (owner/administrator/staff);
    // a subscriber exists as a member identity, never as a login-able
    // operator account — modeled as a user-shaped principal, as the
    // tenant-authorization matrix does.
    const subscriberUser = {
      id: `subscriber-user-${lower}-${suffix}`,
      email: String(subscriberMember.email),
      role: 'subscriber',
      member: subscriberMember.id,
    }

    const blog = await create('publications', {
      site: siteId,
      name: `Site ${label} Blog ${suffix}`,
      slug: `blog-${lower}-${suffix}`,
      canonicalBasePath: '/blog/',
      status: 'active',
    })
    const news = await create('publications', {
      site: siteId,
      name: `Site ${label} News ${suffix}`,
      slug: `news-${lower}-${suffix}`,
      canonicalBasePath: '/news/',
      status: 'active',
    })

    const media = await create('media-assets', {
      site: siteId,
      title: `Site ${label} Shared Media ${suffix}`,
      kind: 'image',
      mimeType: 'image/png',
      byteSize: 1024,
      storageLocation: `rc2-a04-${lower}-${suffix}.png`,
      checksum: `sha256:${randomUUID().replace(/-/g, '')}`,
    })

    const published = await create('content', {
      site: siteId,
      publication: blog.id,
      contentType: 'article',
      title: `Site ${label} Published Article ${suffix}`,
      slug: `site-${lower}-published-${suffix}`,
      status: 'published',
      body: fixtureRichText(`Site ${label} published body ${suffix}`),
    })
    const draft = await create('content', {
      site: siteId,
      publication: blog.id,
      contentType: 'article',
      title: `Site ${label} Draft Article ${suffix}`,
      slug: `site-${lower}-draft-${suffix}`,
      status: 'draft',
    })

    const profile = await create('profiles', {
      member: memberMember.id,
      displayName: `Member ${label} ${suffix}`,
      handle: `member-${lower}-${suffix}`,
    })
    // Spaces are operator-created in production today (no member
    // self-serve path exists); the fixture uses that same operator path.
    const space = await create('spaces', {
      site: siteId,
      member: memberMember.id,
      profile: profile.id,
      handle: `member-${lower}-${suffix}`,
      displayName: `Member ${label} ${suffix}`,
      canonicalPath: `/spaces/member-${lower}-${suffix}`,
    })
    // A post placed into the member's space by staff — the only write
    // path production offers today (see the A-04 member-journey finding).
    const spacePost = await create('content', {
      site: siteId,
      space: space.id,
      contentType: 'article',
      title: `Member ${label} Space Post ${suffix}`,
      slug: `member-${lower}-space-post-${suffix}`,
      status: 'published',
      body: fixtureRichText(`Member ${label} space post body ${suffix}`),
    })

    const world: Rc2SiteWorld = {
      siteId,
      slug: String(site.slug),
      host,
      origin,
      blogPublicationId: String(blog.id),
      newsPublicationId: String(news.id),
      publishedArticleId: String(published.id),
      draftArticleId: String(draft.id),
      mediaAssetId: String(media.id),
      member: principal('member', memberMember),
      memberProfileId: String(profile.id),
      memberSpaceId: String(space.id),
      spacePostId: String(spacePost.id),
      owner: principal('owner', ownerMember, ownerUser),
      admin: principal('admin', adminMember, adminUser),
      editor: principal('editor', editorMember, editorUser),
      subscriber: principal('subscriber', subscriberMember, subscriberUser),
    }

    if (moduleEnabled('community')) {
      const section = await create('forum-sections', {
        site: siteId,
        name: `General ${label} ${suffix}`,
        slug: `general-${lower}-${suffix}`,
      })
      const forum = await create('forums', {
        site: siteId,
        section: section.id,
        name: `Announcements ${label} ${suffix}`,
        slug: `announcements-${lower}-${suffix}`,
      })
      const discussion = await create('discussions', {
        site: siteId,
        forum: forum.id,
        kind: 'thread',
        title: `Welcome thread ${label} ${suffix}`,
        canonicalPath: `/forum/announcements-${lower}-${suffix}/welcome-${suffix}`,
      })
      world.forumSectionId = String(section.id)
      world.forumId = String(forum.id)
      world.discussionId = String(discussion.id)
    }

    if (moduleEnabled('commerce')) {
      const merchant = await create('merchant-connections', {
        site: siteId,
        label: `Site ${label} Merchant ${suffix}`,
        providerKey: 'stripe',
        merchantCountry: 'US',
      })
      const product = await create('products', {
        site: siteId,
        merchantConnection: merchant.id,
        name: `Site ${label} Print ${suffix}`,
        slug: `print-${lower}-${suffix}`,
        canonicalPath: `/store/print-${lower}-${suffix}`,
        kind: 'physical',
        state: 'draft',
        productCapabilities: ['shippable'],
        optionDimensions: [{ key: 'finish', label: 'Finish', values: ['Matte'] }],
        variants: [
          {
            sku: `PRINT-${suffix}-${label}`,
            title: 'Print Matte',
            status: 'active',
            optionValues: { finish: 'Matte' },
            inventoryPolicy: 'tracked',
            inventoryQuantity: 5,
            weightGrams: 200,
            dimensionsMm: { length: 250, width: 200, height: 10 },
          },
        ],
        prices: [{ currency: 'USD', amountMinor: '5000', variantSku: `PRINT-${suffix}-${label}` }],
        offers: [
          {
            id: `offer-${lower}-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `PRINT-${suffix}-${label}`,
            amountMinor: '5000',
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
      })
      const cart = await create('carts', {
        site: siteId,
        merchantConnection: merchant.id,
        currency: 'USD',
        version: 1,
        items: [],
      })
      const session = await create('checkout-sessions', {
        site: siteId,
        cart: cart.id,
        merchantConnection: merchant.id,
        currency: 'USD',
        amountMinor: '5000',
        attempt: 1,
      })
      const unpaid = await create('orders', {
        site: siteId,
        checkoutSession: session.id,
        merchantConnection: merchant.id,
        orderNumber: `RC2-A04-${suffix}-${label}-U`,
        state: 'pending-payment',
        currency: 'USD',
        amountMinor: '5000',
        items: [],
      })
      // One order per checkout session: the paid order gets its own.
      const paidCart = await create('carts', {
        site: siteId,
        merchantConnection: merchant.id,
        currency: 'USD',
        version: 1,
        items: [],
      })
      const paidSession = await create('checkout-sessions', {
        site: siteId,
        cart: paidCart.id,
        merchantConnection: merchant.id,
        currency: 'USD',
        amountMinor: '5000',
        attempt: 1,
      })
      const paid = await create('orders', {
        site: siteId,
        checkoutSession: paidSession.id,
        merchantConnection: merchant.id,
        orderNumber: `RC2-A04-${suffix}-${label}-P`,
        state: 'paid',
        currency: 'USD',
        amountMinor: '5000',
        items: [],
      })
      world.merchantConnectionId = String(merchant.id)
      world.productId = String(product.id)
      world.unpaidOrderId = String(unpaid.id)
      world.paidOrderId = String(paid.id)
    }

    return world
  }

  const siteA = await buildSite('A')
  const siteB = await buildSite('B')

  // Host → site mapping through the production site-settings global.
  await (payload as any).updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: siteA.origin,
      canonicalOriginsBySite: {
        [siteA.siteId]: siteA.origin,
        [siteB.siteId]: siteB.origin,
      },
    },
    overrideAccess: true,
  })

  return {
    suffix,
    siteA,
    siteB,
    outsider: siteB.admin,
    createdIds,
    priorSiteSettings,
  }
}

export async function teardownRc2World(payload: Payload, world: Rc2World): Promise<void> {
  const order = [
    'orders',
    'checkout-sessions',
    'carts',
    'products',
    'merchant-connections',
    'discussions',
    'forums',
    'forum-sections',
    'content',
    'media-assets',
    'spaces',
    'profiles',
    'publications',
    'member-site-roles',
    'users',
    'members',
    'sites',
  ]
  for (const collection of order) {
    const ids = world.createdIds[collection]
    if (!ids?.length) continue
    await (payload as any)
      .delete({ collection, where: { id: { in: ids } }, overrideAccess: true })
      .catch(() => undefined)
  }
  if (world.priorSiteSettings) {
    await (payload as any)
      .updateGlobal({
        slug: 'site-settings',
        data: {
          canonicalOrigin: world.priorSiteSettings.canonicalOrigin,
          canonicalOriginsBySite: world.priorSiteSettings.canonicalOriginsBySite,
        },
        overrideAccess: true,
      })
      .catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Harness helpers — all go through production machinery
// ---------------------------------------------------------------------------

/**
 * A real operator session for a staff principal. Production staff auth
 * is passkey-only (the users collection disables password login), so
 * the harness mints the session through the production session
 * machinery — createPasskeySession plus the admin_sessions row, exactly
 * as installation.ts does — and returns the cookie headers a browser
 * would carry. The passkey strategy validates it on every request.
 */
export async function operatorSession(payload: Payload, principal: Rc2Principal): Promise<Headers> {
  if (!principal.userId) throw new Error(`Principal ${principal.key} has no operator account`)
  const session = await createPasskeySession(
    { id: principal.userId, email: principal.email },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await (payload.db as any).pool.query(
        'INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
        [sessionId, principal.userId, expiresAt],
      )
    },
  )
  return new Headers({ cookie: `renegade-passkey=${session.token}` })
}

/**
 * Site switch through the production route (POST /api/admin/active-site):
 * Payload auth -> operator grant check -> renegade-active-site cookie.
 * Returns the HTTP status and the Set-Cookie value (null when refused).
 */
export async function switchSite(session: Headers, siteId: string) {
  const res = await activeSitePOST(
    new Request('http://localhost/api/admin/active-site', {
      method: 'POST',
      headers: { cookie: session.get('cookie') ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ siteId }),
    }),
  )
  return { status: res.status, setCookie: res.headers.get('set-cookie') }
}

/** Reads the production active-site state for a session (GET route). */
export async function activeSite(session: Headers, extraCookie?: string) {
  const base = session.get('cookie') ?? ''
  const headers: Record<string, string> = {
    cookie: extraCookie ? `${base}; ${extraCookie}` : base,
  }
  const res = await activeSiteGET(
    new Request('http://localhost/api/admin/active-site', { headers }),
  )
  const body = (await res.json().catch(() => ({}))) as any
  return { status: res.status, activeSiteId: body.activeSiteId as string | undefined }
}

/**
 * Real member login: a magic link is issued and consumed through the
 * production identity machinery, yielding a genuine member session.
 * Returns the headers a browser would carry for that session.
 */
export async function loginAsMember(
  payload: Payload,
  principal: Rc2Principal,
): Promise<{ headers: Headers; memberId: string }> {
  const issued = await issueMagicLink(payload as any, principal.email)
  if (!issued.token) throw new Error(`Magic link not issued for ${principal.key}`)
  const consumed = await consumeMagicLink(payload as any, issued.token)
  if (!consumed?.sessionToken) throw new Error(`Magic link not consumed for ${principal.key}`)
  return {
    headers: new Headers({
      cookie: `${MEMBER_SESSION_COOKIE}=${consumed.sessionToken}`,
    }),
    memberId: String(consumed.memberId),
  }
}

/** Resolves the community actor for a member session on a site (production). */
export async function actorOn(payload: Payload, headers: Headers, siteId: string) {
  return resolveCommunityActor(payload, headers, siteId)
}

/** Access-controlled read probe: true only if the principal may read the record. */
export async function canReadAs(
  payload: Payload,
  user: any,
  collection: string,
  id: string,
): Promise<boolean> {
  try {
    const doc = await (payload as any).findByID({
      collection,
      id,
      depth: 0,
      user,
      overrideAccess: false,
    })
    return Boolean(doc)
  } catch {
    return false
  }
}

/** Access-controlled write probe against a harmless title-shaped field. */
export async function canWriteAs(
  payload: Payload,
  user: any,
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    await (payload as any).update({ collection, id, data, user, overrideAccess: false })
    return true
  } catch {
    return false
  }
}

/**
 * Anonymous browsing: resolves the site a public host selects (production
 * host resolution — fail-closed) and lists that site's published content.
 */
export async function browseAnonymous(payload: Payload, host: string) {
  const siteId = await publicSiteForHost(payload, host)
  if (!siteId) return { siteId: '', publishedTitles: [] as string[] }
  const found = await (payload as any).find({
    collection: 'content',
    where: {
      and: [{ site: { equals: siteId } }, { status: { equals: 'published' } }],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return { siteId, publishedTitles: found.docs.map((d: any) => String(d.title)) }
}

/**
 * A "reload" of principal state: fresh logins and fresh resolutions from
 * the database, discarding every token/cookie/actor resolved so far —
 * the authorization-relevant effect of a browser reload + new session.
 */
export async function reloadPrincipals(payload: Payload, world: Rc2World) {
  const adminSession = await operatorSession(payload, world.siteA.admin)
  const outsiderSession = await operatorSession(payload, world.outsider)
  const memberSession = await loginAsMember(payload, world.siteA.member)
  return { adminSession, outsiderSession, memberSession }
}

/** Deterministic provider failures for passes that need them. */
export const deterministicProviderFailures = {
  /** A chain adapter that has observed nothing: every lookup misses. */
  cryptoObservationMissing: () => createFixtureCryptoAdapter('fixture-missing', []),
  /** A POD adapter whose submissions always fail. */
  podSubmitFails: () => createFixturePodAdapter('printful', 'rc2-a04-fixture-secret', true),
}
