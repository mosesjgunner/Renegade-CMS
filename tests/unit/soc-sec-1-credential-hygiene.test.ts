import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  redactSocialAccountRelations,
  toRedactedSocialAccountView,
} from '@/modules/social/account-view'
import { classifyConnectionReference } from '@/modules/social/provider-runtime'
import { logSocialError } from '@/modules/social/security'

/**
 * SOC-SEC-1 pure-helper contracts: the redacted account view, the deep
 * redactor for composite payloads, reference classification for the
 * credential scan, and the central sanitized logging path.
 */

const accountDoc = {
  id: 'acct-1',
  site: { id: 'site-1' },
  network: 'mastodon',
  displayName: 'Mastodon Main',
  externalAccountId: '@main@example.social',
  actorType: 'site',
  capabilityState: 'available',
  capabilities: { postTypes: ['text'] },
  credentialHealth: 'healthy',
  credentialExpiresAt: '2027-01-01T00:00:00.000Z',
  connectionReference: 'enc:aaa:bbb:ccc',
  lastVerifiedAt: '2026-11-01T00:00:00.000Z',
  diagnostics: { mode: 'live', status: 'healthy', lastError: null, scopes: ['read'] },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

describe('SOC-SEC-1 redacted account view', () => {
  it('keeps display/state fields and drops the credential envelope', () => {
    const view = toRedactedSocialAccountView(accountDoc)
    expect(view).toEqual({
      id: 'acct-1',
      site: 'site-1',
      network: 'mastodon',
      displayName: 'Mastodon Main',
      externalAccountId: '@main@example.social',
      actorType: 'site',
      capabilityState: 'available',
      capabilities: { postTypes: ['text'] },
      credentialHealth: 'healthy',
      credentialExpiresAt: '2027-01-01T00:00:00.000Z',
      credentialsConfigured: true,
      lastVerifiedAt: '2026-11-01T00:00:00.000Z',
      diagnostics: { mode: 'live', status: 'healthy', lastError: null },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    })
    expect(JSON.stringify(view)).not.toContain('connectionReference')
    expect(JSON.stringify(view)).not.toContain('enc:')
  })

  it('reports credentialsConfigured=false when no reference is stored', () => {
    const view = toRedactedSocialAccountView({ ...accountDoc, connectionReference: null })
    expect(view.credentialsConfigured).toBe(false)
  })
})

describe('SOC-SEC-1 deep redaction of composite payloads', () => {
  it('replaces account documents populated inside other resources', () => {
    const payload = {
      draft: { id: 'draft-1', title: 'Post' },
      variants: [{ id: 'var-1', account: { ...accountDoc } }],
      queueItems: [{ id: 'q-1', account: { ...accountDoc }, status: 'scheduled' }],
      plain: [{ id: 'x', note: 'no account here' }],
    }
    const redacted = redactSocialAccountRelations(payload) as any
    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain('connectionReference')
    expect(serialized).not.toContain('enc:')
    expect(redacted.variants[0].account.displayName).toBe('Mastodon Main')
    expect(redacted.variants[0].account.credentialsConfigured).toBe(true)
    expect(redacted.queueItems[0].status).toBe('scheduled')
    expect(redacted.plain[0].note).toBe('no account here')
    // The input is not mutated.
    expect((payload.variants[0].account as any).connectionReference).toBe('enc:aaa:bbb:ccc')
  })
})

describe('SOC-SEC-1 connection reference classification', () => {
  it('classifies every stored form', () => {
    expect(classifyConnectionReference(null)).toBe('empty')
    expect(classifyConnectionReference(undefined)).toBe('empty')
    expect(classifyConnectionReference('')).toBe('empty')
    expect(classifyConnectionReference('enc:aaa:bbb:ccc')).toBe('envelope')
    expect(classifyConnectionReference('{"identifier":"op"}')).toBe('plaintext-json')
    expect(classifyConnectionReference('my-handle')).toBe('named-reference')
  })
})

describe('SOC-SEC-1 central social error logging', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redacts credential material from logged errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSocialError(
      'worker-route',
      new Error(
        'Bluesky session failed: {"identifier":"op","appPassword":"hunter2"} Bearer abc123 using enc:aaa:bbb:ccc',
      ),
    )
    expect(spy).toHaveBeenCalledTimes(1)
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).toContain('[social:worker-route]')
    expect(logged).not.toContain('hunter2')
    expect(logged).not.toContain('abc123')
    expect(logged).not.toContain('aaa:bbb:ccc')
    expect(logged).toContain('[REDACTED]')
  })
})
