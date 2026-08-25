import config from '@payload-config'
import { getPayload } from 'payload'

import { rotateBootstrapToken } from '../modules/operations/installation'
import { loadConfig } from '../modules/core/config'

const payload = await getPayload({ config })
try {
  await rotateBootstrapToken(payload, loadConfig())
} finally {
  await payload.db.destroy?.()
}
