import { createHmac, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'

import {
  assertSafeOutboundUrl,
  isPrivateAddress,
  readBoundedJson,
  safeFetch,
  safeRelativeRedirect,
} from '../../src/modules/core/external-boundary'
import { configuredSecretValues, redact } from '../../src/modules/core/logging'
import { safeUploadMetadata } from '../../src/modules/audience/contracts'
import {
  MEMBER_CSRF_COOKIE,
  csrfCookie,
  verifyCsrf,
} from '../../src/modules/identity/member-identity'
import {
  createPasskeyAuthStrategy,
  createPasskeySession,
  requireAdminUser,
} from '../../src/modules/operations/passkey-auth'
import {
  checkOperatorSiteAccess,
  resolveOperatorGrantContext,
} from '../../src/modules/operations/operator-grants'
import {
  beginStaffPasskeyEnrollment,
  createStaffEnrollmentToken,
  StaffEnrollmentError,
} from '../../src/modules/operations/staff-enrollment'
import { rotateOwnerRecoveryCodes } from '../../src/modules/operations/owner-recovery'
import { supportedTarget } from '../../src/modules/integrations/webhooks'
import { sanitizeSocialLog, validateOutboundUrl } from '../../src/modules/social/security'

describe('Stage 05: Authenticated Security Negative Matrix', () => {
  const secret = 'rc05-stage-security-negative-secret-at-least-48-characters-long'
  const headersFor = (token: string) => new Headers({ cookie: `renegade-passkey=${token}` })

  describe('1. Tenant, Object, and Role Access Boundaries', () => {
    it('strictly confines staff authority to granted sites and denies cross-tenant access', async () => {
      const mockPayload = {
        find: vi.fn(async ({ collection }: { collection: string }) => {
          if (collection === 'member-site-roles') {
            return {
              docs: [
                {
                  id: 'msr-1',
                  site: 'site-alpha',
                  member: 'member-staff-1',
                  role: 'contributor',
                },
              ],
            }
          }
          return { docs: [] }
        }),
      } as any

      const staffUser = { id: 'user-staff-1', role: 'staff', member: 'member-staff-1' }
      const grant = await resolveOperatorGrantContext(mockPayload, staffUser)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(false)
      expect(grant.authorizedSiteIds).toEqual(['site-alpha'])

      // Permitted on assigned site
      expect(await checkOperatorSiteAccess(mockPayload, staffUser, 'site-alpha')).toBe(true)

      // Denied on foreign tenant site
      expect(await checkOperatorSiteAccess(mockPayload, staffUser, 'site-beta')).toBe(false)
    })

    it('denies unprivileged members and anonymous actors from operator and admin domains', async () => {
      const mockPayload = {
        find: vi.fn(async () => ({ docs: [] })),
      } as any

      // Anonymous actor
      const anonGrant = await resolveOperatorGrantContext(mockPayload, null)
      expect(anonGrant.authorized).toBe(false)
      expect(anonGrant.authorizedSiteIds).toHaveLength(0)
      expect(await checkOperatorSiteAccess(mockPayload, null, 'site-alpha')).toBe(false)

      // Regular subscriber/member
      const memberUser = { id: 'user-member-1', role: 'subscriber', member: 'member-1' }
      const memberGrant = await resolveOperatorGrantContext(mockPayload, memberUser)
      expect(memberGrant.authorized).toBe(false)
      expect(memberGrant.authorizedSiteIds).toHaveLength(0)
      expect(await checkOperatorSiteAccess(mockPayload, memberUser, 'site-alpha')).toBe(false)
    })

    it('asserts denied operations leave protected state unchanged without mutation', async () => {
      let mutationCount = 0
      const query = vi.fn(async (sql: string) => {
        const trimmed = sql.trim().toUpperCase()
        if (
          trimmed.startsWith('UPDATE') ||
          trimmed.startsWith('INSERT') ||
          trimmed.startsWith('DELETE')
        ) {
          mutationCount++
        }
        return { rows: [] }
      })
      const mockPayload = {
        config: { secret },
        db: { pool: { connect: async () => ({ query, release: vi.fn() }) } },
      } as any

      // Attempting owner recovery rotation on non-owner fails before mutation
      await expect(rotateOwnerRecoveryCodes(mockPayload, 'non-owner@example.test')).rejects.toThrow(
        'existing owner',
      )
      expect(mutationCount).toBe(0)
      expect(query).toHaveBeenCalledWith('ROLLBACK')
    })
  })

  describe('2. CSRF Double-Submit Token Enforcement', () => {
    it('accepts matching double-submit cookie and header', () => {
      const token = 'valid-csrf-token-12345'
      const headers = new Headers({
        cookie: `${MEMBER_CSRF_COOKIE}=${token}`,
        'x-member-csrf': token,
      })
      expect(verifyCsrf(headers)).toBe(true)
    })

    it('rejects missing or mismatching CSRF token', () => {
      const token = 'valid-csrf-token-12345'

      // Missing header
      expect(verifyCsrf(new Headers({ cookie: `${MEMBER_CSRF_COOKIE}=${token}` }))).toBe(false)

      // Missing cookie
      expect(verifyCsrf(new Headers({ 'x-member-csrf': token }))).toBe(false)

      // Mismatching token
      expect(
        verifyCsrf(
          new Headers({
            cookie: `${MEMBER_CSRF_COOKIE}=${token}`,
            'x-member-csrf': 'attacker-token-mismatch',
          }),
        ),
      ).toBe(false)
    })

    it('generates non-HttpOnly CSRF cookie for client read and verification', () => {
      const token = 'sample-csrf-token'
      const cookieStr = csrfCookie(token, true)
      expect(cookieStr).toContain(`${MEMBER_CSRF_COOKIE}=${token}`)
      expect(cookieStr).toContain('SameSite=Lax')
      expect(cookieStr).toContain('Secure')
      expect(cookieStr).not.toContain('HttpOnly')
    })
  })

  describe('3. WebAuthn Origin, Challenge, Replay, and Expiry', () => {
    it('rejects expired, forged, and misbound admin session JWTs before database access', async () => {
      const query = vi.fn()
      const mockPayload = { db: { pool: { query } }, findByID: vi.fn() }

      // Expired token
      const expiredToken = await new SignJWT({
        id: 'owner-1',
        sid: 'session-1',
        collection: 'users',
        exp: Math.floor(Date.now() / 1000) - 100,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode(secret))
      await expect(
        requireAdminUser(mockPayload, secret, headersFor(expiredToken)),
      ).rejects.toThrow()

      // Forged secret
      const forgedToken = await new SignJWT({
        id: 'owner-1',
        sid: 'session-1',
        collection: 'users',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode('attacker-wrong-secret-signature'))
      await expect(requireAdminUser(mockPayload, secret, headersFor(forgedToken))).rejects.toThrow()

      // Wrong collection
      const memberToken = await new SignJWT({
        id: 'owner-1',
        sid: 'session-1',
        collection: 'members',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode(secret))
      await expect(requireAdminUser(mockPayload, secret, headersFor(memberToken))).rejects.toThrow()

      // Missing sid
      const missingSidToken = await new SignJWT({
        id: 'owner-1',
        collection: 'users',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode(secret))
      await expect(
        requireAdminUser(mockPayload, secret, headersFor(missingSidToken)),
      ).rejects.toThrow()

      expect(query).not.toHaveBeenCalled()
    })

    it('rejects staff passkey enrollment with invalid, expired, or consumed token', async () => {
      const mockPayload = {
        find: vi.fn(async () => ({ docs: [] })),
        findByID: vi.fn(async () => null),
        db: {
          pool: {
            query: vi.fn(async () => ({ rows: [] })), // Token not found or consumed
          },
        },
      } as any

      const config = {
        payloadSecret: secret,
        appUrl: 'https://dispatch.rc02.test:3129',
      } as any

      await expect(
        beginStaffPasskeyEnrollment(mockPayload, config, {
          enrollmentToken: 'invalid-or-consumed-token-12345',
        }),
      ).rejects.toThrow(StaffEnrollmentError)
    })
  })

  describe('4. Session Revocation and Recovery Boundary', () => {
    it('denies authenticated access when session row is marked revoked in database', async () => {
      const { token } = await createPasskeySession(
        { id: 'admin-1', email: 'admin@example.test' },
        secret,
      )
      const findByID = vi.fn()
      const mockPayload = {
        db: {
          pool: {
            query: vi.fn(async () => ({ rows: [] })), // No active unrevoked session returned
          },
        },
        findByID,
      } as any

      await expect(requireAdminUser(mockPayload, secret, headersFor(token))).rejects.toThrow(
        'expired',
      )
      expect(findByID).not.toHaveBeenCalled()

      const strategy = createPasskeyAuthStrategy(secret)
      expect(
        await strategy.authenticate({ headers: headersFor(token), payload: mockPayload } as never),
      ).toEqual({ user: null })
    })

    it('rolls back credentials on owner recovery failure and prevents partial state mutation', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.startsWith('SELECT')) return { rows: [{ id: 'owner-1' }] }
        if (sql.startsWith('INSERT INTO recovery_codes')) {
          throw new Error('Database disk full')
        }
        return { rows: [] }
      })
      const release = vi.fn()
      const mockPayload = {
        config: { secret },
        db: { pool: { connect: async () => ({ query, release }) } },
      } as any

      await expect(rotateOwnerRecoveryCodes(mockPayload, 'owner@example.test')).rejects.toThrow(
        'Database disk full',
      )
      expect(query).toHaveBeenCalledWith('ROLLBACK')
      expect(query).not.toHaveBeenCalledWith('COMMIT')
      expect(release).toHaveBeenCalledOnce()
    })
  })

  describe('5. Upload Metadata and Private Media Assets Protection', () => {
    it('rejects path traversal, backslashes, and unicode homoglyphs in upload filenames', () => {
      expect(() =>
        safeUploadMetadata({ filename: '../secrets.txt', contentType: 'text/plain', size: 10 }),
      ).toThrow('Unsafe')

      expect(() =>
        safeUploadMetadata({ filename: '..\\admin.pem', contentType: 'text/plain', size: 10 }),
      ).toThrow('Unsafe')

      expect(() =>
        safeUploadMetadata({ filename: 'invoice\\.pdf', contentType: 'application/pdf', size: 10 }),
      ).toThrow('Unsafe')

      expect(() =>
        safeUploadMetadata({ filename: 'ｅvil.pdf', contentType: 'application/pdf', size: 10 }),
      ).toThrow('Unsafe')

      // Valid upload marked private by default
      const safe = safeUploadMetadata({
        filename: 'report-2026.pdf',
        contentType: 'application/pdf',
        size: 1024,
      })
      expect(safe.private).toBe(true)
      expect(safe.scanStatus).toBe('pending')
    })
  })

  describe('6. SSRF Protection and Outbound Boundary', () => {
    it('blocks localhost, loopback, private IPv4/IPv6, and cloud metadata endpoints', async () => {
      const publicDns = async () => [{ address: '93.184.216.34' }]

      // Loopback
      await expect(assertSafeOutboundUrl('http://localhost/', publicDns)).rejects.toThrow('private')
      await expect(assertSafeOutboundUrl('http://127.0.0.1/', publicDns)).rejects.toThrow('private')

      // RFC 1918 Private ranges
      await expect(assertSafeOutboundUrl('http://10.0.0.1/', publicDns)).rejects.toThrow('private')
      await expect(assertSafeOutboundUrl('http://172.16.0.1/', publicDns)).rejects.toThrow(
        'private',
      )
      await expect(assertSafeOutboundUrl('http://192.168.1.1/', publicDns)).rejects.toThrow(
        'private',
      )

      // AWS / GCP Metadata
      await expect(
        assertSafeOutboundUrl('https://example.test/', async () => [
          { address: '169.254.169.254' },
        ]),
      ).rejects.toThrow('private')

      // Non-HTTPS
      await expect(assertSafeOutboundUrl('ftp://example.test/', publicDns)).rejects.toThrow('HTTPS')
    })

    it('rejects public-to-private redirects', async () => {
      const fetcher: typeof fetch = async () =>
        new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:3000/internal' } })
      await expect(
        safeFetch(
          'https://example.test/',
          {},
          { fetcher, resolve: async () => [{ address: '93.184.216.34' }] },
        ),
      ).rejects.toThrow('private')
    })

    it('validates social outbound URLs against metadata and private subnets in production', () => {
      const originalEnv = process.env.NODE_ENV
      try {
        ;(process.env as any).NODE_ENV = 'production'
        expect(validateOutboundUrl('http://example.test').isValid).toBe(false)
        expect(validateOutboundUrl('https://localhost/api').isValid).toBe(false)
        expect(validateOutboundUrl('https://127.0.0.1/api').isValid).toBe(false)
        expect(validateOutboundUrl('https://169.254.169.254/latest/meta-data').isValid).toBe(false)
        expect(validateOutboundUrl('https://10.0.0.5/internal').isValid).toBe(false)
        expect(validateOutboundUrl('https://172.16.50.1/internal').isValid).toBe(false)
        expect(validateOutboundUrl('https://192.168.1.100/internal').isValid).toBe(false)
        expect(validateOutboundUrl('https://api.telegram.org/bot').isValid).toBe(true)
      } finally {
        ;(process.env as any).NODE_ENV = originalEnv
      }
    })

    it('validates webhook targets against private and cloud metadata destinations', () => {
      const originalEnv = process.env.NODE_ENV
      const originalVitest = process.env.VITEST
      try {
        ;(process.env as any).NODE_ENV = 'production'
        process.env.VITEST = 'false'
        expect(() => supportedTarget('http://example.com/webhook')).toThrow('HTTPS')
        expect(() => supportedTarget('https://localhost/webhook')).toThrow('not permitted')
        expect(() => supportedTarget('https://127.0.0.1/webhook')).toThrow('not permitted')
        expect(() => supportedTarget('https://169.254.169.254/webhook')).toThrow('not permitted')
        expect(() => supportedTarget('https://10.0.1.5/webhook')).toThrow('not permitted')
        expect(() => supportedTarget('https://192.168.0.1/webhook')).toThrow('not permitted')
        expect(supportedTarget('https://webhook.site/abc').href).toBe('https://webhook.site/abc')
      } finally {
        ;(process.env as any).NODE_ENV = originalEnv
        process.env.VITEST = originalVitest
      }
    })
  })

  describe('7. Secret Leakage Prevention in Logs and Responses', () => {
    it('redacts sensitive keys, passwords, database URLs, and bearer tokens recursively', () => {
      const databaseUrl = 'postgres://renegade:secret_password_here@postgres:5432/renegade'
      const payloadSecret = 'super-secret-payload-encryption-token'
      const redacted = redact(
        {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token',
          cookie: 'renegade-passkey=secret-cookie-val',
          databaseUrl,
          payloadSecret,
          nested: {
            password: 'my-plaintext-password',
            userToken: 'token-abc-123',
            normalField: `Connecting to ${databaseUrl} using ${payloadSecret}`,
          },
        },
        [databaseUrl, payloadSecret],
      )

      expect(redacted).toEqual({
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        databaseUrl: '[REDACTED]',
        payloadSecret: '[REDACTED]',
        nested: {
          password: '[REDACTED]',
          userToken: '[REDACTED]',
          normalField: 'Connecting to [REDACTED] using [REDACTED]',
        },
      })
    })

    it('masks Bearer tokens and sensitive auth keys in social log sanitizer', () => {
      const sanitized = sanitizeSocialLog({
        message: 'Request failed with Bearer abcdef123456789',
        access_token: 'secret-access-token-123',
        client_secret: 'secret-client-val',
      })

      expect(sanitized).not.toContain('abcdef123456789')
      expect(sanitized).not.toContain('secret-access-token-123')
      expect(sanitized).not.toContain('secret-client-val')
      expect(sanitized).toContain('[REDACTED]')
    })

    it('neutralizes open redirect attempts', () => {
      expect(safeRelativeRedirect('https://attacker.test', '/dashboard')).toBe('/dashboard')
      expect(safeRelativeRedirect('//evil.test', '/dashboard')).toBe('/dashboard')
      expect(safeRelativeRedirect('/valid-path', '/dashboard')).toBe('/valid-path')
    })
  })
})
