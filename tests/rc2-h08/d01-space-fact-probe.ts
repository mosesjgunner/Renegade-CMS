// RC2-DEBT-01 S0/S4 probe — audience 'space' segment fact (seam a).
// Ensures the seed world's space-owning member has a confirmed subscriber
// on Site A, builds a segment whose only predicate is communityFact=space,
// and reports whether that subscriber is an eligible recipient. Run before
// and after the profile=space merge; the verdict must not change.
// Run: with-env b01-env npx tsx tests/rc2-h08/d01-space-fact-probe.ts
import { readFileSync } from 'node:fs'

import config from '../../src/payload.config'
import { getPayload } from 'payload'

import { evaluateSegmentRecipients } from '../../src/modules/audience/service'
import { audienceDigest } from '../../src/modules/audience/contracts'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const siteA = world.siteA.siteId as string

const payload = await getPayload({ config })

// The member who owns the Site A space in the seed world.
const spaces = await payload.find({
  collection: 'spaces',
  where: { site: { equals: siteA } },
  limit: 1,
  depth: 1,
  overrideAccess: true,
})
const space = spaces.docs[0] as unknown as Record<string, unknown> | undefined
if (!space) throw new Error('no space on site A in the seed world')
const profile = space.profile as Record<string, unknown> | undefined
const memberId = String(
  (typeof space.member === 'object' && space.member
    ? (space.member as { id: string }).id
    : space.member) ??
    (profile && typeof profile.member === 'object' && profile.member
      ? (profile.member as { id: string }).id
      : profile?.member) ??
    '',
)
if (!memberId) throw new Error('could not resolve the space owner member id')
console.log('space owner member:', memberId)

// A confirmed subscriber for that member on Site A.
const email = 'd01-space-fact@example.test'
const existing = await payload.find({
  collection: 'subscribers',
  where: { and: [{ site: { equals: siteA } }, { email: { equals: email } }] },
  limit: 1,
  overrideAccess: true,
})
if (!existing.docs.length) {
  await payload.create({
    collection: 'subscribers',
    data: {
      site: siteA,
      email,
      emailHash: audienceDigest(email),
      member: memberId,
      status: 'active',
      verifiedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
  })
  console.log('subscriber created for the space owner')
}

// A segment whose only predicate is the space fact.
const segName = 'D01 space fact probe'
const existingSeg = await payload.find({
  collection: 'audience-segments',
  where: { and: [{ site: { equals: siteA } }, { name: { equals: segName } }] },
  limit: 1,
  overrideAccess: true,
})
const segment =
  existingSeg.docs[0] ??
  (await payload.create({
    collection: 'audience-segments',
    data: {
      site: siteA,
      name: segName,
      version: 'd01-v1',
      status: 'active',
      definition: {
        all: [{ predicate: { field: 'communityFact', op: 'is', value: 'space' } }],
      },
    } as never,
    overrideAccess: true,
  }))

const result = (await evaluateSegmentRecipients(payload as never, {
  siteId: siteA,
  segmentId: String(segment.id),
})) as { eligibleRecipients: Array<{ email: string }> }
const included = result.eligibleRecipients.some((r) => r.email === email)
console.log(
  JSON.stringify({ spaceFactIncludesOwner: included, eligible: result.eligibleRecipients.length }),
)
process.exit(included ? 0 : 1)
