import { afterEach, describe, expect, it } from 'vitest'

import { evaluateAudienceHealth } from '../../src/modules/audience/command-center-service'
import { telecomProviderTruth } from '../../src/modules/telecom/tasks'

/**
 * RC3-19 (#31) — the operator surface must display the telecom truth:
 * the provider mode actually selected, whether sends are live or
 * simulated, and only the routes the selected provider declares.
 * Before this pass the health payload hardcoded
 * ['SMS-GSM7', 'SMS-UCS2', 'RCS-Jibe'] in every mode.
 */
const ENV_KEYS = [
  'TELECOM_MODE',
  'TELECOM_ALLOW_OUTBOUND',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
]
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

function setEnv(values: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('RC3-19 telecom provider truth', () => {
  it('reports disabled — no routes, no outbound — when no mode is configured', () => {
    setEnv({})
    const truth = telecomProviderTruth()
    expect(truth.mode).toBe('disabled')
    expect(truth.provider).toBe('disabled-telecom')
    expect(truth.status).toBe('disabled')
    expect(truth.outboundAllowed).toBe(false)
    expect(truth.routesActive).toEqual([])
    expect(truth.name).toContain('disabled')
  })

  it('reports the emulator as simulated — never as live carrier readiness', () => {
    setEnv({ TELECOM_MODE: 'emulator' })
    const truth = telecomProviderTruth()
    expect(truth.mode).toBe('emulator')
    expect(truth.provider).toBe('telecom-emulator')
    expect(truth.status).toBe('degraded')
    expect(truth.outboundAllowed).toBe(false)
    expect(truth.name).toContain('simulated sends only')
    expect(truth.routesActive).toEqual(['SMS (emulated)', 'MMS (emulated)', 'RCS (emulated)'])
  })

  it('does not let Twilio credentials alone manufacture a live provider', () => {
    setEnv({ TWILIO_ACCOUNT_SID: 'AC-test', TWILIO_AUTH_TOKEN: 'token' })
    const truth = telecomProviderTruth()
    expect(truth.mode).toBe('disabled')
    expect(truth.provider).toBe('disabled-telecom')
    expect(truth.routesActive).toEqual([])
  })

  it('reports a configured live provider honestly: SMS only, outbound gated', () => {
    setEnv({
      TELECOM_MODE: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'token',
    })
    const truth = telecomProviderTruth()
    expect(truth.mode).toBe('live')
    expect(truth.provider).toBe('twilio-telecom')
    // The Twilio adapter declares SMS only and no RCS capability.
    expect(truth.routesActive).toEqual(['SMS'])
    expect(truth.outboundAllowed).toBe(false)
    expect(truth.name).toContain('not allowed')
  })

  it('allows outbound only when the live mode and the explicit switch agree', () => {
    setEnv({
      TELECOM_MODE: 'twilio',
      TELECOM_ALLOW_OUTBOUND: 'true',
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'token',
    })
    expect(telecomProviderTruth().outboundAllowed).toBe(true)
  })

  it('flows into the command-center health payload instead of the old hardcoded routes', () => {
    setEnv({ TELECOM_MODE: 'emulator' })
    const truth = telecomProviderTruth()
    const health = evaluateAudienceHealth({
      siteId: 'site-1',
      emailProviderStatus: 'disabled',
      emailProviderName: 'none',
      spfVerified: false,
      dkimVerified: false,
      dmarcVerified: false,
      tlsVerified: false,
      telecomProviderStatus: truth.status,
      telecomProviderName: truth.name,
      telecomOutboundAllowed: truth.outboundAllowed,
      telecomRoutesActive: truth.routesActive,
      totalSentRecently: 0,
      hardBouncesRecently: 0,
      complaintsRecently: 0,
      queueAgeMinutesMax: 0,
      webhookLagSecondsMax: 0,
      staleSegmentCount: 0,
      invalidFormCount: 0,
      failingAutomationsCount: 0,
    })
    expect(health.providers.telecom.routesActive).toEqual([
      'SMS (emulated)',
      'MMS (emulated)',
      'RCS (emulated)',
    ])
    expect(health.providers.telecom.provider).toContain('simulated sends only')
  })

  it('claims no routes when the caller cannot establish the provider truth', () => {
    const health = evaluateAudienceHealth({
      siteId: 'site-1',
      emailProviderStatus: 'disabled',
      emailProviderName: 'none',
      spfVerified: false,
      dkimVerified: false,
      dmarcVerified: false,
      tlsVerified: false,
      telecomProviderStatus: 'disabled',
      telecomProviderName: 'unknown',
      telecomOutboundAllowed: false,
      totalSentRecently: 0,
      hardBouncesRecently: 0,
      complaintsRecently: 0,
      queueAgeMinutesMax: 0,
      webhookLagSecondsMax: 0,
      staleSegmentCount: 0,
      invalidFormCount: 0,
      failingAutomationsCount: 0,
    })
    expect(health.providers.telecom.routesActive).toEqual([])
  })
})
