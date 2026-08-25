import {
  MARKDOWN_FIDELITY_BOUNDARY,
  createMarkdownImportReport,
  hashMarkdownSource,
  hashRichTextDocument,
  type MarkdownExportReport,
  type MarkdownImportReport,
  type RichTextDocument,
} from './contracts'
import { extractPlainText } from './presentation'

type MarkdownBlock = Record<string, unknown>

const stripInlineMarkdown = (value: string): string =>
  value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')

const paragraphNode = (raw: string): MarkdownBlock => ({
  type: 'paragraph',
  raw,
  children: [{ type: 'text', text: stripInlineMarkdown(raw) }],
})

const finalizeDocument = (children: MarkdownBlock[]): RichTextDocument => {
  const document = { root: { type: 'root', children } }
  return {
    format: 'payload-lexical',
    schemaVersion: 1,
    document,
    canonicalHash: hashRichTextDocument(document),
    plainTextProjection: extractPlainText(document).replace(/\s+/g, ' ').trim(),
    unknownNodePolicy: 'preserve',
  }
}

export function importMarkdownToRichText(sourceMarkdown: string): {
  document: RichTextDocument
  report: MarkdownImportReport
} {
  const lines = sourceMarkdown.replace(/\r\n/g, '\n').split('\n')
  const children: MarkdownBlock[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) continue

    const fence = /^(```|~~~)/.exec(trimmed)
    if (fence) {
      const rawLines = [line]
      index += 1
      while (index < lines.length) {
        rawLines.push(lines[index])
        if (lines[index].trim().startsWith(fence[1])) break
        index += 1
      }
      const body = rawLines.slice(1, -1).join('\n')
      children.push({ type: 'code', raw: rawLines.join('\n'), language: fence[1], code: body })
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (heading) {
      children.push({
        type: 'markdown-heading',
        level: heading[1].length,
        raw: line,
        children: [{ type: 'text', text: stripInlineMarkdown(heading[2]) }],
      })
      continue
    }

    if (/^---+$/.test(trimmed)) {
      children.push({ type: 'horizontal-rule', raw: line })
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const rawLines = [line]
      const quoteLines = [trimmed.replace(/^>\s?/, '')]
      while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1].trim())) {
        index += 1
        rawLines.push(lines[index])
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
      }
      children.push({
        type: 'blockquote',
        raw: rawLines.join('\n'),
        children: quoteLines.map((quoteLine) => paragraphNode(quoteLine)),
      })
      continue
    }

    const ordered = /^\d+\.\s+/.test(trimmed)
    const unordered = /^[-*]\s+/.test(trimmed)
    if (ordered || unordered) {
      const rawLines = [line]
      const items = [trimmed.replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, '')]
      while (index + 1 < lines.length) {
        const next = lines[index + 1].trim()
        if (!(ordered ? /^\d+\.\s+/.test(next) : /^[-*]\s+/.test(next))) break
        index += 1
        rawLines.push(lines[index])
        items.push(next.replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ''))
      }
      children.push({
        type: 'list',
        listType: ordered ? 'ordered' : 'unordered',
        raw: rawLines.join('\n'),
        children: items.map((item) => ({
          type: 'listitem',
          raw: item,
          children: [{ type: 'text', text: stripInlineMarkdown(item) }],
        })),
      })
      continue
    }

    children.push(paragraphNode(line))
  }

  const document = finalizeDocument(children)
  return {
    document,
    report: createMarkdownImportReport({
      id: 'markdown-import-report:ephemeral' as never,
      articleId: null,
      sourceMarkdown,
      targetDocument: document,
      createdBy: null,
      createdAt: new Date().toISOString(),
    }),
  }
}

const exportBlock = (node: Record<string, unknown>): string => {
  if (typeof node.raw === 'string') return node.raw
  if (node.type === 'paragraph') return extractPlainText(node)
  if (node.type === 'heading') {
    const tag = typeof node.tag === 'string' ? node.tag : 'h2'
    const level = Number(/^h([1-6])$/.exec(tag)?.[1] ?? 2)
    return `${'#'.repeat(level)} ${extractPlainText(node)}`.trim()
  }
  if (node.type === 'markdown-heading') {
    const level = Number(node.level ?? 2)
    return `${'#'.repeat(level)} ${extractPlainText(node)}`.trim()
  }
  if (node.type === 'blockquote') {
    const text = extractPlainText(node)
    return text
      .split(/\n+/)
      .map((line) => `> ${line}`)
      .join('\n')
  }
  if (node.type === 'list') {
    const items = Array.isArray(node.children) ? node.children : []
    const ordered = node.listType === 'ordered'
    return items
      .map((item, index) => `${ordered ? `${index + 1}.` : '-'} ${extractPlainText(item)}`)
      .join('\n')
  }
  if (node.type === 'code') {
    return ['```', String(node.code ?? ''), '```'].join('\n')
  }
  if (node.type === 'horizontal-rule') return '---'
  return extractPlainText(node)
}

export function exportRichTextToMarkdown(document: RichTextDocument): {
  markdown: string
  report: Omit<MarkdownExportReport, 'id' | 'articleId' | 'createdBy' | 'createdAt'>
} {
  const root =
    document.document && typeof document.document === 'object' && 'root' in document.document
      ? ((document.document.root as Record<string, unknown>) ?? {})
      : {}
  const children = Array.isArray(root.children) ? root.children : []
  const markdown = children
    .map((child) => exportBlock((child as Record<string, unknown>) ?? {}))
    .join('\n\n')

  return {
    markdown,
    report: {
      sourceDocumentHash: document.canonicalHash,
      markdownChecksum: hashMarkdownSource(markdown),
      formatVersion: MARKDOWN_FIDELITY_BOUNDARY.formatVersion,
      status: 'accepted',
      fidelityBoundary: MARKDOWN_FIDELITY_BOUNDARY,
      warnings: [],
      unsupportedConstructs: [],
    },
  }
}
