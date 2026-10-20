import type { ReactNode } from 'react'

type Node = Record<string, unknown>
const nodes = (value: unknown): Node[] =>
  Array.isArray(value)
    ? value.filter((node): node is Node => Boolean(node && typeof node === 'object'))
    : []
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const safeHref = (value: unknown): string | null => {
  const href = text(value).trim()
  if (!href || href.startsWith('javascript:') || href.startsWith('data:')) return null
  if (href.startsWith('//') || href.includes('\\')) return null
  if (href.startsWith('/') || href.startsWith('#')) return href
  try {
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(href).protocol) ? href : null
  } catch {
    return null
  }
}
function Inline({ node }: { node: Node }): ReactNode {
  let content: ReactNode = nodes(node.children).length
    ? nodes(node.children).map((child, index) => <Inline key={index} node={child} />)
    : text(node.text)
  if (node.type === 'linebreak') return <br />
  if (node.type === 'link' || node.type === 'autolink') {
    const fields = (node.fields ?? {}) as Node
    const href = safeHref(fields.url ?? node.url ?? node.href)
    return href ? (
      <a href={href} rel={href.startsWith('http') ? 'noreferrer' : undefined}>
        {content}
      </a>
    ) : (
      <>{content}</>
    )
  }
  const format = Number(node.format ?? 0)
  if (format & 16) content = <code>{content}</code>
  if (format & 8) content = <u>{content}</u>
  if (format & 4) content = <s>{content}</s>
  if (format & 2) content = <em>{content}</em>
  if (format & 1) content = <strong>{content}</strong>
  if (format & 32) content = <sub>{content}</sub>
  if (format & 64) content = <sup>{content}</sup>
  return <>{content}</>
}
/** Only safe, structured Lexical nodes are rendered; custom nodes cannot execute code or HTML. */
export function SafeRichText({ document }: { document: Record<string, unknown> }) {
  const root = (document.root ?? document) as Node
  return (
    <div className="prose dark:prose-invert max-w-none" role="article" aria-live="polite">
      {nodes(root.children).map((node, index) => {
        const key = String(node.__key ?? index)
        const children = nodes(node.children).map((child, childIndex) => (
          <Inline key={childIndex} node={child} />
        ))
        if (node.type === 'heading') {
          const tag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(text(node.tag))
            ? text(node.tag)
            : 'h2'
          const Heading = tag as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
          return (
            <Heading key={key} tabIndex={-1}>
              {children}
            </Heading>
          )
        }
        if (node.type === 'quote') return <blockquote key={key}>{children}</blockquote>
        if (node.type === 'list') {
          const List = node.listType === 'number' ? 'ol' : 'ul'
          return (
            <List key={key}>
              {nodes(node.children).map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline node={item} />
                </li>
              ))}
            </List>
          )
        }
        if (node.type === 'horizontalrule') return <hr key={key} />
        if (node.type === 'upload') {
          const val = (node.value && typeof node.value === 'object' ? node.value : {}) as Node
          const valId = text(val.id ?? node.value)
          const url = safeHref(val.url) || (valId ? `/media/${valId}` : '')
          const alt = text(val.altText ?? val.alt ?? val.title ?? '')
          const fields = (node.fields ?? {}) as Node
          const caption = text(fields.caption)
          return (
            <figure key={key} className="my-6">
              {url ? (
                <img
                  src={url}
                  alt={alt}
                  className="rounded-xl border border-stone-200 dark:border-stone-800 object-cover max-w-full h-auto"
                />
              ) : null}
              {caption ? (
                <figcaption className="text-center text-xs text-stone-500 dark:text-stone-400 mt-2">
                  {caption}
                </figcaption>
              ) : null}
            </figure>
          )
        }
        if (node.type === 'block') {
          const fields = (node.fields ?? {}) as Node
          const blockType = text(fields.blockType) || 'block'
          const blockText = text(fields.text ?? fields.message ?? fields.content ?? '')
          const title = text(fields.title ?? '')
          const caption = text(fields.caption ?? '')
          const url = safeHref(fields.url ?? fields.src ?? '')
          return (
            <div
              key={key}
              className={`my-6 p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 block-${blockType}`}
              data-block-type={blockType}
            >
              {title ? <h4 className="font-bold text-sm mb-1">{title}</h4> : null}
              {url ? (
                <figure className="my-2">
                  <img
                    src={url}
                    alt={title || caption || ''}
                    className="rounded-lg max-w-full h-auto"
                  />
                  {caption ? (
                    <figcaption className="text-xs text-stone-500 mt-1">{caption}</figcaption>
                  ) : null}
                </figure>
              ) : null}
              {blockText ? <p className="text-sm">{blockText}</p> : null}
              {children.length ? <div>{children}</div> : null}
            </div>
          )
        }
        if (node.type === 'relationship') {
          const val = (node.value && typeof node.value === 'object' ? node.value : {}) as Node
          const valId = text(val.id ?? node.value)
          const rel = text(node.relationTo)
          if (rel === 'media-assets') {
            const url = safeHref(val.url) || (valId ? `/media/${valId}` : '')
            const alt = text(val.altText ?? val.title ?? '')
            return (
              <figure key={key} className="my-6">
                {url ? (
                  <img
                    src={url}
                    alt={alt}
                    className="rounded-xl border border-stone-200 dark:border-stone-800 object-cover max-w-full h-auto"
                  />
                ) : null}
              </figure>
            )
          }
          const title = text(val.title ?? val.name ?? valId)
          return (
            <div
              key={key}
              className="my-4 p-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 inline-block"
            >
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                {rel}:
              </span>{' '}
              <span className="font-medium">{title}</span>
            </div>
          )
        }
        return children.length ? <p key={key}>{children}</p> : null
      })}
    </div>
  )
}
