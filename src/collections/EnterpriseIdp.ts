import type { CollectionConfig } from 'payload'

import { validateIdpIssuer } from '../modules/identity/enterprise-idp'

// Enterprise IdP records are operated through scoped SSO routes and tests.
// Payload's generic REST and admin collection endpoints must not expose IdP
// configuration or enveloped client secrets (same posture as Ai.ts).
const denied = () => false

/**
 * RC3-21 #64 hard boundary: an IdP connection may only ever point at a
 * loopback issuer. Enforced in a beforeValidate hook so EVERY write path —
 * local API included — refuses a non-loopback issuer at save time, not
 * just when a sign-in flow happens to run.
 */
const enforceLoopbackIssuer: NonNullable<
  NonNullable<CollectionConfig['hooks']>['beforeValidate']
>[number] = ({ data }) => {
  if (data && typeof data.issuer === 'string' && data.issuer.length > 0) {
    data.issuer = validateIdpIssuer(data.issuer)
  }
  return data
}

export const EnterpriseIdpConnections: CollectionConfig = {
  slug: 'enterprise-idp-connections',
  admin: { useAsTitle: 'label', group: 'Community', hidden: true },
  access: { create: denied, read: denied, update: denied, delete: denied },
  hooks: { beforeValidate: [enforceLoopbackIssuer] },
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'issuer', type: 'text', required: true },
    { name: 'clientId', type: 'text', required: true },
    { name: 'redirectUri', type: 'text', required: true },
    { name: 'scopes', type: 'json', required: true },
    { name: 'status', type: 'text', required: true, defaultValue: 'active' },
    { name: 'lastTestedAt', type: 'date' },
  ],
}

export const EnterpriseIdpCredentials: CollectionConfig = {
  slug: 'enterprise-idp-credentials',
  admin: { hidden: true },
  access: { create: denied, read: denied, update: denied, delete: denied },
  fields: [
    {
      name: 'connection',
      type: 'relationship',
      relationTo: 'enterprise-idp-connections' as never,
      required: true,
      unique: true,
    },
    { name: 'envelope', type: 'json', required: true },
  ],
}
