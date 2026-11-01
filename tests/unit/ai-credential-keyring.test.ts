import { describe, expect, it } from 'vitest'
import {
  credentialCipher,
  credentialKeyring,
  rotateCredentialEnvelope,
} from '../../src/modules/ai/connections'
import { EncryptedCredentialBoundary } from '../../src/modules/extensions/connection-runtime'

const KEY_V1 = Buffer.alloc(32, 7).toString('base64url')
const KEY_V2 = Buffer.alloc(32, 9).toString('base64url')
const KEY_UNKNOWN = Buffer.alloc(32, 3).toString('base64url')

describe('AI credential keyring', () => {
  it('defaults to the legacy single v1 key from AI_CREDENTIAL_KEY_BASE64URL', () => {
    const keyring = credentialKeyring({ AI_CREDENTIAL_KEY_BASE64URL: KEY_V1 })
    expect(keyring.activeKeyId).toBe('v1')
    expect(Object.keys(keyring.keys)).toEqual(['v1'])
  })

  it('fails closed with an actionable error when no key is configured', () => {
    expect(() => credentialKeyring({})).toThrow('credential encryption is not configured')
    expect(() => credentialKeyring({ AI_CREDENTIAL_KEY_BASE64URL: 'too-short' })).toThrow(
      'credential encryption is not configured',
    )
    expect(() =>
      credentialKeyring({
        AI_CREDENTIAL_KEY_BASE64URL: KEY_V1,
        AI_CREDENTIAL_ACTIVE_KEY_ID: 'v9',
      }),
    ).toThrow('credential encryption is not configured')
  })

  it('rejects a malformed keyring JSON with an actionable error', () => {
    expect(() =>
      credentialKeyring({
        AI_CREDENTIAL_KEY_BASE64URL: KEY_V1,
        AI_CREDENTIAL_KEYRING_JSON: '{not json',
      }),
    ).toThrow('keyring is invalid')
    expect(() =>
      credentialKeyring({
        AI_CREDENTIAL_KEY_BASE64URL: KEY_V1,
        AI_CREDENTIAL_KEYRING_JSON: JSON.stringify({ v2: 'short' }),
      }),
    ).toThrow('must be a 32-byte base64url key')
  })

  it('keeps envelopes written by the legacy v1-only cipher decryptable', () => {
    const legacy = new EncryptedCredentialBoundary({
      activeKeyId: 'v1',
      keys: { v1: KEY_V1 },
    })
    const envelope = legacy.encrypt({ apiKey: 'sk-legacy-secret' })

    const keyring = credentialKeyring({
      AI_CREDENTIAL_KEY_BASE64URL: KEY_V1,
      AI_CREDENTIAL_KEYRING_JSON: JSON.stringify({ v2: KEY_V2 }),
      AI_CREDENTIAL_ACTIVE_KEY_ID: 'v2',
    })
    const cipher = new EncryptedCredentialBoundary(keyring)
    expect(cipher.decrypt(envelope).apiKey).toBe('sk-legacy-secret')
    // New envelopes are written under the new active key.
    expect(cipher.encrypt({ apiKey: 'x' }).keyId).toBe('v2')
  })
})

describe('AI credential envelope rotation', () => {
  const keyring = credentialKeyring({
    AI_CREDENTIAL_KEY_BASE64URL: KEY_V1,
    AI_CREDENTIAL_KEYRING_JSON: JSON.stringify({ v2: KEY_V2 }),
    AI_CREDENTIAL_ACTIVE_KEY_ID: 'v2',
  })

  it('re-encrypts a v1 envelope onto the active key without changing the secret', () => {
    const legacy = new EncryptedCredentialBoundary({
      activeKeyId: 'v1',
      keys: { v1: KEY_V1 },
    })
    const envelope = legacy.encrypt({ apiKey: 'sk-rotate-me' })

    const result = rotateCredentialEnvelope(envelope, keyring)
    expect(result.rotated).toBe(true)
    expect(result.envelope.keyId).toBe('v2')
    expect(result.envelope.ciphertext).not.toBe(envelope.ciphertext)
    expect(new EncryptedCredentialBoundary(keyring).decrypt(result.envelope).apiKey).toBe(
      'sk-rotate-me',
    )

    // Idempotent: a second pass is a no-op.
    const again = rotateCredentialEnvelope(result.envelope, keyring)
    expect(again.rotated).toBe(false)
    expect(again.envelope).toBe(result.envelope)
  })

  it('fails closed for an envelope whose key is no longer in the keyring', () => {
    const stranger = new EncryptedCredentialBoundary({
      activeKeyId: 'v9',
      keys: { v9: KEY_UNKNOWN },
    })
    const envelope = stranger.encrypt({ apiKey: 'sk-orphaned' })
    expect(() => rotateCredentialEnvelope(envelope, keyring)).toThrow()
  })

  it('credentialCipher honors the keyring environment end to end', () => {
    const previous = {
      AI_CREDENTIAL_KEY_BASE64URL: process.env.AI_CREDENTIAL_KEY_BASE64URL,
      AI_CREDENTIAL_KEYRING_JSON: process.env.AI_CREDENTIAL_KEYRING_JSON,
      AI_CREDENTIAL_ACTIVE_KEY_ID: process.env.AI_CREDENTIAL_ACTIVE_KEY_ID,
    }
    try {
      process.env.AI_CREDENTIAL_KEY_BASE64URL = KEY_V1
      process.env.AI_CREDENTIAL_KEYRING_JSON = JSON.stringify({ v2: KEY_V2 })
      process.env.AI_CREDENTIAL_ACTIVE_KEY_ID = 'v2'
      const envelope = credentialCipher().encrypt({ apiKey: 'sk-env' })
      expect(envelope.keyId).toBe('v2')
      expect(credentialCipher().decrypt(envelope).apiKey).toBe('sk-env')
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
