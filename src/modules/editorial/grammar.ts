/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload'

import type { GrammarIssue, GrammarSuggestion, RichTextDocument } from './contracts'
import { loadBundleByArticleId, saveEditorialDraft } from './persistence'
import { applyTextReplacement, collectTextSegments } from './text-segments'
import type { EditorialActor } from './workflow'

/**
 * RC3-17 / DEBT-03 — grammar & editorial intelligence (area #7).
 *
 * The engine is Harper, bundled with the product and run locally —
 * the owner's settled decision (Nov 11, 2026): grammar is built-in,
 * NOT BYO-model, and no text leaves the install for a check. The
 * contract types (GrammarIssue, GrammarSuggestion) existed with zero
 * consumers; this service implements against them:
 *
 * - runGrammarCheck lints the article's current draft document with
 *   the real Harper engine, and persists one issue + one suggestion
 *   per lint, anchored to the exact text node and carrying the
 *   document hash they were computed against.
 * - Accepting a suggestion splices the replacement into that node
 *   and saves through the normal editorial draft path — a persisted
 *   revision, never a silent in-place edit, never a publish.
 * - If the draft moved after the check (hash mismatch, or the anchor
 *   text no longer matches), the issue is marked 'stale' and the
 *   accept is refused. Dismissals record the decision and change
 *   nothing.
 *
 * Bounded choices, stated plainly: one suggestion per issue (Harper's
 * first candidate; the explanation carries the rule message), and
 * style-guide rules (GrammarIssue.ruleId) stay null — Harper lint
 * kinds are recorded on the issue instead of being dressed up as
 * site style rules.
 */

type Doc = Record<string, any>
type Pool = { query: (text: string, values?: unknown[]) => Promise<{ rows: Doc[] }> }

function poolOf(payload: Payload): Pool {
  return (payload as unknown as { db: { pool: Pool } }).db.pool
}

const idOf = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? String((value as Doc).id ?? '')
    : String(value ?? '')

export class GrammarError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const GRAMMAR_PROVIDER_KEY = 'harper'

type HarperLint = {
  lint_kind: () => string
  message: () => string
  span: () => { start: number; end: number }
  suggestions: () => Array<{ get_replacement_text: () => string }>
}
type HarperLinter = { lint: (text: string) => Promise<HarperLint[]> }

let linterPromise: Promise<HarperLinter> | null = null

/** Lazily construct the bundled Harper linter (WASM, fully local). */
export function getGrammarLinter(): Promise<HarperLinter> {
  if (!linterPromise) {
    linterPromise = (async () => {
      const [{ LocalLinter }, { binary }] = await Promise.all([
        import('harper.js'),
        import('harper.js/binary'),
      ])
      const linter = new LocalLinter({ binary })
      await linter.setup()
      return linter as unknown as HarperLinter
    })()
  }
  return linterPromise
}

const ROLE_ORDER = { author: 1, editor: 2, publisher: 3 } as const

function requireRole(actor: EditorialActor, minimum: keyof typeof ROLE_ORDER): void {
  if (ROLE_ORDER[actor.role] < ROLE_ORDER[minimum])
    throw new GrammarError('GRAMMAR_FORBIDDEN', `${minimum} permission is required.`, 403)
}

export type GrammarIssueWithSuggestions = GrammarIssue & {
  lintKind: string
  message: string
  spanText: string
  suggestions: GrammarSuggestion[]
}

const ISSUE_COLUMNS = `id, article_id, document_hash, lint_kind, message,
  span_text, anchor, status, created_by, created_at`

function toIssue(row: Doc): GrammarIssue {
  return {
    id: String(row.id) as GrammarIssue['id'],
    articleId: String(row.article_id) as GrammarIssue['articleId'],
    documentHash: String(row.document_hash),
    ruleId: null,
    status: row.status as GrammarIssue['status'],
    anchor: row.anchor as GrammarIssue['anchor'],
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

function toSuggestion(row: Doc): GrammarSuggestion {
  return {
    id: String(row.id) as GrammarSuggestion['id'],
    issueId: String(row.issue_id) as GrammarSuggestion['issueId'],
    providerKey: String(row.provider_key),
    replacement: row.replacement ? String(row.replacement) : null,
    explanation: String(row.explanation),
    status: row.status as GrammarSuggestion['status'],
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

export async function listGrammarIssues(
  payload: Payload,
  input: { articleId: string; status?: GrammarIssue['status'] },
): Promise<GrammarIssueWithSuggestions[]> {
  const issues = input.status
    ? await poolOf(payload).query(
        `SELECT ${ISSUE_COLUMNS} FROM grammar_issues
         WHERE article_id = $1 AND status = $2 ORDER BY created_at ASC`,
        [input.articleId, input.status],
      )
    : await poolOf(payload).query(
        `SELECT ${ISSUE_COLUMNS} FROM grammar_issues
         WHERE article_id = $1 ORDER BY created_at ASC`,
        [input.articleId],
      )
  if (!issues.rows.length) return []
  const suggestions = await poolOf(payload).query(
    `SELECT id, issue_id, provider_key, replacement, explanation, status, created_at
     FROM grammar_suggestions WHERE issue_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
    [issues.rows.map((row) => row.id)],
  )
  const byIssue = new Map<string, GrammarSuggestion[]>()
  for (const row of suggestions.rows) {
    const list = byIssue.get(String(row.issue_id)) ?? []
    list.push(toSuggestion(row))
    byIssue.set(String(row.issue_id), list)
  }
  return issues.rows.map((row) => ({
    ...toIssue(row),
    // The persisted lint kind/message ride along for the editor surface.
    lintKind: String(row.lint_kind),
    message: String(row.message),
    spanText: String(row.span_text),
    suggestions: byIssue.get(String(row.id)) ?? [],
  })) as GrammarIssueWithSuggestions[]
}

/**
 * Run the bundled Harper engine over the article's current draft and
 * persist the results. Any still-open issues from an earlier run are
 * superseded ('stale'): the returned set is the only live one.
 */
export async function runGrammarCheck(
  payload: Payload,
  input: { articleId: string; actor: EditorialActor },
): Promise<{ documentHash: string; issues: GrammarIssueWithSuggestions[] }> {
  requireRole(input.actor, 'author')
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const siteId = idOf(bundle.content.site)
  const document = bundle.article.document as RichTextDocument
  const documentHash = String(bundle.article.documentHash)
  const { plainText, segments } = collectTextSegments(document)

  const linter = await getGrammarLinter()
  const lints = await linter.lint(plainText)

  const pool = poolOf(payload)
  await pool.query(
    `UPDATE grammar_issues SET status = 'stale', updated_at = now()
     WHERE article_id = $1 AND status = 'open'`,
    [input.articleId],
  )

  for (const lint of lints) {
    const span = lint.span()
    const segment =
      segments.find((candidate) => span.start >= candidate.start && span.start < candidate.end) ??
      segments.find((candidate) => candidate.start >= span.start)
    if (!segment) continue
    const offsetStart = Math.max(0, span.start - segment.start)
    const offsetEnd = Math.min(segment.text.length, span.end - segment.start)
    if (offsetEnd <= offsetStart) continue
    const spanText = segment.text.slice(offsetStart, offsetEnd)
    const suggestions = lint.suggestions()
    const replacement = suggestions.length ? suggestions[0].get_replacement_text() : null
    const inserted = await pool.query(
      `INSERT INTO grammar_issues
         (site_id, article_id, document_hash, lint_kind, message, span_text, anchor, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'open',$8)
       RETURNING id`,
      [
        siteId,
        input.articleId,
        documentHash,
        lint.lint_kind(),
        lint.message(),
        spanText,
        JSON.stringify({
          nodeKey: segment.path,
          offsetStart,
          offsetEnd,
        }),
        input.actor.id,
      ],
    )
    await pool.query(
      `INSERT INTO grammar_suggestions
         (issue_id, provider_key, replacement, explanation, status)
       VALUES ($1,'harper',$2,$3,'proposed')`,
      [inserted.rows[0].id, replacement, `${lint.lint_kind()}: ${lint.message()}`],
    )
  }

  const issues = await listGrammarIssues(payload, {
    articleId: input.articleId,
    status: 'open',
  })
  return { documentHash, issues }
}

/** Article/site context for a suggestion — the route's access check. */
export async function getGrammarSuggestionContext(
  payload: Payload,
  suggestionId: string,
): Promise<{ articleId: string; siteId: string } | null> {
  const result = await poolOf(payload).query(
    `SELECT i.article_id, i.site_id FROM grammar_suggestions s
     JOIN grammar_issues i ON i.id = s.issue_id WHERE s.id = $1`,
    [suggestionId],
  )
  if (!result.rows[0]) return null
  return {
    articleId: String(result.rows[0].article_id),
    siteId: String(result.rows[0].site_id),
  }
}

async function loadSuggestion(
  payload: Payload,
  suggestionId: string,
): Promise<{ suggestion: Doc; issue: Doc }> {
  const found = await poolOf(payload).query(
    `SELECT id, issue_id, provider_key, replacement, explanation, status, created_at
     FROM grammar_suggestions WHERE id = $1`,
    [suggestionId],
  )
  if (!found.rows[0])
    throw new GrammarError('GRAMMAR_SUGGESTION_NOT_FOUND', 'Grammar suggestion was not found.', 404)
  const issue = await poolOf(payload).query(
    `SELECT ${ISSUE_COLUMNS} FROM grammar_issues WHERE id = $1`,
    [found.rows[0].issue_id],
  )
  if (!issue.rows[0])
    throw new GrammarError('GRAMMAR_ISSUE_NOT_FOUND', 'Grammar issue was not found.', 404)
  return { suggestion: found.rows[0], issue: issue.rows[0] }
}

async function markStale(payload: Payload, issueId: string, suggestionId: string): Promise<void> {
  await poolOf(payload).query(
    `UPDATE grammar_issues SET status = 'stale', updated_at = now() WHERE id = $1`,
    [issueId],
  )
  await poolOf(payload).query(`UPDATE grammar_suggestions SET status = 'expired' WHERE id = $1`, [
    suggestionId,
  ])
}

/**
 * Accept a suggestion: splice the replacement into the anchored text
 * node and persist a new draft revision through the normal editorial
 * save path. Refused (and marked stale) when the draft has moved
 * since the check or the anchor text no longer matches.
 */
export async function acceptGrammarSuggestion(
  payload: Payload,
  input: {
    suggestionId: string
    actor: EditorialActor
    actorUserId?: string | null
    now?: string
  },
): Promise<{ suggestion: GrammarSuggestion; revisionId: string }> {
  requireRole(input.actor, 'author')
  const { suggestion, issue } = await loadSuggestion(payload, input.suggestionId)
  if (suggestion.status !== 'proposed' || issue.status !== 'open')
    throw new GrammarError(
      'GRAMMAR_ALREADY_DECIDED',
      'This grammar suggestion has already been decided.',
    )
  if (!suggestion.replacement)
    throw new GrammarError(
      'GRAMMAR_NO_REPLACEMENT',
      'This suggestion carries no replacement text to apply.',
    )
  const articleId = String(issue.article_id)
  const bundle = await loadBundleByArticleId(payload, articleId)
  if (String(bundle.article.documentHash) !== String(issue.document_hash)) {
    await markStale(payload, String(issue.id), input.suggestionId)
    throw new GrammarError(
      'GRAMMAR_STALE',
      'The draft changed after this check ran; re-run the grammar check.',
      409,
    )
  }
  const document = bundle.article.document as RichTextDocument
  const anchor = issue.anchor as GrammarIssue['anchor']
  const updated = applyTextReplacement(
    document,
    anchor,
    String(issue.span_text),
    String(suggestion.replacement),
  )
  if (!updated) {
    await markStale(payload, String(issue.id), input.suggestionId)
    throw new GrammarError(
      'GRAMMAR_ANCHOR_MOVED',
      'The flagged text no longer matches its anchor; re-run the grammar check.',
      409,
    )
  }
  await saveEditorialDraft(payload, {
    articleId,
    actor: input.actor,
    actorUserId: input.actorUserId ?? null,
    document: updated,
    baseRevisionId: idOf(bundle.article.currentRevision),
    mutationId: `grammar:${input.suggestionId}`,
    now: input.now,
  })
  await poolOf(payload).query(
    `UPDATE grammar_suggestions
       SET status = 'accepted', decided_by = $2, decided_at = now()
     WHERE id = $1`,
    [input.suggestionId, input.actor.id],
  )
  await poolOf(payload).query(
    `UPDATE grammar_issues SET status = 'resolved', updated_at = now() WHERE id = $1`,
    [issue.id],
  )
  const after = await loadBundleByArticleId(payload, articleId)
  const { suggestion: decided } = await loadSuggestion(payload, input.suggestionId)
  return {
    suggestion: toSuggestion(decided),
    revisionId: idOf(after.article.currentRevision),
  }
}

/** Dismiss a suggestion: the decision is recorded; nothing changes. */
export async function dismissGrammarSuggestion(
  payload: Payload,
  input: { suggestionId: string; actor: EditorialActor },
): Promise<GrammarSuggestion> {
  requireRole(input.actor, 'author')
  const { suggestion, issue } = await loadSuggestion(payload, input.suggestionId)
  if (suggestion.status !== 'proposed' || issue.status !== 'open')
    throw new GrammarError(
      'GRAMMAR_ALREADY_DECIDED',
      'This grammar suggestion has already been decided.',
    )
  await poolOf(payload).query(
    `UPDATE grammar_suggestions
       SET status = 'rejected', decided_by = $2, decided_at = now()
     WHERE id = $1`,
    [input.suggestionId, input.actor.id],
  )
  await poolOf(payload).query(
    `UPDATE grammar_issues SET status = 'dismissed', updated_at = now() WHERE id = $1`,
    [issue.id],
  )
  const { suggestion: decided } = await loadSuggestion(payload, input.suggestionId)
  return toSuggestion(decided)
}
