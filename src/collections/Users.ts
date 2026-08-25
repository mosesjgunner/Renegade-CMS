import type { CollectionConfig } from 'payload'

import type { AppConfig } from '../modules/core/config'
import { createPasskeyAuthStrategy } from '../modules/operations/passkey-auth'

export function createUsersCollection(
  config: Pick<AppConfig, 'payloadSecret' | 'secureCookies'>,
): CollectionConfig {
  return {
    slug: 'users',
    admin: { useAsTitle: 'email' },
    auth: {
      disableLocalStrategy: true,
      strategies: [createPasskeyAuthStrategy(config.payloadSecret)],
      tokenExpiration: 60 * 60 * 8,
      useSessions: false,
      cookies: {
        sameSite: 'Lax',
        secure: config.secureCookies,
      },
    },
    fields: [
      { name: 'email', type: 'email', required: true, unique: true, index: true },
      {
        name: 'role',
        type: 'select',
        required: true,
        defaultValue: 'owner',
        options: ['owner', 'staff'],
      },
    ],
  }
}
