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
  if (href.startsWith('/') || href.startsWith('#')) return href
  try {
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(href).protocol) ? href : null
  } catch {
    return null
  }
}
function Inline({ node }: { node: Node }): ReactNode {
  const content = nodes(node.children).length
    ? nodes(node.children).map((child, index) => <Inline key={index} node={child} />)
    : text(node.text)
  if (node.type === 'linebreak') return <br />
  if (node.type === 'link' || node.type === 'autolink') {
    const href = safeHref(node.url ?? node.href)
    return href ? (
      <a href={href} rel={href.startsWith('http') ? 'noreferrer' : undefined}>
        {content}
      </a>
    ) : (
      <>{content}</>
    )
  }
  const format = Number(node.format ?? 0)
  if (format & 1) return <strong>{content}</strong>
  if (format & 2) return <em>{content}</em>
  if (format & 16) return <code>{content}</code>
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
        return children.length ? <p key={key}>{children}</p> : null
      })}
    </div>
  )
}
