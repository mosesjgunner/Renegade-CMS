import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/modules/core/config'
import { runtimeProviderInventory } from '../../src/modules/extensions/runtime-provider-inventory'

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost/renegade',
  PAYLOAD_SECRET: 'x'.repeat(48),
  APP_URL: 'http://localhost:3000',
}

const configFor = (extra: Record<string, string | undefined> = {}) =>
  loadConfig({ ...baseEnv, ...extra })

describe('runtime provider inventory', () => {
  it('reports absent providers as unavailable and names credential sources without values', () => {
    const rows = runtimeProviderInventory(configFor(), {})
    expect(rows.slice(0, 6).map((row) => row.id)).toEqual([
      'runtime:email',
      'runtime:telecom',
      'runtime:storage',
      'runtime:federation',
      'runtime:stripe-test',
      'runtime:video-external',
    ])
    expect(rows.find((row) => row.id === 'runtime:email')).toMatchObject({
      state: 'unavailable',
      credentialSource: 'No SMTP credential configured',
    })
    expect(rows.find((row) => row.id === 'unconfigured:social:bluesky')).toMatchObject({
      state: 'unavailable',
      manageHref: '/admin/social',
    })
    expect(rows.find((row) => row.id === 'unconfigured:ai.openai-compatible')?.manageHref).toBe(
      '/admin/ai',
    )
    expect(rows.some((row) => row.id === 'unconfigured:printful')).toBe(true)
  })

  it('marks configured SMTP and Twilio without exposing secret values or claiming a test', () => {
    const secret = 'test-secret-that-must-not-appear'
    const config = configFor({
      EMAIL_MODE: 'smtp',
      EMAIL_FROM: 'ops@example.test',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_USERNAME: 'operator',
      SMTP_PASSWORD: secret,
    })
    const rows = runtimeProviderInventory(config, {
      TELECOM_MODE: 'real',
      TWILIO_ACCOUNT_SID: 'AC-not-a-secret',
      TWILIO_AUTH_TOKEN: secret,
    })
    expect(rows.find((row) => row.id === 'runtime:email')?.state).toBe('configured')
    expect(rows.find((row) => row.id === 'runtime:telecom')).toMatchObject({
      state: 'configured',
      safeTestResult: 'Not tested here; no SMS sent.',
    })
    expect(JSON.stringify(rows)).not.toContain(secret)
    expect(JSON.stringify(rows)).not.toContain('AC-not-a-secret')
  })

  it('reports local deterministic modes as enabled and never as remotely validated', () => {
    const rows = runtimeProviderInventory(configFor(), { TELECOM_MODE: 'emulator' })
    expect(rows.find((row) => row.id === 'runtime:telecom')).toMatchObject({
      state: 'enabled',
      safeTestResult: 'Local emulator selected; no SMS sent.',
    })
  })
})
