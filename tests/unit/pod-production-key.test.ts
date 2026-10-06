import { afterEach, describe, expect, it, vi } from 'vitest'
import { encryptCredential, decryptCredential } from '../../src/modules/commerce/pod-connection'
afterEach(() => vi.unstubAllEnvs())
describe('production POD credential encryption', () => {
  it('fails closed without a configured key', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RENEGADE_POD_ENCRYPTION_KEY', '')
    vi.stubEnv('RENEGADE_ENCRYPTION_KEY', '')
    expect(() => encryptCredential('private-test-credential')).toThrow(
      'Configure RENEGADE_POD_ENCRYPTION_KEY',
    )
  })
  it('preserves authenticated encryption with a configured key and rejects another key', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const key = 'a'.repeat(64)
    const envelope = encryptCredential('private-test-credential', key)
    expect(decryptCredential(envelope, key)).toBe('private-test-credential')
    expect(() => decryptCredential(envelope, 'b'.repeat(64))).toThrow()
  })
})
