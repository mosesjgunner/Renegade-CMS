import type { CollectionConfig } from 'payload'

import type { AppConfig } from '../modules/core/config'
import { createPasskeyAuthStrategy } from '../modules/operations/passkey-auth'

export function createUsersCollection(
  config: Pick<AppConfig, 'payloadSecret' | 'secureCookies'>,
): CollectionConfig {
  return {
    slug: 'users',
    admin: { useAsTitle: 'email', group: 'Settings' },
    access: {
      create: ({ req }) => req.user?.role === 'owner',
      delete: ({ req }) => req.user?.role === 'owner',
      read: ({ req }) => {
        if (req.user?.role === 'owner' || req.user?.role === 'administrator') return true
        if (req.user?.role === 'staff' && req.user.id) return { id: { equals: req.user.id } }
        return false
      },
      update: ({ req }) => req.user?.role === 'owner',
    },
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
        options: ['owner', 'administrator', 'staff'],
        admin: {
          description:
            'Supported admin login roles. Publisher, editor, moderator, and commerce are workflow/member personas, not separate staff authentication roles.',
        },
      },
      {
        name: 'adminSites',
        label: 'Admin site access',
        type: 'relationship',
        relationTo: 'sites',
        hasMany: true,
        admin: {
          description:
            'Sites this staff account can manage. Owner and administrator accounts can manage all sites.',
          condition: (_data, siblingData) => siblingData?.role === 'staff',
        },
        access: {
          create: ({ req }) => req.user?.role === 'owner',
          // Staff collection reads are already restricted to the authenticated
          // user. They must receive their own grants for server-side
          // site-bound route enforcement to work; writes remain owner-only.
          read: ({ req }) => ['owner', 'administrator', 'staff'].includes(String(req.user?.role)),
          update: ({ req }) => req.user?.role === 'owner',
        },
      },
      // This links an enterprise administrator account to the canonical member identity.
      // It intentionally does not create a second authentication system.
      { name: 'member', type: 'relationship', relationTo: 'members', unique: true, index: true },
    ],
  }
}
