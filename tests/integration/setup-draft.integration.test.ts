import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { ensureBootstrap } from '../../src/modules/operations/installation'
import {
  SetupDraftError,
  clearSetupDraft,
  hashDraftClaim,
  loadSetupDraft,
  saveSetupDraft,
  type SetupDraftSaveInput,
} from '../../src/modules/operations/setup-draft'
import {
  evaluateSetupTasks,
  loadTaskReadinessSnapshot,
  persistTaskReadinessSnapshot,
} from '../../src/modules/operations/task-readiness'

// UXI-02: server-side setup drafts persist on installation_state so a
// refresh/reopen resumes at the last safe checkpoint; optimistic
// concurrency stops a stale second tab from silently overwriting; the
// draft never contains bootstrap tokens, passkey material, or recovery
// codes. Also covers the task-readiness snapshot round-trip that the
// operator surface serves.

let payload: Payload

const claimHash = hashDraftClaim('draft-claim-token-for-tests', loadConfig().payloadSecret)
const foreignClaimHash = hashDraftClaim('someone-elses-claim', loadConfig().payloadSecret)

const saveInput = (overrides: Partial<SetupDraftSaveInput> = {}): SetupDraftSaveInput => ({
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
  },
  currentStep: 1,
  operationId: 'integration-operation-1',
  version: 0,
  ...overrides,
})

beforeEach(async () => {
  payload = await getPayload({ config })
  await payload.db.pool.query('DELETE FROM installation_state')
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  await ensureBootstrap(payload, loadConfig())
  consoleWarn.mockRestore()
})

afterEach(async () => {
  await payload.db.pool.query('DELETE FROM installation_state')
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('server-side setup draft persistence', () => {
  it('saves, reloads, and resumes a draft at its last checkpoint', async () => {
    const saved = await saveSetupDraft(payload, { claimHash }, saveInput())
    expect(saved.version).toBe(1)
    expect(saved.currentStep).toBe(1)

    const loaded = await loadSetupDraft(payload, { claimHash })
    expect(loaded).not.toBeNull()
    expect(loaded?.answers.name).toBe('Renegade Dispatch')
    expect(loaded?.answers.slug).toBe('renegade-dispatch')
    expect(loaded?.ownerEmail).toBe('owner@example.test')
    expect(loaded?.currentTaskId).toBe('setup.installation')
    expect(loaded?.siteId).toBeNull()

    const advanced = await saveSetupDraft(
      payload,
      { claimHash },
      saveInput({ version: 1, currentStep: 3 }),
    )
    expect(advanced.version).toBe(2)
    const resumed = await loadSetupDraft(payload, { claimHash })
    expect(resumed?.currentStep).toBe(3)
    expect(resumed?.version).toBe(2)
  })

  it('rejects a stale second tab with a conflict instead of overwriting', async () => {
    await saveSetupDraft(payload, { claimHash }, saveInput())
    await saveSetupDraft(payload, { claimHash }, saveInput({ version: 1, currentStep: 2 }))

    await expect(
      saveSetupDraft(payload, { claimHash }, saveInput({ version: 1, currentStep: 0 })),
    ).rejects.toMatchObject({ code: 'DRAFT_CONFLICT' })

    // The winning tab's answers are untouched.
    const loaded = await loadSetupDraft(payload, { claimHash })
    expect(loaded?.currentStep).toBe(2)
    expect(loaded?.version).toBe(2)
  })

  it('hides the draft from a foreign claim but serves it to the enrollment session', async () => {
    await saveSetupDraft(payload, { claimHash }, saveInput())

    expect(await loadSetupDraft(payload, { claimHash: foreignClaimHash })).toBeNull()
    await expect(
      saveSetupDraft(payload, { claimHash: foreignClaimHash }, saveInput({ version: 1 })),
    ).rejects.toBeInstanceOf(SetupDraftError)

    const viaEnrollment = await loadSetupDraft(payload, {
      claimHash: foreignClaimHash,
      enrollmentAuthorized: true,
    })
    expect(viaEnrollment?.answers.name).toBe('Renegade Dispatch')
  })

  it('never persists forbidden fields, and a smuggled secret save is rejected whole', async () => {
    await expect(
      saveSetupDraft(
        payload,
        { claimHash },
        saveInput({
          answers: { name: 'Sneaky', token: 'BOOTSTRAP-SECRET-VALUE' } as never,
        }),
      ),
    ).rejects.toMatchObject({ code: 'DRAFT_FORBIDDEN_FIELD' })

    await saveSetupDraft(payload, { claimHash }, saveInput())
    const raw = await payload.db.pool.query<{ setup_draft: unknown }>(
      `SELECT setup_draft FROM installation_state WHERE singleton = true`,
    )
    const serialized = JSON.stringify(raw.rows[0]?.setup_draft ?? '')
    expect(serialized).not.toContain('BOOTSTRAP-SECRET-VALUE')
    expect(serialized.toLowerCase()).not.toContain('bootstraptoken')
    expect(serialized.toLowerCase()).not.toContain('recoverycode')
    expect(serialized.toLowerCase()).not.toContain('passkey')
  })

  it('clears the draft so no checkpoint survives completion', async () => {
    await saveSetupDraft(payload, { claimHash }, saveInput())
    await clearSetupDraft(payload)
    expect(await loadSetupDraft(payload, { claimHash })).toBeNull()
  })
})

describe('task readiness snapshot persistence', () => {
  it('round-trips the latest evaluated snapshot for operator surfaces', async () => {
    const tasks = evaluateSetupTasks({
      readiness: {
        ready: true,
        database: 'connected',
        migrationState: 'applied',
        appliedMigrations: 5,
        totalMigrations: 5,
        pendingMigrations: [],
        installationState: 'complete',
      },
      providers: {
        database: {
          name: 'PostgreSQL Database',
          type: 'required',
          status: 'validated',
          message: 'Connected and operational',
        },
        storage: {
          name: 'Media Storage',
          type: 'required',
          status: 'validated',
          message: 'Local media storage directory verified.',
        },
      },
    })
    expect(await persistTaskReadinessSnapshot(payload, tasks)).toBe(true)

    const snapshot = await loadTaskReadinessSnapshot(payload)
    expect(snapshot).not.toBeNull()
    expect(snapshot?.checkedAt).toBeTruthy()
    const installation = snapshot?.tasks.find((task) => task.taskId === 'setup.installation')
    expect(installation?.state).toBe('verified')
    const database = snapshot?.tasks.find((task) => task.taskId === 'setup.database')
    expect(database?.state).toBe('verified')
  })
})
