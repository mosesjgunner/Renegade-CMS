import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

/**
 * Unified recipe execution policy (S2-10).
 *
 * Every recipe entry point (starter installation, onboarding) executes
 * under one durable journal, stored in the existing execution-events
 * outbox — no new collection. A run is keyed by a stable site-scoped
 * logical key (`recipe:{siteId}:{recipeId}@{recipeVersion}`), which is
 * also the event's unique idempotency key, so the store itself refuses
 * duplicate runs for the same logical recipe.
 *
 * Semantics:
 * - begin: a completed run returns its prior outcome (callers must not
 *   re-execute); an incomplete run resumes with its recorded steps and
 *   staged media intact; otherwise a new run starts.
 * - steps: outcomes are persisted as they are recorded, with target
 *   record ids and generated-baseline hashes, so a crash leaves an
 *   accurate picture of what exists.
 * - media: storage keys are staged in the journal BEFORE the recipe
 *   writes files (starter keys are deterministic), so a hard crash —
 *   where in-memory cleanup lists die with the process — can still be
 *   reconciled: staged keys no completed record references are orphans.
 * - edits: resume never re-creates records; entry points converge
 *   through their edit-preserving upserts and report conflicts here.
 */
export type RecipeStepOutcome = {
  status: 'done' | 'skipped' | 'conflict'
  targetId?: string
  baselineHash?: string
  detail?: string
}

export type RecipeRunData = {
  kind: string
  recipeId: string
  recipeVersion: string
  status: 'running' | 'completed' | 'failed'
  steps: Record<string, RecipeStepOutcome>
  mediaKeys: string[]
  targets: Record<string, string>
  summary?: string
  startedAt: string
  updatedAt: string
}

export type RecipeRunHandle = {
  /** False when the journal collection is unavailable (test doubles). */
  journaled: boolean
  runId?: string
  logicalKey: string
  /** 'completed' means: return the prior outcome; do not re-execute. */
  state: 'new' | 'resumed' | 'completed'
  data: RecipeRunData
}

export const recipeLogicalKey = (siteId: string, recipeId: string, recipeVersion: string) =>
  `recipe:${siteId}:${recipeId}@${recipeVersion}`

const journalAvailable = (payload: Payload): boolean =>
  Boolean(
    (payload as unknown as { collections?: Record<string, unknown> }).collections?.[
      'execution-events'
    ],
  )

type EventDoc = Record<string, unknown> & { id: string; payload: RecipeRunData }

async function findRun(payload: Payload, logicalKey: string): Promise<EventDoc | null> {
  const found = await payload.find({
    collection: 'execution-events',
    where: { idempotencyKey: { equals: logicalKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return (found.docs[0] as unknown as EventDoc) ?? null
}

async function writeRun(payload: Payload, runId: string, data: RecipeRunData): Promise<void> {
  await payload.update({
    collection: 'execution-events',
    id: runId,
    overrideAccess: true,
    data: { payload: { ...data, updatedAt: new Date().toISOString() } },
  } as never)
}

export async function beginRecipeRun(
  payload: Payload,
  input: {
    siteId: string
    kind: string
    recipeId: string
    recipeVersion: string
  },
): Promise<RecipeRunHandle> {
  const logicalKey = recipeLogicalKey(input.siteId, input.recipeId, input.recipeVersion)
  const empty: RecipeRunData = {
    kind: input.kind,
    recipeId: input.recipeId,
    recipeVersion: input.recipeVersion,
    status: 'running',
    steps: {},
    mediaKeys: [],
    targets: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  if (!journalAvailable(payload)) return { journaled: false, logicalKey, state: 'new', data: empty }
  const existing = await findRun(payload, logicalKey)
  if (existing) {
    const data = existing.payload
    if (data.status === 'completed')
      return { journaled: true, runId: existing.id, logicalKey, state: 'completed', data }
    // Resume: the run reopens; recorded steps and staged media survive.
    const reopened: RecipeRunData = { ...data, status: 'running' }
    await payload.update({
      collection: 'execution-events',
      id: existing.id,
      overrideAccess: true,
      data: {
        payload: { ...reopened, updatedAt: new Date().toISOString() },
        state: 'ready',
        attempts: ((existing as { attempts?: number }).attempts ?? 0) + 1,
      },
    } as never)
    return { journaled: true, runId: existing.id, logicalKey, state: 'resumed', data: reopened }
  }
  const created = (await payload.create({
    collection: 'execution-events',
    overrideAccess: true,
    data: {
      site: input.siteId,
      tenantId: input.siteId,
      actor: { kind: 'system', id: 'recipe-execution' },
      eventType: 'recipe.run',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: randomUUID(),
      idempotencyKey: logicalKey,
      privacyClass: 'internal',
      payload: empty,
      state: 'ready',
      attempts: 1,
    },
  } as never)) as unknown as EventDoc
  return { journaled: true, runId: created.id, logicalKey, state: 'new', data: empty }
}

/**
 * Reopen a completed run for a refresh execution (onboarding semantics:
 * a rerun is an edit-preserving refresh, not a duplicate install). The
 * prior steps stay on record; the run returns to 'running' and its
 * completion will overwrite the summary.
 */
export async function refreshRecipeRun(
  payload: Payload,
  run: RecipeRunHandle,
): Promise<RecipeRunHandle> {
  if (!run.journaled || !run.runId) return run
  run.data = { ...run.data, status: 'running' }
  const existing = await findRun(payload, run.logicalKey)
  await payload.update({
    collection: 'execution-events',
    id: run.runId,
    overrideAccess: true,
    data: {
      payload: { ...run.data, updatedAt: new Date().toISOString() },
      state: 'ready',
      attempts: ((existing as { attempts?: number } | null)?.attempts ?? 0) + 1,
    },
  } as never)
  return { ...run, state: 'resumed', data: run.data }
}

export async function recordRecipeStep(
  payload: Payload,
  run: RecipeRunHandle,
  stepKey: string,
  outcome: RecipeStepOutcome,
): Promise<void> {
  if (!run.journaled || !run.runId) return
  run.data.steps[stepKey] = outcome
  await writeRun(payload, run.runId, run.data)
}

export async function recordRecipeSteps(
  payload: Payload,
  run: RecipeRunHandle,
  steps: Record<string, RecipeStepOutcome>,
): Promise<void> {
  if (!run.journaled || !run.runId) return
  Object.assign(run.data.steps, steps)
  await writeRun(payload, run.runId, run.data)
}

/** Stage media storage keys before files are written, so a hard crash
 * leaves the journal able to reconcile what the process could not. */
export async function stageRecipeMedia(
  payload: Payload,
  run: RecipeRunHandle,
  keys: string[],
): Promise<void> {
  if (!run.journaled || !run.runId) return
  const merged = [...new Set([...run.data.mediaKeys, ...keys])]
  if (merged.length === run.data.mediaKeys.length) return
  run.data.mediaKeys = merged
  await writeRun(payload, run.runId, run.data)
}

export async function completeRecipeRun(
  payload: Payload,
  run: RecipeRunHandle,
  outcome: { summary: string; targets?: Record<string, string> },
): Promise<void> {
  if (!run.journaled || !run.runId) return
  run.data.status = 'completed'
  run.data.summary = outcome.summary
  if (outcome.targets) Object.assign(run.data.targets, outcome.targets)
  await payload.update({
    collection: 'execution-events',
    id: run.runId,
    overrideAccess: true,
    data: {
      payload: { ...run.data, updatedAt: new Date().toISOString() },
      state: 'processed',
    },
  } as never)
}

export async function failRecipeRun(
  payload: Payload,
  run: RecipeRunHandle,
  error: unknown,
): Promise<void> {
  if (!run.journaled || !run.runId) return
  run.data.status = 'failed'
  await payload.update({
    collection: 'execution-events',
    id: run.runId,
    overrideAccess: true,
    data: {
      payload: { ...run.data, updatedAt: new Date().toISOString() },
      state: 'retrying',
      lastError: error instanceof Error ? error.message : String(error),
    },
  } as never)
}

/** Read a run back (status/version reporting, onboarding resume). */
export async function getRecipeRun(
  payload: Payload,
  siteId: string,
  recipeId: string,
  recipeVersion: string,
): Promise<RecipeRunData | null> {
  if (!journalAvailable(payload)) return null
  const found = await findRun(payload, recipeLogicalKey(siteId, recipeId, recipeVersion))
  return found?.payload ?? null
}

/**
 * Reconcile media staged by runs that never completed: a staged key is
 * an orphan when no media-asset record points at it. Orphans are
 * removed from storage; keys a record references are kept. Completed
 * runs are never touched — their media is installed content.
 */
export async function reconcileRecipeMedia(
  payload: Payload,
  storage: { remove: (key: string) => Promise<unknown> },
  siteId?: string,
): Promise<{ removed: string[]; kept: string[] }> {
  const removed: string[] = []
  const kept: string[] = []
  if (!journalAvailable(payload)) return { removed, kept }
  const found = await payload.find({
    collection: 'execution-events',
    where: {
      and: [
        { eventType: { equals: 'recipe.run' } },
        ...(siteId ? [{ site: { equals: siteId } }] : []),
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  } as never)
  for (const doc of found.docs as unknown as EventDoc[]) {
    const data = doc.payload
    if (!data || data.status === 'completed') continue
    for (const key of data.mediaKeys ?? []) {
      const referenced = await payload.find({
        collection: 'media-assets',
        where: { storageLocation: { equals: key } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      if (referenced.docs.length) {
        kept.push(key)
      } else {
        await storage.remove(key)
        removed.push(key)
      }
    }
  }
  return { removed, kept }
}
