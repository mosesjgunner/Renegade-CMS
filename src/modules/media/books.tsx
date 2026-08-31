import Link from 'next/link'

import { extractPlainText } from '../editorial/presentation'
import { bookNavigation } from './contracts'

type RecordDoc = Record<string, unknown>
const idOf = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')

export function isReleasedChapter(chapter: RecordDoc, now = new Date()) {
  return (
    ['published', 'updated'].includes(String(chapter.status)) &&
    (!chapter.releaseAt || new Date(String(chapter.releaseAt)) <= now) &&
    (!chapter.publishedAt || new Date(String(chapter.publishedAt)) <= now)
  )
}

export function BookReader(input: {
  book: RecordDoc
  chapter?: RecordDoc
  chapters: RecordDoc[]
  article?: RecordDoc | null
}) {
  const released = input.chapters.filter((chapter) => isReleasedChapter(chapter)).sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder))
  const currentId = input.chapter ? String(input.chapter.id) : ''
  const navigation = input.chapter
    ? bookNavigation(released.map((item) => ({ id: String(item.id), displayOrder: Number(item.displayOrder), releaseAt: typeof item.releaseAt === 'string' ? item.releaseAt : null })), currentId)
    : null
  const previous = input.chapters.find((item) => String(item.id) === navigation?.previous?.id)
  const next = input.chapters.find((item) => String(item.id) === navigation?.next?.id)
  const footnotes = Array.isArray(input.chapter?.footnotes) ? input.chapter.footnotes as RecordDoc[] : []
  const bibliography = Array.isArray(input.article?.bibliography) ? input.article.bibliography as RecordDoc[] : []
  const content = input.article ? extractPlainText(input.article.document) : ''
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm"><Link href="/">Home</Link> / <span aria-current="page">{String(input.book.title)}</span></nav>
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide">Book</p>
        <h1 className="text-4xl font-black">{input.chapter ? String(input.chapter.title) : String(input.book.title)}</h1>
        {input.chapter ? <p><Link href={String(input.book.canonicalPath)}>Back to table of contents</Link></p> : typeof input.book.description === 'string' ? <p>{input.book.description}</p> : null}
      </header>
      <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
        <aside aria-label="Table of contents" className="surface-card p-5 h-fit">
          <h2 className="font-bold">Contents</h2>
          <ol className="mt-3 space-y-2">
            {released.map((item) => <li key={String(item.id)}><Link aria-current={String(item.id) === currentId ? 'page' : undefined} href={String(item.canonicalPath)}>{String(item.title)}</Link></li>)}
          </ol>
        </aside>
        <article className="surface-card p-7 space-y-6" aria-label={input.chapter ? `Chapter: ${String(input.chapter.title)}` : 'Book overview'}>
          {input.chapter ? <>
            <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">{content || 'This chapter has no public manuscript yet.'}</div>
            {footnotes.length ? <section aria-labelledby="footnotes"><h2 id="footnotes">Footnotes</h2><ol>{footnotes.map((note, index) => <li key={String(note.id ?? index)}>{String(note.text ?? note.citation ?? '')}</li>)}</ol></section> : null}
            {bibliography.length ? <section aria-labelledby="sources"><h2 id="sources">Sources</h2><ol>{bibliography.map((entry, index) => <li key={String(entry.id ?? index)}>{String(entry.label ?? entry.title ?? '')}</li>)}</ol></section> : null}
            <nav aria-label="Chapter navigation" className="flex justify-between border-t pt-5">
              {previous ? <Link href={String(previous.canonicalPath)}>Previous: {String(previous.title)}</Link> : <span />}
              {next ? <Link href={String(next.canonicalPath)}>Next: {String(next.title)}</Link> : <span />}
            </nav>
          </> : <p>Select a chapter to begin reading.</p>}
        </article>
      </div>
    </main>
  )
}

export const relatedId = idOf
