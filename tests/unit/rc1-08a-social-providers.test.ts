import { describe, it, expect } from 'vitest'
import {
  ADAPTER_REGISTRY,
  getSocialAdapter,
} from '@/modules/social/worker'
import {
  getProviderCapabilityTruth,
  socialProviderFor,
  credentialsForSocialAccount,
} from '@/modules/social/provider-runtime'
import {
  encryptSecret,
  decryptSecret,
  sanitizeSocialLog,
  validateOutboundUrl,
} from '@/modules/social/security'

describe('RC1 08A - Provider Setup & Capability Truth', () => {
  describe('Provider Adapter Registry & Capability Truth', () => {
    it('accurately lists first-class adapters with truth modes', () => {
      const bluesky = getSocialAdapter('bluesky')
      expect(bluesky.network).toBe('bluesky')
      expect(bluesky.capabilities.textLimit).toBe(300)
      expect(bluesky.capabilities.media.maxAttachments).toBe(4)
      expect(bluesky.capabilities.authentication.modes).toContain('app-password')

      const mastodon = getSocialAdapter('mastodon')
      expect(mastodon.network).toBe('mastodon')
      expect(mastodon.capabilities.textLimit).toBe(500)
      expect(mastodon.capabilities.media.images).toBe(true)

      const discord = getSocialAdapter('discord')
      expect(discord.network).toBe('discord')
      expect(discord.capabilities.textLimit).toBe(2000)

      const manual = getSocialAdapter('manual')
      expect(manual.mode).toBe('manual-handoff')
      expect(manual.capabilities.media.images).toBe(false)
    })

    it('distinguishes local-harness from remote-sandbox and live network in capability truth', () => {
      const harnessTruth = getProviderCapabilityTruth('bluesky', 'local-harness')
      expect(harnessTruth.network).toBe('bluesky')
      expect(harnessTruth.mode).toBe('local-harness')
      expect(harnessTruth.capabilities.textLimit).toBe(300)

      const sandboxTruth = getProviderCapabilityTruth('bluesky', 'remote-sandbox')
      expect(sandboxTruth.mode).toBe('remote-sandbox')

      const liveTruth = getProviderCapabilityTruth('bluesky', 'live')
      expect(liveTruth.mode).toBe('live')

      const manualTruth = getProviderCapabilityTruth('manual')
      expect(manualTruth.mode).toBe('manual-handoff')
    })
  })

  describe('Secret Redaction & Security', () => {
    it('encrypts and decrypts secret credentials cleanly', () => {
      const plaintext = JSON.stringify({
        identifier: 'alice.bsky.social',
        appPassword: 'secret-app-password-xyz',
      })
      const encrypted = encryptSecret(plaintext)
      expect(encrypted).not.toContain('secret-app-password-xyz')
      expect(encrypted.split(':')).toHaveLength(3) // iv:tag:ciphertext

      const decrypted = decryptSecret(encrypted)
      expect(decrypted).toBe(plaintext)
      const parsed = JSON.parse(decrypted)
      expect(parsed.identifier).toBe('alice.bsky.social')
      expect(parsed.appPassword).toBe('secret-app-password-xyz')
    })

    it('resolves encrypted connectionReference in credentialsForSocialAccount', () => {
      const creds = {
        identifier: 'operator.test',
        appPassword: 'test-password-123',
        service: 'http://127.0.0.1:3130',
      }
      const encRef = `enc:${encryptSecret(JSON.stringify(creds))}`
      const resolved = credentialsForSocialAccount(encRef)
      expect(resolved).toEqual(creds)
    })

    it('sanitizes logs to prevent secret and token leakage', () => {
      const logSample = {
        message: 'Bluesky session created',
        appPassword: 'super-sensitive-password',
        authorization: 'Bearer jwt.access.token.here',
        accessToken: 'secret-token-value',
      }
      const sanitized = sanitizeSocialLog(logSample)
      expect(sanitized).not.toContain('super-sensitive-password')
      expect(sanitized).not.toContain('jwt.access.token.here')
      expect(sanitized).not.toContain('secret-token-value')
      expect(sanitized).toContain('[REDACTED]')
    })

    it('validates outbound URLs and blocks SSRF while allowing http loopback in dev/test', () => {
      // Production blocks loopback
      const blocked = validateOutboundUrl('http://127.0.0.1:3130')
      expect(blocked.isValid).toBe(false)

      // Dev option permits test harness on loopback
      const allowedDev = validateOutboundUrl('http://127.0.0.1:3130', { allowHttpInDev: true })
      expect(allowedDev.isValid).toBe(true)

      // Cloud metadata is strictly forbidden even in dev
      const metadata = validateOutboundUrl('http://169.254.169.254/latest/meta-data', { allowHttpInDev: true })
      expect(metadata.isValid).toBe(false)
    })
  })
})
