import type { CollectionConfig } from 'payload'

import type { AppConfig } from '../modules/core/config'
import { createPasskeyAuthStrategy } from '../modules/operations/passkey-auth'

import { createStaffEnrollmentToken } from '../modules/operations/staff-enrollment'
import { loadConfig } from '../modules/core/config'

export function createUsersCollection(
  config: Pick<AppConfig, 'payloadSecret' | 'secureCookies'>,
): CollectionConfig {
  return {
    slug: 'users',
    admin: { useAsTitle: 'email', group: 'Settings' },
    access: {
      create: ({ req }) => req.user?.role === 'owner',
      delete: ({ req }) => req.user?.role === 'owner',
      read: ({ req }) => ['owner', 'administrator', 'staff'].includes(String(req.user?.role)),
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
    hooks: {
      beforeDelete: [
        async ({ id, req }) => {
          try {
            const pool = (
              req.payload.db as {
                pool?: { query: (q: string, v?: unknown[]) => Promise<unknown> }
              }
            ).pool
            if (pool && id) {
              await pool.query(
                `UPDATE identity_tokens SET consumed_at = now(), updated_at = now()
                 WHERE purpose = 'passkey-registration' AND (metadata->>'userId') = $1 AND consumed_at IS NULL`,
                [id],
              )
              await pool.query(
                `UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
                [id],
              )
            }
          } catch {
            // Best-effort cleanup
          }
        },
      ],
      afterChange: [
        async ({ doc, req, operation }) => {
          if (operation === 'create' && doc?.id && doc?.email) {
            try {
              const existingMembers = await req.payload.find({
                collection: 'members',
                where: { email: { equals: doc.email } },
                depth: 0,
                limit: 1,
                overrideAccess: true,
              })
              let memberId = existingMembers.docs[0]?.id
              if (!memberId) {
                const created = await req.payload.create({
                  collection: 'members',
                  data: {
                    email: doc.email,
                    displayName: doc.email.split('@')[0],
                    status: 'active',
                  },
                  overrideAccess: true,
                })
                memberId = created.id
              }
              if (!doc.member) {
                await req.payload.update({
                  collection: 'users',
                  id: doc.id,
                  data: { member: memberId },
                  overrideAccess: true,
                })
              }
              const explicitSiteId =
                req.context?.siteId ||
                (doc as Record<string, unknown>).site ||
                (doc as Record<string, unknown>).siteId
              const sites = await req.payload.find({
                collection: 'sites',
                depth: 0,
                limit: 10,
                overrideAccess: true,
              })
              const targetSites = explicitSiteId
                ? sites.docs.filter((s) => String(s.id) === String(explicitSiteId))
                : req.context?.allSites
                  ? sites.docs
                  : sites.docs.length === 1
                    ? sites.docs
                    : []

              for (const site of targetSites) {
                const existingRoles = await req.payload.find({
                  collection: 'member-site-roles',
                  where: {
                    and: [{ site: { equals: site.id } }, { member: { equals: memberId } }],
                  },
                  depth: 0,
                  limit: 1,
                  overrideAccess: true,
                })
                if (!existingRoles.docs.length) {
                  await req.payload.create({
                    collection: 'member-site-roles',
                    data: {
                      site: site.id,
                      member: memberId,
                      role: doc.role === 'staff' ? 'contributor' : 'community-manager',
                      grantedByUserId: req.user?.id,
                    },
                    overrideAccess: true,
                  })
                }
              }

              if (doc.role === 'staff' || doc.role === 'administrator') {
                try {
                  const enrollment = await createStaffEnrollmentToken(
                    req.payload,
                    loadConfig(),
                    {
                      email: doc.email,
                      role: doc.role,
                      invitedByUserId: req.user?.id,
                    },
                  )
                  if (req.context) {
                    req.context.enrollmentToken = enrollment.enrollmentToken
                    req.context.enrollmentUrl = enrollment.enrollmentUrl
                  }
                  doc.enrollmentToken = enrollment.enrollmentToken
                  doc.enrollmentUrl = enrollment.enrollmentUrl
                } catch {
                  // Non-blocking staff enrollment token creation
                }
              }
            } catch {
              // Best-effort non-blocking member linkage
            }
          }
          return doc
        },
      ],
    },
    fields: [
      { name: 'email', type: 'email', required: true, unique: true, index: true },
      {
        name: 'role',
        type: 'select',
        required: true,
        defaultValue: 'owner',
        options: ['owner', 'administrator', 'staff'],
      },
      // This links an enterprise administrator account to the canonical member identity.
      // It intentionally does not create a second authentication system.
      { name: 'member', type: 'relationship', relationTo: 'members', unique: true, index: true },
    ],
  }
}
