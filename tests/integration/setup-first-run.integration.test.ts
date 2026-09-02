/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  provisionOnboardingSite,
  type OnboardingInput,
} from '../../src/modules/operations/onboarding'

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

function onboardingInput(slug: string, name: string): OnboardingInput {
  return {
    name,
    slug,
    description: 'First-run installer regression coverage.',
    primaryUrl: 'https://example.test',
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
})
