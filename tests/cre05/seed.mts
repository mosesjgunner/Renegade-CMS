import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import sharp from 'sharp'
import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { consumeMagicLink, issueMagicLink } from '../../src/modules/identity/member-identity'
import { sha256 } from '../../src/modules/media/upload-staging'
import { persistReviewedCreatorMedia } from '../../src/modules/media/workflow'

const app = loadConfig()
if (
  !new URL(app.databaseUrl).pathname.endsWith('_release_acceptance') ||
  !process.env.CRE05_BROWSER_FIXTURE
)
  throw new Error('Use a dedicated release acceptance database and a local fixture path.')
const payload = await getPayload({ config })
const access = { overrideAccess: true, depth: 0 } as const
try {
  const site = await payload.create({
    ...access,
    collection: 'sites',
    data: {
      name: 'Edit Proof',
      slug: 'edit-proof',
      lifecycle: 'active',
      visibility: 'public',
      creatorPolicy: {
        enabled: true,
        quotas: {
          bytes: 500_000_000,
          uploadCount: 50,
          concurrentRecordings: 5,
          exportJobs: 8,
          processingMinutes: 10,
        },
      },
    },
  })
  await payload.create({
    ...access,
    collection: 'publications',
    data: {
      site: site.id,
      name: 'Edit Proof',
      slug: 'main',
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
    },
  })
  await payload.updateGlobal({
    ...access,
    slug: 'site-settings',
    data: { siteName: 'Edit Proof', canonicalOrigin: app.appUrl, launchState: 'live' },
  })
  async function principal(handle: string, capabilities: Array<'media.upload' | 'media.edit-own'>) {
    const email = handle + '@example.test'
    const member = await payload.create({
      ...access,
      collection: 'members',
      data: { email, displayName: handle, status: 'active' },
    })
    await payload.create({
      ...access,
      collection: 'profiles',
      data: { member: member.id, displayName: handle, handle },
    })
    await payload.create({
      ...access,
      collection: 'member-site-roles',
      data: {
        site: site.id,
        member: member.id,
        role: 'contributor',
        creatorCapabilities: capabilities,
      },
    })
    const issued = await issueMagicLink(payload as never, email)
    const session = await consumeMagicLink(payload as never, issued.token!)
    return { id: member.id, session: session!.sessionToken, csrf: randomUUID() }
  }
  const owner = await principal('edit-maker', ['media.upload', 'media.edit-own'])
  const other = await principal('edit-outsider', ['media.edit-own'])
  const denied = await principal('edit-denied', [])
  const stillBytes = await sharp({
    create: { width: 320, height: 180, channels: 3, background: '#285b86' },
  })
    .png()
    .toBuffer()
  const stillPath = path.join(
    path.dirname(process.env.CRE05_BROWSER_FIXTURE),
    `cre05-${site.id}.png`,
  )
  await mkdir(path.dirname(stillPath), { recursive: true })
  await writeFile(stillPath, stillBytes)
  const still = await persistReviewedCreatorMedia(
    payload,
    app,
    {
      user: { member: owner.id },
      scope: { kind: 'site', siteId: site.id },
      title: 'Proof graphic',
      originalFilename: 'graphic.png',
    },
    { filename: stillPath, size: stillBytes.length, checksum: sha256(stillBytes) },
    {
      kind: 'image',
      mimeType: 'image/png',
      extension: 'png',
      width: 320,
      height: 180,
      source: 'cre05-fixture',
      private: true,
    },
  )
  await writeFile(
    process.env.CRE05_BROWSER_FIXTURE,
    JSON.stringify({
      site: site.id,
      owner,
      other,
      denied,
      still: still.id,
    }),
    { mode: 0o600 },
  )
} finally {
  await payload.destroy()
}
