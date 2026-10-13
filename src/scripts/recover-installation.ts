import type { SanitizedConfig } from 'payload'
import { getPayload } from 'payload'

import { rotateBootstrapToken } from '../modules/operations/installation'
import { loadConfig } from '../modules/core/config'
import { rotateOwnerRecoveryCodes } from '../modules/operations/owner-recovery'

// Payload's `bin` script runner (see the `bin` array in payload.config.ts) imports
// this module and invokes the exported `script` function with the sanitized config.
// The previous top-level implementation ran on import but exported nothing, so the
// runner threw "Could not find "script" function export for script recover-installation"
// after the work had already happened. Matching seed.ts's signature fixes that.
export const script = async (config: SanitizedConfig): Promise<void> => {
  const payload = await getPayload({ config })
  try {
    const emailAt = process.argv.indexOf('--owner-email')
    if (emailAt !== -1) {
      const email = process.argv[emailAt + 1]
      if (
        !email ||
        email.startsWith('--') ||
        !process.argv.includes('--confirm-rotate-owner-codes')
      )
        throw new Error(
          'Local owner recovery requires --owner-email EMAIL --confirm-rotate-owner-codes. It invalidates existing recovery codes and revokes owner sessions.',
        )
      const codes = await rotateOwnerRecoveryCodes(payload, email)
      console.log('Owner recovery codes rotated. Store these offline; each can be used once:')
      for (const code of codes) console.log(code)
      return
    }
    await rotateBootstrapToken(payload, loadConfig())
  } finally {
    await payload.db.destroy?.()
  }
}

if (process.argv[1] && /recover-installation(\.[cm]?[jt]s)?$/i.test(process.argv[1])) {
  const { default: config } = await import('../payload.config')
  await script(config as any)
  process.exit(0)
}
