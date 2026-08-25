type JsonRecord = Record<string, unknown>

export type EditorialTocEntry = {
  id: string
  level: number
  text: string
}

const wordsPerMinute = 200

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export function extractPlainText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractPlainText).filter(Boolean).join(' ')
  if (!value || typeof value !== 'object') return ''

  const record = value as JsonRecord
  // Payload Lexical documents wrap their tree in `root`; individual nodes use
  // `children`. Traverse both shapes so canonical document projections do not
  // silently become empty at the persistence boundary.
  const rootText = record.root ? extractPlainText(record.root) : ''
  const directText = typeof record.text === 'string' ? record.text : ''
  const childText = extractPlainText(record.children)
  return [rootText, directText, childText].filter(Boolean).join(' ').trim()
}

export function estimateReadingTimeMinutes(plainText: string): number {
  const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute))
}

export function buildTableOfContents(document: Record<string, unknown>): EditorialTocEntry[] {
  const root = asRecord(document.root)
  const children = asArray(root.children)

  return children.flatMap((child) => {
    const node = asRecord(child)
    const text = extractPlainText(node).trim()
    if (!text) return []

    if (node.type === 'heading') {
      const tag = typeof node.tag === 'string' ? node.tag : ''
      const levelFromTag = /^h([1-6])$/.exec(tag)?.[1]
      const level = Number(levelFromTag ?? node.level ?? 2)
      return [{ id: slugify(text), level, text }]
    }

    if (node.type === 'markdown-heading') {
      const level = Number(node.level ?? 2)
      return [{ id: slugify(text), level, text }]
    }

    return []
  })
}
