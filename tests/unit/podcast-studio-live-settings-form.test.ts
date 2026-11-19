/**
 * Live-stream settings form — the pure form → API shaping helper:
 *
 * - A public projection (profile + hasCredential, never any secret)
 *   round-trips into form state and back into a set-profile payload
 *   with the profile intact.
 * - The credential is write-only: form state never carries a saved
 *   credential value, an empty password field sends NO credential
 *   key (the saved credential stays), and a typed password is the
 *   only credential key sent.
 * - Credential XOR env name: a typed env var name is the only
 *   credential key sent, even if a password was also typed.
 */
import { describe, expect, it } from 'vitest'

import {
  buildSetProfilePayload,
  emptyLiveSettingsFormState,
  parseInitialState,
  type LiveSettingsFormState,
} from '../../src/modules/podcast-studio/live/live-settings-form'
import {
  publicStreamProfile,
  type PublicStreamProfile,
} from '../../src/modules/podcast-studio/live/stream-profile'

const SECRET = 's3cret-source-pw!'

const publicProfile = (overrides: Partial<PublicStreamProfile> = {}): PublicStreamProfile => ({
  sourceUrl: 'http://127.0.0.1:8000/show-live',
  bitrateKbps: 192,
  title: 'The Show — Live',
  enabled: false,
  nowPlayingEnabled: false,
  hasCredential: true,
  listenerUrl: 'http://127.0.0.1:8000/show-live',
  ...overrides,
})

describe('live settings form — initial state from the public projection', () => {
  it('maps every profile field and reflects hasCredential without any secret value', () => {
    const state = parseInitialState(publicProfile())
    expect(state.sourceUrl).toBe('http://127.0.0.1:8000/show-live')
    expect(state.title).toBe('The Show — Live')
    expect(state.bitrateKbps).toBe(192)
    expect(state.enabled).toBe(false)
    expect(state.nowPlayingEnabled).toBe(false)
    expect(state.hasCredential).toBe(true)
    // Write-only: nothing credential-shaped is ever seeded into state.
    expect(state.credential).toBe('')
    expect(state.credentialEnvName).toBe('')
    expect(state.useEnvCredential).toBe(false)
    expect(JSON.stringify(state)).not.toContain(SECRET)
  })

  it('a real public projection of a show with a saved credential seeds no secret', () => {
    const pub = publicStreamProfile({
      streamProfile: {
        sourceUrl: 'http://127.0.0.1:8000/show-live',
        bitrateKbps: 128,
        title: 'The Show — Live',
        enabled: true,
        nowPlayingEnabled: true,
      },
      streamCredentialEnvName: 'PODCAST_TEST_SOURCE_PASSWORD',
    })
    expect(pub?.hasCredential).toBe(true)
    const state = parseInitialState(pub)
    expect(state.hasCredential).toBe(true)
    expect(JSON.stringify(state)).not.toContain('PODCAST_TEST_SOURCE_PASSWORD')
    expect(state.credential).toBe('')
  })

  it('no profile yet gives the empty defaults (stream on, now-playing on, 128 kbps)', () => {
    const state = parseInitialState(null)
    expect(state).toEqual(emptyLiveSettingsFormState())
    expect(state.sourceUrl).toBe('')
    expect(state.title).toBe('')
    expect(state.bitrateKbps).toBe(128)
    expect(state.enabled).toBe(true)
    expect(state.nowPlayingEnabled).toBe(true)
    expect(state.hasCredential).toBe(false)
    expect(parseInitialState(undefined)).toEqual(state)
  })
})

describe('live settings form — payload shaping', () => {
  it('round-trips: public projection → form state → payload keeps the profile intact', () => {
    const pub = publicProfile()
    const payload = buildSetProfilePayload(parseInitialState(pub))
    expect(payload.profile).toEqual({
      sourceUrl: pub.sourceUrl,
      bitrateKbps: pub.bitrateKbps,
      title: pub.title,
      enabled: pub.enabled,
      nowPlayingEnabled: pub.nowPlayingEnabled,
    })
  })

  it('trims the URL and title the operator typed', () => {
    const payload = buildSetProfilePayload({
      ...emptyLiveSettingsFormState(),
      sourceUrl: '  http://127.0.0.1:8000/show-live  ',
      title: '  The Show — Live  ',
    })
    expect(payload.profile.sourceUrl).toBe('http://127.0.0.1:8000/show-live')
    expect(payload.profile.title).toBe('The Show — Live')
  })

  it('empty password field sends no credential key — the saved credential is kept', () => {
    const state: LiveSettingsFormState = { ...parseInitialState(publicProfile()), credential: '' }
    const payload = buildSetProfilePayload(state)
    expect(payload).not.toHaveProperty('credential')
    expect(payload).not.toHaveProperty('credentialEnvName')
    expect(Object.keys(payload)).toEqual(['profile'])
  })

  it('a typed password is sent as the only credential key', () => {
    const payload = buildSetProfilePayload({
      ...parseInitialState(publicProfile()),
      credential: SECRET,
    })
    expect(payload.credential).toBe(SECRET)
    expect(payload).not.toHaveProperty('credentialEnvName')
  })

  it('credential XOR env name: a typed env name is the only credential key, even with a password typed', () => {
    const payload = buildSetProfilePayload({
      ...parseInitialState(publicProfile()),
      credential: SECRET,
      useEnvCredential: true,
      credentialEnvName: '  PODCAST_ICECAST_SOURCE_PASSWORD  ',
    })
    expect(payload.credentialEnvName).toBe('PODCAST_ICECAST_SOURCE_PASSWORD')
    expect(payload).not.toHaveProperty('credential')
    expect(JSON.stringify(payload)).not.toContain(SECRET)
  })

  it('env mode with a blank name falls back to a typed password, and to nothing when both are blank', () => {
    const withPassword = buildSetProfilePayload({
      ...parseInitialState(publicProfile()),
      credential: SECRET,
      useEnvCredential: true,
      credentialEnvName: '   ',
    })
    expect(withPassword.credential).toBe(SECRET)
    expect(withPassword).not.toHaveProperty('credentialEnvName')

    const withNeither = buildSetProfilePayload({
      ...parseInitialState(publicProfile()),
      useEnvCredential: true,
      credentialEnvName: '',
    })
    expect(withNeither).not.toHaveProperty('credential')
    expect(withNeither).not.toHaveProperty('credentialEnvName')
  })
})
