import config from '../src/payload.config.js'
import { getPayload } from 'payload'
import { mediaStorageKey, publicMedia } from '../src/modules/media/workflow.js'
import { mediaStorage } from '../src/modules/media/storage.js'
import { loadConfig } from '../src/modules/core/config.js'

async function main() {
  process.env.DATABASE_URL = 'postgresql://renegade:renegade_dev_only@localhost:5432/renegade'
  process.env.PAYLOAD_SECRET = '/hPA/thVib6fgIVNPW3+L19ahfNbi0F4w3jI+Fkpx4A+vJYqhpfm9EqFtVKvttHD'
  process.env.MEDIA_DIR = 'C:/Projects/RENEGADE CMS/Renegade-CMS/media'

  const payload = await getPayload({ config })
  const assetId = '8aae2aba-7f6b-4cc3-a5ac-c6352bbd0527'
  
  const raw = await payload.findByID({ collection: 'media-assets', id: assetId, depth: 0, overrideAccess: true })
  console.log('RAW_ASSET:', JSON.stringify(raw, null, 2))

  const pub = await publicMedia(payload, assetId)
  console.log('PUBLIC_MEDIA:', Boolean(pub))

  const key = await mediaStorageKey(payload, raw)
  console.log('STORAGE_KEY:', key)

  const appConfig = loadConfig()
  const storage = mediaStorage(appConfig)
  if (key) {
    const bytes = await storage.get(key)
    console.log('BYTES_FOUND:', Boolean(bytes), bytes ? bytes.length : 0)
  }
}

main().catch(err => {
  console.error('ERROR:', err)
  process.exit(1)
})
