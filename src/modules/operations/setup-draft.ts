/**
 * UXI-02 — server-side setup-draft persistence.
 *
 * The setup form's non-secret answers are persisted on the singleton
 * `installation_state` row (additive columns, migration
 * 20261119_120000_uxi02_task_readiness_setup_draft) so a refresh or a
 * reopened browser returns to the last safe checkpoint instead of an
 * empty form.
 *
 * Safety contract:
 * - The draft is built from an ALLOWLIST of safe onboarding fields.
 *   Bootstrap tokens, enrollment/bootstrap secrets, passkey material and
 *   recovery codes are never accepted into a draft — unknown or forbidden
 *   keys are stripped by the sanitizer and rejected loudly when they
 *   appear at the top level of a save request.
 * - Ownership is a claim: either the HttpOnly draft-claim cookie issued on
 *   first save (hash stored server-side) or the live enrollment session
 *   (the `renegade-setup` cookie, verified by the route against
 *   installation_state). The enrollment-resume contract is untouched:
 *   no token of any kind is ever restored from the draft.
 * - Optimistic concurrency: every draft carries a version. A save must
 *   present the version it read; a stale second tab gets a conflict,
 *   never a silent overwrite.
 * - Drafts expire (24h) and are cleared when installation completes.
 *
 * The sanitizer and the save planner are pure and unit-testable; the
 * database functions at the bottom are a thin layer over them.
 */

import { createHmac } from 'node:crypto'

import type { Payload } from 'payload'

import {
  onboardingProfiles,
  optionalConnectionKeys,
  starterSiteTypes,
  type OnboardingInput,
} from './onboarding'

export const SETUP_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
export const SETUP_DRAFT_COOKIE = 'renegade-setup-draft'
export const SETUP_TASK_ID = 'setup.installation'

/** Keys that must never appear in a setup draft, at any depth. */
export const FORBIDDEN_DRAFT_KEYS: ReadonlySet<string> = new Set([
  'token',
  'bootstraptoken',
  'bootstrap_token',
  'enrollmenttoken',
  'enrollment_token',
  'credential',
  'credentials',
  'passkey',
  'passkeys',
  'publickey',
  'public_key',
  'recoverycode',
  'recoverycodes',
  'recovery_code',
  'recovery_codes',
  'password',
  'secret',
  'challenge',
  'attestationobject',
  'clientdatajson',
])

export class SetupDraftError extends Error {
  constructor(
    readonly code:
      | 'DRAFT_CONFLICT'
      | 'DRAFT_FORBIDDEN_FIELD'
      | 'DRAFT_INVALID'
      | 'DRAFT_UNAVAILABLE'
      | 'INSTALLATION_COMPLETE',
    message: string,
  ) {
    super(message)
    this.name = 'SetupDraftError'
  }
}

export type SetupDraft = {
  /** Claim/session owner identity: the enrollment email, when known. */
  ownerEmail?: string
  /** Site created by provisioning, once one exists; null during setup. */
  siteId: string | null
  /** Sanitized, non-secret setup answers (allowlisted onboarding fields). */
  answers: Partial<OnboardingInput>
  /** Defaults derived server-side from the answers/installation profile. */
  derivedDefaults: Record<string, string>
  currentStep: number
  currentTaskId: string
  operationId: string
  version: number
  updatedAt: string
  expiresAt: string
}

export type SetupDraftSaveInput = {
  ownerEmail?: string
  siteId?: string | null
  answers: unknown
  currentStep: unknown
  operationId: unknown
  /** The version the saver read; 0/absent when creating the first draft. */
  version?: unknown
}

// ---------------------------------------------------------------------------
// Pure core: sanitizing + save planning
// ---------------------------------------------------------------------------

function isForbiddenKey(key: string): boolean {
  return (
    FORBIDDEN_DRAFT_KEYS.has(key.toLowerCase().replace(/[-_\s]/g, '')) ||
    FORBIDDEN_DRAFT_KEYS.has(key.toLowerCase())
  )
}

/** Deep-scan any value for forbidden keys; returns the first offending key. */
export function findForbiddenDraftKey(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenDraftKey(item, depth + 1)
      if (found) return found
    }
    return null
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenKey(key)) return key
    const found = findForbiddenDraftKey(nested, depth + 1)
    if (found) return found
  }
  return null
}

const stringFields = [
  'name',
  'slug',
  'description',
  'primaryUrl',
  'locale',
  'timezone',
  'themeId',
  'logoMediaId',
] as const

/**
 * Build draft answers from an allowlist. Only known, non-secret onboarding
 * fields survive, each type-checked; everything else is dropped. Callers
 * that need loud rejection of smuggled secrets should run
 * findForbiddenDraftKey on the raw input first (the save path does).
 */
export function sanitizeSetupDraftAnswers(input: unknown): Partial<OnboardingInput> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return {}
  const raw = input as Record<string, unknown>
  const answers: Record<string, unknown> = {}

  for (const field of stringFields) {
    const value = raw[field]
    if (typeof value === 'string') answers[field] = value.slice(0, 2000)
  }
  if (
    typeof raw.starterType === 'string' &&
    (starterSiteTypes as readonly string[]).includes(raw.starterType)
  ) {
    answers.starterType = raw.starterType
  }
  if (
    typeof raw.featureProfile === 'string' &&
    (onboardingProfiles as readonly string[]).includes(raw.featureProfile)
  ) {
    answers.featureProfile = raw.featureProfile
  }
  if (Array.isArray(raw.optionalConnections)) {
    answers.optionalConnections = raw.optionalConnections.filter(
      (value): value is OnboardingInput['optionalConnections'][number] =>
        typeof value === 'string' && (optionalConnectionKeys as readonly string[]).includes(value),
    )
  }
  if (typeof raw.starterContent === 'boolean') answers.starterContent = raw.starterContent
  if (raw.launchState === 'prelaunch' || raw.launchState === 'active') {
    answers.launchState = raw.launchState
  }
  if (
    raw.siteVisibility === 'public' ||
    raw.siteVisibility === 'coming-soon' ||
    raw.siteVisibility === 'private'
  ) {
    answers.siteVisibility = raw.siteVisibility
  }
  const publishing = raw.publishingDefaults
  if (publishing && typeof publishing === 'object' && !Array.isArray(publishing)) {
    const source = publishing as Record<string, unknown>
    const defaults: Record<string, string> = {}
    if (source.indexingMode === 'index' || source.indexingMode === 'noindex') {
      defaults.indexingMode = source.indexingMode
    }
    if (
      source.commentsPolicy === 'open' ||
      source.commentsPolicy === 'members' ||
      source.commentsPolicy === 'closed'
    ) {
      defaults.commentsPolicy = source.commentsPolicy
    }
    if (
      source.visibility === 'public' ||
      source.visibility === 'members' ||
      source.visibility === 'members-only'
    ) {
      defaults.visibility = source.visibility
    }
    if (Object.keys(defaults).length > 0) answers.publishingDefaults = defaults
  }

  return answers as Partial<OnboardingInput>
}

/** Defaults derived from the answers themselves (slug follows the name). */
export function deriveSetupDraftDefaults(
  answers: Partial<OnboardingInput>,
): Record<string, string> {
  const derived: Record<string, string> = {}
  if (answers.name && !answers.slug) {
    derived.slug = answers.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64)
      .replace(/-+$/g, '')
  }
  if (answers.featureProfile) derived.featureProfile = answers.featureProfile
  return derived
}

function normalizeSaveInput(input: SetupDraftSaveInput): {
  ownerEmail?: string
  siteId: string | null
  answers: Partial<OnboardingInput>
  currentStep: number
  operationId: string
  version: number
} {
  const forbidden = findForbiddenDraftKey(input.answers)
  if (forbidden) {
    throw new SetupDraftError(
      'DRAFT_FORBIDDEN_FIELD',
      `Setup drafts never store secrets; remove "${forbidden}" and try again.`,
    )
  }
  if (typeof input.operationId !== 'string' || input.operationId.length < 8) {
    throw new SetupDraftError('DRAFT_INVALID', 'A draft save requires an operation ID.')
  }
  const step = Number(input.currentStep)
  if (!Number.isInteger(step) || step < 0 || step > 20) {
    throw new SetupDraftError('DRAFT_INVALID', 'The draft step is out of range.')
  }
  const version = input.version === undefined || input.version === null ? 0 : Number(input.version)
  if (!Number.isInteger(version) || version < 0) {
    throw new SetupDraftError('DRAFT_INVALID', 'The draft version is invalid.')
  }
  const email =
    typeof input.ownerEmail === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ownerEmail.trim())
      ? input.ownerEmail.trim().toLowerCase()
      : undefined
  return {
    ownerEmail: email,
    siteId: typeof input.siteId === 'string' && input.siteId ? input.siteId : null,
    answers: sanitizeSetupDraftAnswers(input.answers),
    currentStep: step,
    operationId: input.operationId.slice(0, 128),
    version,
  }
}

export type DraftSavePlan =
  | { ok: true; draft: SetupDraft }
  | { ok: false; code: 'DRAFT_CONFLICT'; currentVersion: number }

/**
 * Pure optimistic-concurrency planner. `current` is the stored draft (or
 * null); an expired stored draft counts as no draft. A save whose version
 * does not match the stored version conflicts — including a second tab
 * creating a "first" draft over an existing one.
 */
export function planSetupDraftSave(
  current: SetupDraft | null,
  input: SetupDraftSaveInput,
  now: Date = new Date(),
): DraftSavePlan {
  const normalized = normalizeSaveInput(input)
  const live = current && Date.parse(current.expiresAt) > now.getTime() ? current : null
  if (live && normalized.version !== live.version) {
    return { ok: false, code: 'DRAFT_CONFLICT', currentVersion: live.version }
  }
  if (!live && normalized.version !== 0) {
    return { ok: false, code: 'DRAFT_CONFLICT', currentVersion: 0 }
  }
  const draft: SetupDraft = {
    ...(normalized.ownerEmail ? { ownerEmail: normalized.ownerEmail } : {}),
    siteId: normalized.siteId ?? live?.siteId ?? null,
    answers: normalized.answers,
    derivedDefaults: deriveSetupDraftDefaults(normalized.answers),
    currentStep: normalized.currentStep,
    currentTaskId: SETUP_TASK_ID,
    operationId: normalized.operationId,
    version: (live?.version ?? 0) + 1,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SETUP_DRAFT_TTL_MS).toISOString(),
  }
  return { ok: true, draft }
}

/** A stored draft past its expiry reads as no draft at all. */
export function liveDraft(draft: SetupDraft | null, now: Date = new Date()): SetupDraft | null {
  if (!draft) return null
  return Date.parse(draft.expiresAt) > now.getTime() ? draft : null
}

// ---------------------------------------------------------------------------
// Thin persistence on installation_state
// ---------------------------------------------------------------------------

type SqlPool = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rowCount?: number | null; rows: T[] }>
}

function getPool(payload: Payload): SqlPool {
  const database = payload.db as typeof payload.db & { pool?: SqlPool }
  if (!database.pool) {
    throw new SetupDraftError('DRAFT_UNAVAILABLE', 'PostgreSQL is unavailable.')
  }
  return database.pool
}

export function hashDraftClaim(claimToken: string, secret: string): string {
  return createHmac('sha256', secret).update(`setup-draft:${claimToken}`).digest('hex')
}

/**
 * Verify the live enrollment session cookie (the `renegade-setup` token)
 * against installation_state, using the same hash the enrollment flow
 * stores. This only AUTHORIZES draft access for the browser that began
 * enrollment; the enrollment token itself is never stored in or restored
 * from a draft, and the enrollment-resume contract is unchanged.
 */
export async function isEnrollmentSessionValid(
  payload: Payload,
  secret: string,
  enrollmentToken: string | undefined,
): Promise<boolean> {
  if (!enrollmentToken) return false
  try {
    const pool = getPool(payload)
    const result = await pool.query<{
      state: string
      registration_session_hash: string | null
      bootstrap_expires_at: Date | null
    }>(
      `SELECT state, registration_session_hash, bootstrap_expires_at
       FROM installation_state WHERE singleton = true`,
    )
    const row = result.rows[0]
    if (!row || row.state !== 'installing' || !row.registration_session_hash) return false
    if (!row.bootstrap_expires_at || row.bootstrap_expires_at.getTime() <= Date.now()) return false
    const presented = createHmac('sha256', secret).update(enrollmentToken).digest('hex')
    return presented === row.registration_session_hash
  } catch {
    return false
  }
}

type DraftRow = {
  state: string
  setup_draft: SetupDraft | string | null
  setup_draft_claim_hash: string | null
  setup_draft_version: number | null
}

async function getDraftRow(pool: SqlPool): Promise<DraftRow | undefined> {
  const result = await pool.query<DraftRow>(
    `SELECT state, setup_draft, setup_draft_claim_hash, setup_draft_version
     FROM installation_state WHERE singleton = true`,
  )
  return result.rows[0]
}

function parseDraft(value: SetupDraft | string | null): SetupDraft | null {
  if (!value) return null
  try {
    const parsed = typeof value === 'string' ? (JSON.parse(value) as SetupDraft) : value
    return parsed && typeof parsed === 'object' && typeof parsed.version === 'number'
      ? parsed
      : null
  } catch {
    return null
  }
}

export type SetupDraftAccess = {
  /** Hash of the presented draft-claim cookie, when one was presented. */
  claimHash?: string | null
  /** True when the route verified the live enrollment session cookie. */
  enrollmentAuthorized?: boolean
}

function isAuthorized(row: DraftRow, access: SetupDraftAccess): boolean {
  if (access.enrollmentAuthorized) return true
  if (!row.setup_draft_claim_hash) return true // no claim yet: first saver claims it
  return Boolean(access.claimHash) && access.claimHash === row.setup_draft_claim_hash
}

/**
 * Load the current draft for an authorized claim/session. Returns null when
 * there is no draft, it expired, or the claim does not own it — a foreign
 * claim learns nothing about the draft's contents.
 */
export async function loadSetupDraft(
  payload: Payload,
  access: SetupDraftAccess,
): Promise<SetupDraft | null> {
  const pool = getPool(payload)
  let row: DraftRow | undefined
  try {
    row = await getDraftRow(pool)
  } catch {
    return null // draft columns not migrated yet: setup proceeds without drafts
  }
  if (!row || row.state === 'complete') return null
  if (!isAuthorized(row, access)) return null
  return liveDraft(parseDraft(row.setup_draft))
}

/**
 * Save a draft with optimistic concurrency enforced twice: by the pure
 * planner and by the version predicate in the UPDATE, so two racing tabs
 * cannot both win even if they read the same row.
 */
export async function saveSetupDraft(
  payload: Payload,
  access: SetupDraftAccess & { claimHash: string },
  input: SetupDraftSaveInput,
): Promise<SetupDraft> {
  const pool = getPool(payload)
  const row = await getDraftRow(pool).catch(() => undefined)
  if (!row) {
    throw new SetupDraftError(
      'DRAFT_UNAVAILABLE',
      'Installation state is unavailable; start setup before saving a draft.',
    )
  }
  if (row.state === 'complete') {
    throw new SetupDraftError(
      'INSTALLATION_COMPLETE',
      'Setup is permanently disabled for this installation.',
    )
  }
  if (!isAuthorized(row, access)) {
    throw new SetupDraftError(
      'DRAFT_CONFLICT',
      'This setup draft belongs to another browser session.',
    )
  }
  const storedVersion = row.setup_draft_version ?? 0
  const current = liveDraft(parseDraft(row.setup_draft))
  const plan = planSetupDraftSave(current, input)
  if (!plan.ok) {
    throw new SetupDraftError(
      'DRAFT_CONFLICT',
      'This setup was changed in another tab. Reload to see the latest answers.',
    )
  }
  const updated = await pool.query(
    `UPDATE installation_state
     SET setup_draft = $1, setup_draft_claim_hash = $2, setup_draft_version = $3,
         setup_draft_operation_id = $4, setup_draft_expires_at = $5, updated_at = now()
     WHERE singleton = true AND setup_draft_version = $6`,
    [
      JSON.stringify(plan.draft),
      access.claimHash,
      plan.draft.version,
      plan.draft.operationId,
      plan.draft.expiresAt,
      storedVersion,
    ],
  )
  if (!updated.rowCount) {
    throw new SetupDraftError(
      'DRAFT_CONFLICT',
      'This setup was changed in another tab. Reload to see the latest answers.',
    )
  }
  return plan.draft
}

/** Clear the draft (setup completed or the operator abandoned it). */
export async function clearSetupDraft(payload: Payload): Promise<void> {
  const pool = getPool(payload)
  await pool
    .query(
      `UPDATE installation_state
       SET setup_draft = NULL, setup_draft_claim_hash = NULL, setup_draft_version = 0,
           setup_draft_operation_id = NULL, setup_draft_expires_at = NULL, updated_at = now()
       WHERE singleton = true`,
    )
    .catch(() => undefined)
}
