import { cpSync, existsSync } from 'node:fs'
import config from '@payload-config'
import { getPayload } from 'payload'

export default async function globalSetup() {
  if (existsSync('.next/static') && existsSync('.next/standalone')) {
    cpSync('.next/static', '.next/standalone/.next/static', { recursive: true, force: true })
  }
  if (existsSync('public') && existsSync('.next/standalone')) {
    cpSync('public', '.next/standalone/public', { recursive: true, force: true })
  }

  const payload = await getPayload({ config })
  try {
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
    if (!publications.docs[0]) {
      await payload.create({
        collection: 'publications',
        data: {
          site: site.id,
          name: 'Analytics E2E',
          slug: 'analytics-e2e',
          canonicalBasePath: '/',
          status: 'active',
          visibility: 'public',
        },
        overrideAccess: true,
      } as never)
    } else {
      await payload.update({
        collection: 'publications',
        id: publications.docs[0].id,
        data: {
          canonicalBasePath: '/',
          status: 'active',
          visibility: 'public',
        },
        overrideAccess: true,
      } as never)
    }

    const otherPublications = await payload.find({
      collection: 'publications',
      where: { slug: { not_equals: 'analytics-e2e' } },
      overrideAccess: true,
    } as never)
    for (const pub of otherPublications.docs) {
      await payload.update({
        collection: 'publications',
        id: pub.id,
        data: { status: 'draft' },
        overrideAccess: true,
      } as never)
    }

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
  } finally {
    await payload.db.destroy?.()
  }
}
