import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { ConfigurationError, loadConfig } from '../../src/modules/core/config'

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/renegade_test',
  PAYLOAD_SECRET: 'a-valid-test-value-with-more-than-32-characters',
  APP_URL: 'http://localhost:3000',
}

const production = {
  ...valid,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://renegade:a-unique-production-password@postgres:5432/renegade',
  PAYLOAD_SECRET: 'unique-production-secret-material-that-is-longer-than-forty-eight-characters',
  APP_URL: 'https://cms.example.test',
  PROXY_MODE: 'trusted',
  MEDIA_DIR: path.resolve('media'),
}

describe('loadConfig', () => {
  it('parses the documented development baseline', () => {
    expect(loadConfig(valid)).toMatchObject({
      appUrl: 'http://localhost:3000',
      enableTestRoutes: false,
      logLevel: 'info',
      proxyMode: 'direct',
      secureCookies: false,
      storage: { driver: 'local' },
      schemaVersion: '1.0.0',
      deploymentProfile: 'Standard',
    })
  })

  it('accepts the documented lean deployment profile', () => {
    expect(
      loadConfig({ ...valid, DEPLOYMENT_PROFILE: 'Lean', SCHEMA_VERSION: '1.2.3' }),
    ).toMatchObject({
      deploymentProfile: 'Lean',
      schemaVersion: '1.2.3',
    })
  })

  it('enables secure cookies and exposes actionable non-secret warnings in production', () => {
    expect(loadConfig(production)).toMatchObject({
      proxyMode: 'trusted',
      secureCookies: true,
      warnings: [
        'proxy.forwarded_headers_must_be_overwritten',
        'storage.local_path_requires_persistent_volume',
        'email.disabled',
      ],
    })
  })

  it('reports keys without revealing values', () => {
    const secret = 'too-short'
    expect(() => loadConfig({ ...valid, PAYLOAD_SECRET: secret })).toThrow(ConfigurationError)
    try {
      loadConfig({ ...valid, PAYLOAD_SECRET: secret })
    } catch (error) {
      expect(String(error)).toContain('PAYLOAD_SECRET')
      expect(String(error)).not.toContain(secret)
    }
  })

  it('requires a separate token when smoke routes are enabled', () => {
    expect(() => loadConfig({ ...valid, ENABLE_TEST_ROUTES: 'true' })).toThrow(/SMOKE_TEST_TOKEN/)
  })

  it('rejects test routes, insecure origins, relative media paths and implicit proxy policy in production', () => {
    expect(() =>
      loadConfig({
        ...production,
        APP_URL: 'http://cms.example.test',
        ENABLE_TEST_ROUTES: 'true',
        SMOKE_TEST_TOKEN: 'this-token-is-long-enough-for-tests',
        MEDIA_DIR: './media',
        PROXY_MODE: undefined,
      }),
    ).toThrow(/APP_URL.*ENABLE_TEST_ROUTES.*MEDIA_DIR.*PROXY_MODE/)
  })

  it('rejects documented development credentials and placeholder secrets in production', () => {
    expect(() =>
      loadConfig({
        ...production,
        DATABASE_URL: 'postgresql://renegade:renegade_dev_only@postgres:5432/renegade',
        PAYLOAD_SECRET: 'replace-with-at-least-48-random-characters-in-production',
      }),
    ).toThrow(/DATABASE_URL.*PAYLOAD_SECRET/)
  })

  it('allows development-only credentials only for an explicit loopback E2E runtime', () => {
    expect(
      loadConfig({ ...valid, NODE_ENV: 'production', LOCAL_E2E_TEST_MODE: 'true' }),
    ).toMatchObject({ appUrl: 'http://localhost:3000', secureCookies: false })
    expect(() =>
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        APP_URL: 'https://cms.example.test',
        LOCAL_E2E_TEST_MODE: 'true',
      }),
    ).toThrow(/LOCAL_E2E_TEST_MODE/)
  })

  it('validates SMTP placeholders without logging their values', () => {
    expect(() => loadConfig({ ...valid, EMAIL_MODE: 'smtp' })).toThrow(
      /EMAIL_FROM.*SMTP_HOST.*SMTP_PORT/,
    )
  })
  it('allows unauthenticated SMTP but requires complete credentials when authentication is configured', () => {
    expect(
      loadConfig({
        ...valid,
        EMAIL_MODE: 'smtp',
        EMAIL_FROM: 'mail@example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
      }).email,
    ).toMatchObject({
      mode: 'smtp',
      secure: true,
      connectionTimeoutMs: 10000,
      sendTimeoutMs: 30000,
    })
    expect(() =>
      loadConfig({
        ...valid,
        EMAIL_MODE: 'smtp',
        EMAIL_FROM: 'mail@example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
        SMTP_USERNAME: 'only-user',
      }),
    ).toThrow(/SMTP_PASSWORD/)
  })
  it('rejects unsafe SMTP sender headers', () => {
    expect(() =>
      loadConfig({
        ...valid,
        EMAIL_MODE: 'smtp',
        EMAIL_FROM: 'mail@example.test\r\nBcc: attacker@example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
      }),
    ).toThrow(/EMAIL_FROM/)
  })
})
