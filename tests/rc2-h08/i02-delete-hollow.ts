// RC2-I-02 proof prep: delete the seed world's hollow media-asset
// record (its bytes were never persisted by the in-process fixture;
// a real server upload replaced it, as in the H-08 / I-01 runs).
import { getPayload } from 'payload'

import config from '../../src/payload.config'

const id = process.env.I02_ASSET_ID ?? ''
if (!id) throw new Error('I02_ASSET_ID required')
const payload = await getPayload({ config })
await payload.delete({ collection: 'media-assets', id, overrideAccess: true })
console.log('deleted hollow asset', id)
await payload.db.destroy?.()
process.exit(0)
