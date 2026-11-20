import { describe, expect, it } from 'vitest'

import {
  SETUP_DRAFT_TTL_MS,
  SetupDraftError,
  deriveSetupDraftDefaults,
  findForbiddenDraftKey,
  liveDraft,
  planSetupDraftSave,
  sanitizeSetupDraftAnswers,
  type SetupDraft,
} from '../../src/modules/operations/setup-draft'

const now = new Date('2026-11-19T12:00:00.000Z')

const saveInput = (overrides: Record<string, unknown> = {}) => ({
  ownerEmail: 'owner@example.test',
  answers: {
    name: 'Renegade Dispatch',
    slug: 'renegade-dispatch',
    primaryUrl: 'https://example.org',
    locale: 'en-US',
    timezone: 'America/Chicago',
    themeId: 'neutral-starter',
    starterType: 'creator-publication',
    featureProfile: 'Standard',
    optionalConnections: ['email'],
    starterContent: true,
    publishingDefaults: { indexingMode: 'index', commentsPolicy: 'open', visibility: 'public' },
  },
  currentStep: 2,
  operationId: 'operation-123456',
  version: 0,
  ...overrides,
})

function firstDraft(): SetupDraft {
  const plan = planSetupDraftSave(null, saveInput(), now)
  if (!plan.ok) throw new Error('expected first save to succeed')
  return plan.draft
}

describe('setup draft sanitizer', () => {
  it('keeps allowlisted safe answers and drops unknown fields', () => {
    const answers = sanitizeSetupDraftAnswers({
      name: 'My Site',
      slug: 'my-site',
      starterType: 'business',
      featureProfile: 'Lean',
      optionalConnections: ['email', 'not-a-connection'],
      starterContent: false,
      unknownField: 'drop me',
      nested: { anything: true },
    })
    expect(answers).toEqual({
      name: 'My Site',
      slug: 'my-site',
      starterType: 'business',
      featureProfile: 'Lean',
      optionalConnections: ['email'],
      starterContent: false,
    })
  })

  it('detects forbidden secret-bearing keys at any depth', () => {
    expect(findForbiddenDraftKey({ name: 'x', token: 'abc' })).toBe('token')
    expect(findForbiddenDraftKey({ answers: { nested: [{ recoveryCodes: ['A'] }] } })).toBe(
      'recoveryCodes',
    )
    expect(findForbiddenDraftKey({ credential: { publicKey: 'x' } })).toBe('credential')
    expect(findForbiddenDraftKey({ name: 'x', slug: 'y' })).toBeNull()
  })

  it('rejects a save whose answers smuggle a secret field', () => {
    expect(() =>
      planSetupDraftSave(
        null,
        saveInput({ answers: { name: 'x', bootstrapToken: 'should-never-persist' } }),
        now,
      ),
    ).toThrow(SetupDraftError)
    expect(() =>
      planSetupDraftSave(null, saveInput({ answers: { name: 'x', bootstrapToken: 'nope' } }), now),
    ).toThrow(/never store secrets/)
  })

  it('derives a slug default from the site name when no slug was chosen', () => {
    expect(deriveSetupDraftDefaults({ name: 'My Cool Site!' })).toEqual({ slug: 'my-cool-site' })
    expect(deriveSetupDraftDefaults({ name: 'X', slug: 'chosen' })).toEqual({})
  })
})

describe('setup draft optimistic concurrency', () => {
  it('creates version 1 with an expiry and the setup task id', () => {
    const draft = firstDraft()
    expect(draft.version).toBe(1)
    expect(draft.currentStep).toBe(2)
    expect(draft.currentTaskId).toBe('setup.installation')
    expect(draft.operationId).toBe('operation-123456')
    expect(draft.ownerEmail).toBe('owner@example.test')
    expect(draft.siteId).toBeNull()
    expect(Date.parse(draft.expiresAt) - now.getTime()).toBe(SETUP_DRAFT_TTL_MS)
    expect(draft.answers.name).toBe('Renegade Dispatch')
  })

  it('accepts a save that presents the current version and increments it', () => {
    const draft = firstDraft()
    const plan = planSetupDraftSave(draft, saveInput({ version: 1, currentStep: 3 }), now)
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.draft.version).toBe(2)
      expect(plan.draft.currentStep).toBe(3)
    }
  })

  it('conflicts when a stale second tab saves with an old version', () => {
    const draft = firstDraft()
    // Tab A advances to version 2.
    const tabA = planSetupDraftSave(draft, saveInput({ version: 1, currentStep: 3 }), now)
    expect(tabA.ok).toBe(true)
    // Tab B still holds version 1 and tries to overwrite.
    const tabB = planSetupDraftSave(
      tabA.ok ? tabA.draft : draft,
      saveInput({ version: 1, currentStep: 1 }),
      now,
    )
    expect(tabB).toEqual({ ok: false, code: 'DRAFT_CONFLICT', currentVersion: 2 })
  })

  it('conflicts when a second tab tries to create a first draft over an existing one', () => {
    const draft = firstDraft()
    const plan = planSetupDraftSave(draft, saveInput({ version: 0 }), now)
    expect(plan).toEqual({ ok: false, code: 'DRAFT_CONFLICT', currentVersion: 1 })
  })

  it('treats an expired draft as no draft: it no longer reads live and a fresh save restarts at version 1', () => {
    const draft = firstDraft()
    const later = new Date(now.getTime() + SETUP_DRAFT_TTL_MS + 1000)
    expect(liveDraft(draft, later)).toBeNull()
    const plan = planSetupDraftSave(draft, saveInput({ version: 0 }), later)
    expect(plan.ok).toBe(true)
    if (plan.ok) expect(plan.draft.version).toBe(1)
  })

  it('never lets a serialized draft contain forbidden fields', () => {
    const draft = firstDraft()
    const serialized = JSON.stringify(draft)
    for (const forbidden of [
      'bootstrap',
      'enrollmentToken',
      'recoveryCode',
      'public_key',
      'passkey',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    expect(findForbiddenDraftKey(draft)).toBeNull()
  })
})
