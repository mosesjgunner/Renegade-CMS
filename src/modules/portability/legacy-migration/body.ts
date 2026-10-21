import { parseContentAndArtifacts } from './parser'

/** Bounded conversion: paragraphs, headings, quotes and acquired images.
 * Unsupported executable/plugin markup stays in quarantine. Other HTML is
 * reduced to text; it is never injected into a public document.
 */
export function legacyBodyToLexical(html: string) {
  const { parsedBlocks } = parseContentAndArtifacts(html, 'Imported body')
  const text = (value: string) =>
    value
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  const children = parsedBlocks.flatMap((block): Record<string, unknown>[] => {
    if (block.type === 'image') {
      const id = block.mediaUrl?.match(/^\/media\/([a-zA-Z0-9-]+)$/)?.[1]
      return id
        ? [{ type: 'upload', version: 3, relationTo: 'media-assets', value: id, fields: {} }]
        : []
    }
    return [
      {
        type: block.type === 'heading' ? 'heading' : block.type === 'quote' ? 'quote' : 'paragraph',
        ...(block.type === 'heading'
          ? { tag: `h${Math.min(6, Math.max(1, block.level ?? 2))}` }
          : {}),
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [
          {
            type: 'text',
            version: 1,
            text: text(block.content),
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
          },
        ],
      },
    ]
  })
  return {
    root: {
      type: 'root',
      version: 1,
      format: '' as const,
      indent: 0,
      direction: 'ltr' as const,
      children,
    },
  }
}
