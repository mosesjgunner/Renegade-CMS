/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { issueMagicLink } from '../../src/modules/identity/member-identity'

/**
 * RC2-E-01 mailbox stand-in (test boundary, stated plainly): in the
 * development-capture email profile the mailbox is a process-local sink
 * with no readable surface, and sign-in tokens are never returned by the
 * public API outside test mode. The journey therefore obtains tokens by
 * calling the same production issuing function the HTTP route calls;
 * everything after issuance (completion, cookies, permissions) runs over
 * real HTTP/browser paths.
 *
 * Env: E02_EMAILS (comma-separated), E02_OUT (JSON output path),
 * E02_SURFACE_EMAIL (optional: verify the row created by the journey's
 * real HTTP request — hashed, unconsumed, ~15-minute expiry).
 */
describe('RC2-E-02 token issuance', () => {
  it('issues tokens and verifies the HTTP-issued row', async () => {
    const payload: Payload = await getPayload({ config })
    const out: Record<string, unknown> = {}

    const surface = process.env.E02_SURFACE_EMAIL
    if (surface) {
      const rows = await (payload as any).find({
        collection: 'identity-tokens',
        where: {
          and: [{ purpose: { equals: 'magic-link-sign-in' } }],
        },
        limit: 50,
        depth: 0,
        overrideAccess: true,
      })
      const { createHash } = await import('node:crypto')
      const emailHash = createHash('sha256')
        .update(surface.trim().toLowerCase())
        .digest('base64url')
      const row = rows.docs.find((d: any) => String(d.emailHash) === emailHash)
      out.surfaceRow = row
        ? {
            found: true,
            hasTokenHash: typeof row.tokenHash === 'string' && row.tokenHash.length >= 32,
            hasPlaintextTokenField: 'token' in row,
            consumed: Boolean(row.consumedAt),
            ttlMinutes:
              (new Date(String(row.expiresAt)).getTime() -
                new Date(String(row.createdAt)).getTime()) /
              60000,
          }
        : { found: false }
    }

    const emails = (process.env.E02_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    const tokens: Record<string, string> = {}
    for (const email of emails) {
      const result = await issueMagicLink(payload as any, email)
      expect(result.token, `token issued for ${email}`).toBeTruthy()
      tokens[email] = String(result.token)
    }
    out.tokens = tokens
    writeFileSync(process.env.E02_OUT ?? '/tmp/e02-tokens.json', JSON.stringify(out, null, 2))
    expect(Object.keys(tokens).length).toBe(emails.length)
  }, 120_000)
})
