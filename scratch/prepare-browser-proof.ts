import fs from 'node:fs'
import path from 'node:path'
import config from '../src/payload.config'
import { getPayload } from 'payload'
import { loadConfig } from '../src/modules/core/config'
import { createPasskeySession } from '../src/modules/operations/passkey-auth'

// 32x32 valid gradient-like test PNG
const TEST_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x20, 0x08, 0x06, 0x00, 0x00, 0x00, 0x73, 0x7a, 0x7a,
  0xf4, 0x00, 0x00, 0x00, 0x27, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc, 0xff, 0xff, 0x3f,
  0x03, 0x03, 0x03, 0x43, 0x30, 0x30, 0x70, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0xff, 0xff, 0x03,
  0x00, 0x0b, 0x50, 0x01, 0x91, 0x58, 0x8e, 0x88, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
])

async function main() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://renegade:renegade_dev_only@localhost:5432/renegade'
  process.env.PAYLOAD_SECRET =
    process.env.PAYLOAD_SECRET || 'unit-test-secret-with-at-least-32-characters'
  process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000'
  process.env.MEDIA_DIR = process.env.MEDIA_DIR || path.resolve('media')

  const payload = await getPayload({ config })

  // 1. Ensure Site exists
  let site = (
    await payload.find({ collection: 'sites', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string }
  if (!site) {
    site = (await payload.create({
      collection: 'sites',
      data: { name: 'Proof Site', slug: 'proof-site', lifecycle: 'active' },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
  }

  // 2. Ensure Admin User exists
  let user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string; email: string }
  if (!user) {
    user = (await payload.create({
      collection: 'users',
      data: {
        email: 'admin@renegadeparty.org',
        role: 'administrator',
        name: 'Admin User',
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string; email: string }
  }

  // 3. Write real PNG asset file to storage
  const mediaDir = path.resolve('media')
  fs.mkdirSync(mediaDir, { recursive: true })
  const storageKey = `proof-sample-${Date.now()}.png`
  const filePath = path.join(mediaDir, storageKey)
  fs.writeFileSync(filePath, TEST_PNG_BYTES)

  // 4. Create or update media-asset record in database
  const mediaAsset = (await payload.create({
    collection: 'media-assets',
    data: {
      site: site.id,
      title: 'Audited Desert Sunset Banner',
      filename: storageKey,
      mimeType: 'image/png',
      fileSize: TEST_PNG_BYTES.length,
      width: 32,
      height: 32,
      url: `/media/${storageKey}`,
      storageDriver: 'local',
      storageKey: storageKey,
      status: 'active',
      altText: 'Desert sunset golden hour test graphic',
    },
    overrideAccess: true,
  } as never)) as unknown as { id: string; title: string; mimeType: string }

  // 5. Create active Passkey Session Token
  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      const db = payload.db as unknown as {
        pool: { query: (sql: string, params: unknown[]) => Promise<unknown> }
      }
      await db.pool.query('INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [
        sessionId,
        user.id,
        expiresAt,
      ])
    },
  )

  const proofContext = {
    token: session.token,
    siteId: site.id,
    assetId: mediaAsset.id,
    assetTitle: mediaAsset.title,
    assetMimeType: mediaAsset.mimeType,
    url: `/media/${mediaAsset.id}`,
    libraryUrl: `/admin/media-library?siteId=${site.id}`,
  }

  fs.writeFileSync(
    path.resolve('scratch/browser-proof-context.json'),
    JSON.stringify(proofContext, null, 2),
    'utf8',
  )

  console.log('PROOF_CONTEXT_CREATED:', JSON.stringify(proofContext, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error('ERROR_PREPARING_PROOF:', err)
  process.exit(1)
})
