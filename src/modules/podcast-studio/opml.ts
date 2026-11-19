/**
 * POD-05 (POD-REQ-12): rundown ⇄ OPML import/export with an
 * external-change conflict guard.
 *
 * Written fresh from the OPML 2.0 format (no third-party code adapted;
 * no THIRD_PARTY_NOTICES change needed). The rundown maps to an
 * outline hierarchy: a `section` rundown item becomes a parent
 * outline and the items that follow it (until the next section)
 * nest inside it. Every item carries its fields as attributes —
 * `text` (title), `type`, `id`, `plannedSec`, plus `actualSec`,
 * `status`, `clipId`, `url` and `startedAtElapsedSec` when present —
 * so an export → import round trip reproduces the rundown exactly.
 *
 * Conflict guard: importing an OPML document records its content
 * hash on the session (`rundownSourceHash`). Exporting over an
 * existing target whose current hash differs from the recorded one
 * is a CONFLICT — the export is refused (never a silent overwrite)
 * unless the caller explicitly forces it. This mirrors the
 * acceptance rule: "a disk-changed OPML is never silently
 * overwritten; the conflict offers load-disk or overwrite."
 */
import { createHash } from 'node:crypto'

import type { StudioRundownItem } from './contracts/session'
import type { StudioSessionDoc } from './session-engine'

export const hashOpmlContent = (text: string): string =>
  createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex')

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const itemAttrs = (item: StudioRundownItem): string => {
  const attrs: Array<[string, string | number | undefined]> = [
    ['text', item.title],
    ['type', item.type],
    ['id', item.id],
    ['plannedSec', item.plannedSec],
    ['actualSec', item.actualSec ?? undefined],
    ['status', item.status],
    ['clipId', item.clipId],
    ['url', item.url],
    ['startedAtElapsedSec', item.startedAtElapsedSec],
  ]
  return attrs
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${escapeAttr(String(value))}"`)
    .join(' ')
}

/** Serializes a rundown to an OPML document (sections nest their following items). */
export function rundownToOpml(session: StudioSessionDoc): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeAttr(session.showTitle)} — Rundown</title>`,
    '  </head>',
    '  <body>',
  ]
  let openSection = false
  for (const item of session.rundown) {
    if (item.type === 'section') {
      if (openSection) lines.push('    </outline>')
      lines.push(`    <outline ${itemAttrs(item)}>`)
      openSection = true
    } else {
      lines.push(`    ${openSection ? '  ' : ''}<outline ${itemAttrs(item)} />`)
    }
  }
  if (openSection) lines.push('    </outline>')
  lines.push('  </body>', '</opml>')
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Import (minimal hand-written OPML parser — outlines + attributes only)
// ---------------------------------------------------------------------------

const unescapeAttr = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')

type OutlineNode = { attrs: Record<string, string>; children: OutlineNode[] }

const parseAttrs = (source: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"|([A-Za-z_][\w:.-]*)\s*=\s*'([^']*)'/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    attrs[match[1] ?? match[3]] = unescapeAttr(match[2] ?? match[4] ?? '')
  }
  return attrs
}

const parseOutlines = (xml: string): OutlineNode[] => {
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(xml)
  const body = bodyMatch ? bodyMatch[1] : xml
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  const tagPattern = /<outline\b([^>]*?)(\/?)>|<\/outline\s*>/gi
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(body)) !== null) {
    if (match[0].startsWith('</')) {
      stack.pop()
      continue
    }
    const node: OutlineNode = { attrs: parseAttrs(match[1] ?? ''), children: [] }
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
    if (match[2] !== '/') stack.push(node)
  }
  return roots
}

const numberAttr = (value: string | undefined): number | undefined => {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const nodeToItem = (node: OutlineNode): StudioRundownItem => {
  const { attrs } = node
  const item: StudioRundownItem = {
    id: attrs.id ?? '',
    type: attrs.type ?? 'note',
    title: attrs.text ?? '',
    plannedSec: numberAttr(attrs.plannedSec) ?? 0,
    actualSec: numberAttr(attrs.actualSec) ?? null,
    status: attrs.status ?? 'pending',
    ...(attrs.clipId ? { clipId: attrs.clipId } : {}),
    ...(attrs.url ? { url: attrs.url } : {}),
    ...(numberAttr(attrs.startedAtElapsedSec) !== undefined
      ? { startedAtElapsedSec: numberAttr(attrs.startedAtElapsedSec) }
      : {}),
  }
  return item
}

const flattenOutlines = (nodes: OutlineNode[], into: StudioRundownItem[]): void => {
  for (const node of nodes) {
    into.push(nodeToItem(node))
    flattenOutlines(node.children, into)
  }
}

/** Parses an OPML document into a rundown (sections flatten back in order). */
export function opmlToRundown(opml: string): StudioRundownItem[] {
  if (!/<opml[\s>]/i.test(opml)) throw new Error('Not an OPML document.')
  const items: StudioRundownItem[] = []
  flattenOutlines(parseOutlines(opml), items)
  items.forEach((item, index) => {
    if (!item.id) item.id = `opml-${index + 1}`
  })
  return items
}

// ---------------------------------------------------------------------------
// Session-level import + the conflict guard
// ---------------------------------------------------------------------------

/**
 * Imports an OPML document as the session's rundown, recording the
 * source's content hash on the session for the export guard.
 */
export function importOpmlRundown(session: StudioSessionDoc, opml: string): StudioSessionDoc {
  const rundown = opmlToRundown(opml)
  const next: StudioSessionDoc = JSON.parse(JSON.stringify(session))
  next.rundown = rundown
  next.rundownSourceHash = hashOpmlContent(opml)
  next.log.push({
    type: 'opml-import',
    level: 'info',
    atElapsedSec: next.elapsedSec,
    items: rundown.length,
    sourceHash: next.rundownSourceHash,
  })
  return next
}

export type OpmlExportCheck =
  | { ok: true; forced: boolean }
  | {
      ok: false
      conflict: true
      recordedHash?: string
      targetHash: string
      reason: 'target-changed-since-import' | 'target-differs-from-session'
    }

/**
 * The overwrite guard. `targetText` is the current content of the
 * file/document the export would overwrite (null/empty = nothing to
 * protect). Export may proceed when the target still matches the
 * hash recorded at import time, or when the target is byte-identical
 * to what this session would export anyway; anything else is a
 * conflict unless `force` is set.
 */
export function checkOpmlOverwrite(
  session: StudioSessionDoc,
  targetText: string | null | undefined,
  options: { force?: boolean } = {},
): OpmlExportCheck {
  if (!targetText) return { ok: true, forced: false }
  const targetHash = hashOpmlContent(targetText)
  if (session.rundownSourceHash && targetHash === session.rundownSourceHash) {
    return { ok: true, forced: false }
  }
  if (targetHash === hashOpmlContent(rundownToOpml(session))) {
    return { ok: true, forced: false }
  }
  if (options.force) return { ok: true, forced: true }
  return {
    ok: false,
    conflict: true,
    recordedHash: session.rundownSourceHash,
    targetHash,
    reason: session.rundownSourceHash
      ? 'target-changed-since-import'
      : 'target-differs-from-session',
  }
}

export type OpmlExportResult =
  | { ok: true; opml: string; hash: string; forced: boolean }
  | (Extract<OpmlExportCheck, { ok: false }> & { ok: false })

/** Exports the session rundown to OPML, honouring the overwrite guard. */
export function exportOpml(
  session: StudioSessionDoc,
  targetText?: string | null,
  options: { force?: boolean } = {},
): OpmlExportResult {
  const check = checkOpmlOverwrite(session, targetText, options)
  if (!check.ok) return check
  const opml = rundownToOpml(session)
  return { ok: true, opml, hash: hashOpmlContent(opml), forced: check.forced }
}
