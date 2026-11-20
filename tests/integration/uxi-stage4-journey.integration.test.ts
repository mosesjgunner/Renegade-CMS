/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { createHash } from 'node:crypto'
import {
  beginPasskeyRegistration,
  ensureBootstrap,
} from '../../src/modules/operations/installation'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import {
  provisionOnboardingSite,
  type OnboardingInput,
} from '../../src/modules/operations/onboarding'
import { installStarter, toLexicalDocument } from '../../src/modules/starters/service'
import { listStarterExamples, removeStarterExamples } from '../../src/modules/starters/examples'
import { resolvePublicSiteAccess } from '../../src/modules/public/site-visibility'
import { canRenderPublic } from '../../src/modules/public/contracts'

// Stage 4 (UXI-05 remainder + UXI-06 + UXI-07) — the "first complete
// proof" journey at integration level:
//
//   claim → owner → starter chosen → one real post with a photo →
//   logged-out visitor sees it (site public) → site set to
//   coming-soon: the same visitor sees the holding page and NOT the
//   post, while the owner still previews → refresh mid-setup +
//   repeated final submission produce no duplicates → edited example
//   content is protected from example removal.
//
// Substitutes, named honestly: the WebAuthn device ceremony cannot run
// in this rig, so the claim step uses beginPasskeyRegistration (the
// exact call the claim handoff makes; the ceremony itself is covered
// by installation-resume.integration.test.ts) and the owner session is
// a fixture passkey session (the pattern content-release-acceptance
// uses). A real service restart is likewise not executable here: the
// "refresh mid-setup" step is proven by re-running the full
// provisioning (the resume path a refreshed browser reaches) and by
// the completed starter run returning its prior outcome. Public
// rendering is verified through resolvePublicSiteAccess — the exact
// gate both public page routes call before any content query — plus
// the same public content query the homepage runs.

let payload: Payload
const uniq = randomUUID().slice(0, 8)
const slug = `journey-${uniq}`
const ownerEmail = `${slug}@owner.test`
let siteId = ''
let ownerHeaders: Headers
let postId = ''
let photoId = ''

function onboardingInput(): OnboardingInput {
  return {
    name: 'Journey Gazette',
    slug,
    description: 'Stage 4 journey proof site.',
    primaryUrl: `https://${slug}.example.test`,
    locale: 'en-US',
    timezone: 'UTC',
    themeId: 'neutral-starter',
    starterType: 'publication-community',
    featureProfile: 'Lean',
    optionalConnections: [],
    starterContent: true,
    siteVisibility: 'public',
  }
}

async function countForSite(collection: string): Promise<number> {
  const result = await payload.count({
    collection: collection as never,
    where: { site: { equals: siteId } },
    overrideAccess: true,
  } as never)
  return result.totalDocs
}

beforeAll(async () => {
  payload = await getPayload({ config })
}, 60_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('Stage 4 first complete proof journey', () => {
  it('claim → owner → starter → post with photo → public → coming-soon gate → no duplicates', async () => {
    // 1. Claim: bootstrap token issued, then claimed by the owner email.
    await payload.db.pool.query('DELETE FROM installation_state')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const bootstrap = await ensureBootstrap(payload, loadConfig())
    const token = consoleWarn.mock.calls[0]?.[0].match(/: ([A-Za-z0-9_-]+)$/)?.[1] ?? ''
    consoleWarn.mockRestore()
    expect(bootstrap.state).toBe('incomplete')
    expect(token).toHaveLength(43)
    const claim = await beginPasskeyRegistration(payload, loadConfig(), {
      email: ownerEmail,
      token,
    })
    expect(claim.enrollmentToken).toBeTruthy()
    await payload.db.pool.query('DELETE FROM installation_state')

    // Owner account (fixture session; see header note).
    const userRes = await payload.db.pool.query(
      `INSERT INTO users (email, role, is_global_owner) VALUES ($1, 'owner', true) RETURNING id`,
      [ownerEmail],
    )
    const ownerUserId = String(userRes.rows[0].id)
    const session = await createPasskeySession(
      { email: ownerEmail, id: ownerUserId },
      loadConfig().payloadSecret,
      async (id, expiresAt) => {
        await payload.db.pool.query(
          `INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
          [id, ownerUserId, expiresAt],
        )
      },
    )
    ownerHeaders = new Headers({ cookie: `renegade-passkey=${session.token}` })

    // 2. Owner provisions the site with the publication starter.
    const provisioned = await provisionOnboardingSite(payload, ownerEmail, onboardingInput())
    siteId = String(provisioned.site.id)
    const site = (await payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(site.visibility).toBe('public')
    const contentAfterInstall = await countForSite('content')
    const layoutsAfterInstall = await countForSite('page-layouts')
    expect(contentAfterInstall).toBeGreaterThan(0)
    expect(layoutsAfterInstall).toBeGreaterThan(0)

    // 3. Refresh mid-setup + repeated final submission: re-running the
    // whole provisioning and the starter install creates no duplicates.
    await provisionOnboardingSite(payload, ownerEmail, onboardingInput())
    const repeat = await installStarter(payload, {
      siteId,
      starterId: 'publication-community',
      ownerEmail,
    })
    expect(repeat.success).toBe(true)
    expect(await countForSite('content')).toBe(contentAfterInstall)
    expect(await countForSite('page-layouts')).toBe(layoutsAfterInstall)
    const sitesWithSlug = await payload.count({
      collection: 'sites',
      where: { slug: { equals: slug } },
      overrideAccess: true,
    } as never)
    expect(sitesWithSlug.totalDocs).toBe(1)

    // 4. One real post with a photo, written by the owner.
    const bytes = await readFile(
      path.join(process.cwd(), 'public', '/starter-assets/publication-hero.svg'),
    )
    const storage = mediaStorage(loadConfig())
    const storageKey = `journey/${siteId}/${createHash('sha256').update(bytes).digest('hex')}/journey-photo.svg`
    await storage.put(storageKey, bytes, 'image/svg+xml')
    const member = provisioned.member as any
    const photo = (await payload.create({
      collection: 'media-assets',
      data: {
        site: siteId,
        title: 'Journey photo',
        originalFilename: 'journey-photo.svg',
        mimeType: 'image/svg+xml',
        kind: 'image',
        altText: 'A photograph attached to the journey post',
        description: 'Journey proof photo.',
        creatorCredit: 'Journey test',
        licenseType: 'owned',
        governanceEnabled: true,
        storageProvider: storage.provider,
        storageLocation: storageKey,
        width: 1200,
        height: 675,
        aspectRatio: 1.777,
      },
      overrideAccess: true,
    } as never)) as any
    photoId = String(photo.id)

    const post = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        owner: String(member.id),
        contentType: 'article',
        title: 'Journey post with a photo',
        slug: `journey-post-${uniq}`,
        canonicalPath: `/articles/journey-post-${uniq}`,
        summary: 'The owner’s first real post.',
        body: toLexicalDocument('The owner’s first real post, with a photo.'),
        heroMedia: photoId,
        publishedAt: new Date(Date.now() - 60_000).toISOString(),
        status: 'published',
        visibility: 'public',
        commentsPolicy: 'open',
      },
      overrideAccess: true,
    } as never)) as any
    postId = String(post.id)

    // 5. Logged-out visitor sees it while the site is public: the
    // route gate allows, and the homepage's own public query finds it.
    const anonymous = new Headers()
    const publicAccess = await resolvePublicSiteAccess(payload, { siteId, headers: anonymous })
    expect(publicAccess.allowed).toBe(true)
    const publicQuery = await payload.find({
      collection: 'content',
      where: {
        and: [
          { site: { equals: siteId } },
          { contentType: { equals: 'article' } },
          { status: { in: ['published', 'updated'] } },
          { visibility: { equals: 'public' } },
        ],
      } as never,
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
    const visiblePost = publicQuery.docs.find((doc: any) => String(doc.id) === postId) as any
    expect(visiblePost).toBeTruthy()
    expect(canRenderPublic(visiblePost)).toBe(true)
    expect(String(visiblePost.heroMedia)).toBe(photoId)

    // 6. Coming-soon: the same visitor is gated out (holding page, no
    // post); the signed-in owner still previews.
    await payload.update({
      collection: 'sites',
      id: siteId,
      data: { visibility: 'coming-soon' },
      overrideAccess: true,
    } as never)
    const gated = await resolvePublicSiteAccess(payload, { siteId, headers: anonymous })
    expect(gated.allowed).toBe(false)
    if (!gated.allowed) expect(gated.visibility).toBe('coming-soon')
    const ownerAccess = await resolvePublicSiteAccess(payload, {
      siteId,
      headers: ownerHeaders,
    })
    expect(ownerAccess.allowed).toBe(true)

    // Private behaves the same for visitors.
    await payload.update({
      collection: 'sites',
      id: siteId,
      data: { visibility: 'private' },
      overrideAccess: true,
    } as never)
    const privateGate = await resolvePublicSiteAccess(payload, { siteId, headers: anonymous })
    expect(privateGate.allowed).toBe(false)
    await payload.update({
      collection: 'sites',
      id: siteId,
      data: { visibility: 'public' },
      overrideAccess: true,
    } as never)
  }, 180_000)

  it('protects edited examples and removes only pristine starter content', async () => {
    const preview = await listStarterExamples(payload, siteId)
    expect(preview.removableCount).toBeGreaterThan(0)
    const victim = preview.removable.find((item) => item.kind === 'content')
    expect(victim).toBeTruthy()

    // The operator edits one example: it stops being an example.
    await payload.update({
      collection: 'content',
      id: victim!.id,
      data: { title: `${victim!.title} — edited by the owner` },
      overrideAccess: true,
    } as never)
    const afterEdit = await listStarterExamples(payload, siteId)
    expect(afterEdit.removable.some((item) => item.id === victim!.id)).toBe(false)
    expect(afterEdit.protectedEdited.some((item) => item.id === victim!.id)).toBe(true)

    const result = await removeStarterExamples(payload, siteId)
    expect(result.removed.length).toBeGreaterThan(0)
    // Edited example survives; the owner's own post (no provenance) survives.
    const editedDoc = await payload
      .findByID({ collection: 'content', id: victim!.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    expect(editedDoc).toBeTruthy()
    const ownPost = await payload
      .findByID({ collection: 'content', id: postId, depth: 0, overrideAccess: true })
      .catch(() => null)
    expect(ownPost).toBeTruthy()
    // A pristine removed example is actually gone from public view:
    // deleted outright, or unpublished (draft) where the platform's
    // revision-history guard forbids deletion.
    const removedContent = result.removed.find((item) => item.kind === 'content')
    expect(removedContent).toBeTruthy()
    const after = await payload
      .findByID({ collection: 'content', id: removedContent!.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (removedContent!.action === 'deleted') {
      expect(after).toBeNull()
    } else {
      expect(after).toBeTruthy()
      expect((after as any).status).toBe('draft')
      expect(canRenderPublic(after as any)).toBe(false)
    }
  }, 120_000)
})
