import config from '@payload-config'
import { getPayload } from 'payload'

export default async function globalSetup() {
  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'analytics-e2e' } },
    limit: 1,
    overrideAccess: true,
  } as never)
  const site =
    found.docs[0] ??
    (await payload.create({
      collection: 'sites',
      data: { name: 'Analytics E2E', slug: 'analytics-e2e', lifecycle: 'active' },
      overrideAccess: true,
    } as never))
  const publications = await payload.find({
    collection: 'publications',
    where: { and: [{ site: { equals: site.id } }, { slug: { equals: 'analytics-e2e' } }] },
    limit: 1,
    overrideAccess: true,
  } as never)
  if (!publications.docs[0])
    await payload.create({
      collection: 'publications',
      data: {
        site: site.id,
        name: 'Analytics E2E',
        slug: 'analytics-e2e',
        canonicalBasePath: '/blogs/',
        status: 'active',
        visibility: 'public',
      },
      overrideAccess: true,
    } as never)
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      privacy: {
        analyticsEnabled: true,
        consentVersion: 'e2e-v1',
        respectGlobalPrivacyControl: true,
        respectDoNotTrack: true,
        rawEventRetentionDays: 90,
        rollupRetentionDays: 730,
      },
    },
    overrideAccess: true,
  } as never)
}
