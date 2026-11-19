/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  provisionOnboardingSite,
  type OnboardingInput,
} from '../../src/modules/operations/onboarding'
import { authenticateWithRecoveryCode } from '../../src/modules/operations/installation'
import { loadConfig } from '../../src/modules/core/config'

// Regression guard for the first-run installer. `provisionOnboardingSite` is the
// step that `completeInstallation` runs after a passkey is verified, and it is the
// exact place the installer used to crash: the owner `profiles` record was created
// without a `handle`, which is `required` + `unique` with a canonicalSlug validator,
// so provisioning threw a ValidationError that surfaced as a generic setup failure.
//
// These tests exercise the real service against real Postgres (no fakes for the
// collections) and assert the owner profile is created with a valid, unique handle.
// If the handle fix is reverted, the first assertion fails with a ValidationError,
// so the installer can never silently regress again.

const CANONICAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

let payload: Payload

async function getPayloadInstance(): Promise<Payload> {
  if (!payload) payload = await getPayload({ config })
  return payload
}

beforeAll(async () => {
  await getPayloadInstance()
}, 60_000)

function onboardingInput(slug: string, name: string): OnboardingInput {
  return {
    name,
    slug,
    description: 'First-run installer regression coverage.',
    primaryUrl: `https://${slug}.example.test`,
    locale: 'en-US',
    timezone: 'UTC',
    themeId: 'neutral-starter',
    starterType: 'blank-minimal',
    featureProfile: 'Lean',
    optionalConnections: [],
    starterContent: false,
  }
}

async function findProfileForMember(instance: Payload, memberId: string) {
  const profiles = await instance.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return profiles.docs[0] as any
}

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('first-run onboarding provisioning', () => {
  it('creates the owner profile with a valid, unique handle', async () => {
    const instance = await getPayloadInstance()
    const slug = `setup-${randomUUID().slice(0, 8)}`
    const ownerEmail = `${slug}@owner.test`

    // Fails here with a ValidationError ("The following field is invalid: Handle")
    // if the owner-profile handle fix is reverted.
    const result = await provisionOnboardingSite(
      instance,
      ownerEmail,
      onboardingInput(slug, 'Setup Owner'),
    )
    expect(result.site).toBeTruthy()

    const member = (
      await instance.find({
        collection: 'members',
        where: { email: { equals: ownerEmail } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    expect(member).toBeTruthy()

    const profile = await findProfileForMember(instance, member.id)
    expect(profile).toBeTruthy()
    expect(typeof profile.handle).toBe('string')
    expect(profile.handle.length).toBeGreaterThan(0)
    expect(profile.handle).toMatch(CANONICAL_SLUG)
    // The site slug is already canonical, so it is the preferred handle.
    expect(profile.handle).toBe(slug)
  })

  it('falls back to a suffixed handle when the preferred handle is taken', async () => {
    const instance = await getPayloadInstance()
    const slug = `setup-${randomUUID().slice(0, 8)}`
    const ownerEmail = `${slug}@owner.test`

    // Pre-create a DIFFERENT member's profile that already owns the preferred handle.
    const otherMember = (await instance.create({
      collection: 'members',
      data: { displayName: 'Prior Owner', email: `prior-${slug}@owner.test`, status: 'active' },
      overrideAccess: true,
    } as never)) as any
    await instance.create({
      collection: 'profiles',
      data: {
        member: otherMember.id,
        displayName: 'Prior Owner',
        handle: slug,
        visibility: 'public',
        fieldAudience: { email: 'private', bio: 'public' },
      },
      overrideAccess: true,
    } as never)

    await provisionOnboardingSite(instance, ownerEmail, onboardingInput(slug, 'Setup Owner'))

    const member = (
      await instance.find({
        collection: 'members',
        where: { email: { equals: ownerEmail } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    const profile = await findProfileForMember(instance, member.id)
    expect(profile.handle).toMatch(CANONICAL_SLUG)
    // Collision avoided: the owner did not reuse the taken handle.
    expect(profile.handle).not.toBe(slug)
    expect(profile.handle.startsWith(`${slug}-`)).toBe(true)
  })

  it('is idempotent: re-running keeps the same owner profile handle', async () => {
    const instance = await getPayloadInstance()
    const slug = `setup-${randomUUID().slice(0, 8)}`
    const ownerEmail = `${slug}@owner.test`

    await provisionOnboardingSite(instance, ownerEmail, onboardingInput(slug, 'Setup Owner'))
    const member = (
      await instance.find({
        collection: 'members',
        where: { email: { equals: ownerEmail } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    const first = await findProfileForMember(instance, member.id)

    // A second run (e.g. a retried setup) must not crash on the unique handle.
    await provisionOnboardingSite(instance, ownerEmail, onboardingInput(slug, 'Setup Owner'))
    const second = await findProfileForMember(instance, member.id)

    expect(second.id).toBe(first.id)
    expect(second.handle).toBe(first.handle)
  })

  it('media-podcast: creates exactly one default show (even without starter content), reruns create no duplicate, and returns the studio URL', async () => {
    const instance = await getPayloadInstance()
    const slug = `pod-${randomUUID().slice(0, 8)}`
    const ownerEmail = `${slug}@owner.test`
    // starterContent: false on purpose — choosing the podcast purpose is
    // the decision; the sample-content checkbox must not gate the show.
    const input: OnboardingInput = {
      ...onboardingInput(slug, 'Podcast Setup Show'),
      starterType: 'media-podcast',
      starterContent: false,
    }

    const result = await provisionOnboardingSite(instance, ownerEmail, input)
    expect(result.podcastShow?.id).toBeTruthy()
    expect(result.podcastShow?.studioUrl).toBe(`/studio/${result.podcastShow?.id}`)

    const findShows = async () =>
      (
        await instance.find({
          collection: 'podcast-shows',
          where: { site: { equals: result.site.id } },
          limit: 10,
          depth: 0,
          overrideAccess: true,
        } as never)
      ).docs as any[]

    const shows = await findShows()
    expect(shows).toHaveLength(1)
    expect(String(shows[0].id)).toBe(result.podcastShow?.id)
    expect(shows[0].slug).toBe(slug)
    expect(shows[0].title).toBe('Podcast Setup Show')
    expect(shows[0].language).toBe('en-US')
    expect(shows[0].description).toBe('First-run installer regression coverage.')
    // Defaults only: empty profiles mean the POD-13/POD-16 defaults apply.
    expect(shows[0].exportProfile ?? null).toBeNull()
    expect(shows[0].streamProfile ?? null).toBeNull()
    // Feed-live out of the box: the public feed route 404s unless the
    // show is published with RSS enabled, so the starter show must be
    // created that way — the owner's first published episode has to
    // reach the feed without an admin detour.
    expect(shows[0].status).toBe('published')
    expect(shows[0].rssEnabled).toBe(true)
    expect(shows[0].feedVisibility).toBe('public')
    expect(shows[0].publishedAt).toBeTruthy()

    const rerun = await provisionOnboardingSite(instance, ownerEmail, input)
    expect(rerun.podcastShow?.id).toBe(result.podcastShow?.id)
    expect(rerun.podcastShow?.studioUrl).toBe(result.podcastShow?.studioUrl)
    expect(await findShows()).toHaveLength(1)
  })

  it('media-podcast: suffixes the show slug when another site already owns the site slug as a show slug', async () => {
    const instance = await getPayloadInstance()
    const firstSlug = `pod-${randomUUID().slice(0, 8)}`
    const first = await provisionOnboardingSite(
      instance,
      `${firstSlug}@owner.test`,
      onboardingInput(firstSlug, 'First Site'),
    )
    const slug = `pod-${randomUUID().slice(0, 8)}`
    await instance.create({
      collection: 'podcast-shows',
      data: { site: first.site.id, title: 'Other Site Show', slug },
      overrideAccess: true,
    } as never)

    const result = await provisionOnboardingSite(instance, `${slug}@owner.test`, {
      ...onboardingInput(slug, 'Second Podcast Site'),
      starterType: 'media-podcast',
      starterContent: false,
    })
    const show = (await instance.findByID({
      collection: 'podcast-shows',
      id: result.podcastShow!.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(show.slug).toBe(`${slug}-podcast`)
    expect(String(show.site?.id ?? show.site)).toBe(String(result.site.id))
  })

  it('exercises full Lean profile lifecycle with publishing defaults', async () => {
    const instance = await getPayloadInstance()
    const slug = `lean-${randomUUID().slice(0, 8)}`
    const ownerEmail = `${slug}@owner.test`

    const startTime = performance.now()
    const provisioned = await provisionOnboardingSite(instance, ownerEmail, {
      ...onboardingInput(slug, 'Lean Sovereign Node'),
      featureProfile: 'Lean',
      starterType: 'creator-publication',
      starterContent: true,
      publishingDefaults: {
        indexingMode: 'noindex',
        commentsPolicy: 'members',
        visibility: 'members-only',
      },
    })
    const durationMs = Math.round(performance.now() - startTime)

    expect(durationMs).toBeLessThan(10_000)
    expect(provisioned.site.id).toBeDefined()
    expect(provisioned.publication.id).toBeDefined()
    expect(provisioned.configuredCapabilities).toContain('publication.content')

    const siteSettings = (await instance.findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
    } as never)) as any

    expect(siteSettings.indexingMode).toBe('noindex')
    expect(siteSettings.seoNoIndex).toBe(true)
    expect(siteSettings.onboarding?.featureProfile).toBe('Lean')
  })

  it('exercises full Standard profile lifecycle with publishing defaults', async () => {
    const instance = await getPayloadInstance()
    const slug = `standard-${randomUUID().slice(0, 8)}`
    const ownerEmail = `${slug}@owner.test`

    const startTime = performance.now()
    const provisioned = await provisionOnboardingSite(instance, ownerEmail, {
      ...onboardingInput(slug, 'Standard Publishing Publication'),
      featureProfile: 'Standard',
      starterType: 'publication-community',
      starterContent: true,
      publishingDefaults: {
        indexingMode: 'index',
        commentsPolicy: 'open',
        visibility: 'public',
      },
    })
    const durationMs = Math.round(performance.now() - startTime)

    expect(durationMs).toBeLessThan(10_000)
    expect(provisioned.site.id).toBeDefined()
    expect(provisioned.publication.id).toBeDefined()

    const siteSettings = (await instance.findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
    } as never)) as any

    expect(siteSettings.indexingMode).toBe('index')
    expect(siteSettings.seoNoIndex).toBe(false)
    expect(siteSettings.onboarding?.featureProfile).toBe('Standard')
  })

  it('authenticates emergency recovery code, burns it single-use, and rejects replay', async () => {
    const instance = await getPayloadInstance()
    const pool = (instance.db as any).pool
    const config = loadConfig()

    const ownerEmail = `recovery-test-${randomUUID().slice(0, 8)}@owner.test`
    const userRes = await pool.query(
      `INSERT INTO users (email, role) VALUES ($1, 'owner') RETURNING id`,
      [ownerEmail],
    )
    const userId = userRes.rows[0].id

    const recoveryCode = randomBytes(10).toString('hex').toUpperCase()
    const codeHash = createHmac('sha256', config.payloadSecret).update(recoveryCode).digest('hex')

    await pool.query(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [
      userId,
      codeHash,
    ])

    // 1. Valid authentication
    const session = await authenticateWithRecoveryCode(instance, config, {
      email: ownerEmail,
      recoveryCode,
    })
    expect(session.token).toBeDefined()
    expect(session.expirationSeconds).toBeGreaterThan(0)

    // 2. Verify code was marked used
    const codeRow = await pool.query(
      `SELECT used_at FROM recovery_codes WHERE user_id = $1 AND code_hash = $2`,
      [userId, codeHash],
    )
    expect(codeRow.rows[0]?.used_at).not.toBeNull()

    // 3. Replay must fail
    await expect(
      authenticateWithRecoveryCode(instance, config, {
        email: ownerEmail,
        recoveryCode,
      }),
    ).rejects.toThrow('Invalid or already used recovery code.')
  })
})
