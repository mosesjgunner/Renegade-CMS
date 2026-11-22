import { hashRichTextDocument, type RichTextDocument } from './contracts'

/** The anchor shape the editorial contracts use for text ranges. */
export type TextAnchor = { nodeKey: string; offsetStart: number; offsetEnd: number }

type LexicalNode = {
  type?: string
  text?: string
  children?: LexicalNode[]
  [key: string]: unknown
}

/**
 * RC3-17: addressable text segments inside a RichTextDocument.
 *
 * A segment is one Lexical text node, addressed by its child-index
 * path from the document root ("0/2/1") — the nodeKey shape the
 * editorial contracts already use for anchors. `collectTextSegments`
 * also returns the plain text those segments compose (segment texts
 * joined with a single space, the same composition the document's
 * plain-text projection uses), with each segment's span inside it,
 * so engine results reported against the plain text (Harper lint
 * spans) map back to exact node-local raw offsets.
 */
export type TextSegment = {
  /** Child-index path from the root, e.g. "0/2/1". */
  path: string
  /** Raw node text as stored in the document. */
  text: string
  /** Span of this segment's text inside the composed plain text. */
  start: number
  end: number
}

function walk(node: LexicalNode, path: string, out: { path: string; text: string }[]): void {
  if (typeof node.text === 'string') out.push({ path, text: node.text })
  const children = Array.isArray(node.children) ? node.children : []
  children.forEach((child, index) => walk(child, path ? `${path}/${index}` : String(index), out))
}

/** Every text node in document order, plus the plain text they compose. */
export function collectTextSegments(document: RichTextDocument): {
  plainText: string
  segments: TextSegment[]
} {
  const raw: { path: string; text: string }[] = []
  walk(document.document.root as LexicalNode, '', raw)
  const segments: TextSegment[] = []
  let cursor = 0
  for (const entry of raw) {
    segments.push({
      path: entry.path,
      text: entry.text,
      start: cursor,
      end: cursor + entry.text.length,
    })
    cursor += entry.text.length + 1
  }
  return { plainText: raw.map((entry) => entry.text).join(' '), segments }
}

function nodeAtPath(root: LexicalNode, path: string): LexicalNode | null {
  let current: LexicalNode | undefined = root
  for (const part of path.split('/')) {
    const index = Number(part)
    if (!current || !Array.isArray(current.children) || Number.isNaN(index)) return null
    current = current.children[index]
  }
  return current ?? null
}

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** Top-level block texts (one entry per root child) for paragraph diffs. */
export function paragraphTexts(document: RichTextDocument): string[] {
  const root = document.document.root as LexicalNode
  const children = Array.isArray(root.children) ? root.children : []
  return children.map((child) => {
    const texts: string[] = []
    const collect = (node: LexicalNode): void => {
      if (typeof node.text === 'string') texts.push(node.text)
      ;(Array.isArray(node.children) ? node.children : []).forEach(collect)
    }
    collect(child)
    return normalize(texts.join(' '))
  })
}

/**
 * Splice a replacement into the anchored text node and rebuild the
 * document (hash + projection recomputed exactly as the markdown
 * importer finalizes documents). Returns null when the anchor no
 * longer holds the expected text — the caller treats that as stale.
 */
export function applyTextReplacement(
  document: RichTextDocument,
  anchor: TextAnchor,
  expectedText: string,
  replacementText: string,
): RichTextDocument | null {
  const next = structuredClone(document)
  const node = nodeAtPath(next.document.root as LexicalNode, anchor.nodeKey)
  if (!node || typeof node.text !== 'string') return null
  const current = node.text.slice(anchor.offsetStart, anchor.offsetEnd)
  if (current !== expectedText) return null
  node.text =
    node.text.slice(0, anchor.offsetStart) + replacementText + node.text.slice(anchor.offsetEnd)
  const texts: string[] = []
  const collect = (entry: LexicalNode): void => {
    if (typeof entry.text === 'string') texts.push(entry.text)
    ;(Array.isArray(entry.children) ? entry.children : []).forEach(collect)
  }
  collect(next.document.root as LexicalNode)
  next.plainTextProjection = normalize(texts.join(' '))
  next.canonicalHash = hashRichTextDocument(next.document)
  return next
}

export type ParagraphDiffEntry = {
  kind: 'unchanged' | 'added' | 'removed' | 'changed'
  before: string | null
  after: string | null
}

/**
 * Paragraph-level diff (LCS over block texts). A removed run paired
 * with an adjacent added run reads as `changed` pairs, which is the
 * granularity an editor reviews at — no per-character noise.
 */
export function diffParagraphs(before: string[], after: string[]): ParagraphDiffEntry[] {
  const rows = before.length
  const cols = after.length
  const lcs: number[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => 0),
  )
  for (let i = rows - 1; i >= 0; i -= 1)
    for (let j = cols - 1; j >= 0; j -= 1)
      lcs[i][j] =
        before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const raw: ParagraphDiffEntry[] = []
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      raw.push({ kind: 'unchanged', before: before[i], after: after[j] })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      raw.push({ kind: 'removed', before: before[i], after: null })
      i += 1
    } else {
      raw.push({ kind: 'added', before: null, after: after[j] })
      j += 1
    }
  }
  while (i < rows) {
    raw.push({ kind: 'removed', before: before[i], after: null })
    i += 1
  }
  while (j < cols) {
    raw.push({ kind: 'added', before: null, after: after[j] })
    j += 1
  }

  // Pair adjacent removed/added runs into `changed` entries.
  const diff: ParagraphDiffEntry[] = []
  let k = 0
  while (k < raw.length) {
    if (raw[k].kind !== 'removed') {
      diff.push(raw[k])
      k += 1
      continue
    }
    const removedRun: ParagraphDiffEntry[] = []
    while (k < raw.length && raw[k].kind === 'removed') {
      removedRun.push(raw[k])
      k += 1
    }
    const addedRun: ParagraphDiffEntry[] = []
    while (k < raw.length && raw[k].kind === 'added') {
      addedRun.push(raw[k])
      k += 1
    }
    const pairs = Math.min(removedRun.length, addedRun.length)
    for (let p = 0; p < pairs; p += 1)
      diff.push({ kind: 'changed', before: removedRun[p].before, after: addedRun[p].after })
    for (let p = pairs; p < removedRun.length; p += 1) diff.push(removedRun[p])
    for (let p = pairs; p < addedRun.length; p += 1) diff.push(addedRun[p])
  }
  return diff
}
