import type { SanitizedConfig } from 'payload'
import { getPayload } from 'payload'

import { rotateBootstrapToken } from '../modules/operations/installation'
import { loadConfig } from '../modules/core/config'

// Payload's `bin` script runner (see the `bin` array in payload.config.ts) imports
// this module and invokes the exported `script` function with the sanitized config.
// The previous top-level implementation ran on import but exported nothing, so the
// runner threw "Could not find "script" function export for script recover-installation"
// after the work had already happened. Matching seed.ts's signature fixes that.
export const script = async (config: SanitizedConfig): Promise<void> => {
  const payload = await getPayload({ config })
  try {
    await rotateBootstrapToken(payload, loadConfig())
  } finally {
    await payload.db.destroy?.()
  }
}
