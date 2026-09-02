import type { EditorialPresentation } from './persistence'
import Image from 'next/image'
import { SafeRichText } from './RichText'

export function EditorialArticleView({ article }: { article: EditorialPresentation }) {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-4 sm:px-6 lg:px-8 py-12 md:py-16"
      data-preview={article.preview ? 'true' : 'false'}
      data-preview-mode={article.previewMode}
    >
      {/* Header & Meta */}
      <header className="space-y-6 border-b border-stone-200 dark:border-stone-800 pb-8">
        <div className="flex flex-wrap items-center gap-2">
          {article.preview ? (
            <span className="badge badge-brand">
              Preview Mode: {article.previewMode ?? 'draft'}
            </span>
          ) : (
            <span className="badge badge-neutral">Published</span>
          )}
          <span className="badge badge-info">⏱️ {article.readingTimeMinutes} min read</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-stone-950 dark:text-stone-50 font-display leading-[1.15]">
          {article.title}
        </h1>

        {article.subtitle ? (
          <p className="text-xl sm:text-2xl text-stone-600 dark:text-stone-300 font-display italic leading-relaxed">
            {article.subtitle}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-stone-100 dark:border-stone-800/80 text-xs text-stone-500 dark:text-stone-400">
          <div className="flex flex-wrap items-center gap-3">
            {article.authors.length ? (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-800 dark:text-stone-200">By</span>
                <div className="flex flex-wrap gap-1.5">
                  {article.authors.map((author) => (
                    <span
                      key={author}
                      className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 font-medium text-stone-700 dark:text-stone-300"
                    >
                      {author}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3 font-code text-[11px]">
            {article.firstPublishedAt ? (
              <span>Published: {new Date(article.firstPublishedAt).toLocaleDateString()}</span>
            ) : null}
            {article.updatedAt ? (
              <span>Updated: {new Date(article.updatedAt).toLocaleDateString()}</span>
            ) : null}
          </div>
        </div>

        {article.excerpt ? (
          <div className="p-4 rounded-xl bg-stone-100/80 dark:bg-stone-900/60 border-l-4 border-red-600 text-stone-700 dark:text-stone-300 text-base sm:text-lg leading-relaxed">
            {article.excerpt}
          </div>
        ) : null}
        {article.heroMedia ? (
          <Image
            src={article.heroMedia.url}
            alt={article.heroMedia.altText}
            width={article.heroMedia.width ?? 1200}
            height={article.heroMedia.height ?? 675}
            sizes="(max-width: 1024px) 100vw, 896px"
            className="w-full rounded-xl border border-stone-200 object-cover dark:border-stone-800"
          />
        ) : null}
      </header>

      {/* Table of Contents */}
      {article.tableOfContents.length ? (
        <nav
          aria-label="Table of contents"
          className="surface-card p-6 border-stone-200 dark:border-stone-800"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <span>📑</span>
            <h2>Table of Contents</h2>
          </div>
          <ol className="mt-4 space-y-2 text-sm">
            {article.tableOfContents.map((entry) => (
              <li
                key={entry.id}
                data-level={entry.level}
                className={`transition-colors hover:text-red-600 ${
                  entry.level === 1
                    ? 'font-semibold text-stone-900 dark:text-stone-100'
                    : 'pl-4 text-stone-600 dark:text-stone-400'
                }`}
              >
                <a href={`#${entry.id}`} className="hover:underline">
                  {entry.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {/* Article Body */}
      <article className="text-base sm:text-lg leading-8 text-stone-800 dark:text-stone-200 font-sans">
        {article.bodyText ? (
          <SafeRichText document={article.body} />
        ) : (
          <p>This content has no body yet.</p>
        )}
      </article>

      {/* Taxonomy Tags */}
      {article.taxonomy.sections.length ||
      article.taxonomy.categories.length ||
      article.taxonomy.topics.length ||
      article.taxonomy.tags.length ||
      article.taxonomy.series.length ? (
        <section className="surface-card p-6 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Categorization & Topics
          </h2>
          <div className="flex flex-wrap gap-2">
            {article.taxonomy.sections.map((item) => (
              <span key={item} className="badge badge-brand">
                Section: {item}
              </span>
            ))}
            {article.taxonomy.categories.map((item) => (
              <span key={item} className="badge badge-neutral">
                Category: {item}
              </span>
            ))}
            {article.taxonomy.topics.map((item) => (
              <span key={item} className="badge badge-info">
                Topic: {item}
              </span>
            ))}
            {article.taxonomy.tags.map((item) => (
              <span
                key={item}
                className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300"
              >
                #{item}
              </span>
            ))}
            {article.taxonomy.series.map((item) => (
              <span
                key={item}
                className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs font-semibold text-purple-700 dark:text-purple-300"
              >
                Series: {item}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* Citations & Sources */}
      {article.citations.length ? (
        <section className="surface-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <span>📚</span>
            <h2>Citations & Sources</h2>
          </div>
          <ol className="space-y-3 text-sm divide-y divide-stone-100 dark:divide-stone-800">
            {article.citations.map((citation) => (
              <li key={citation.citationId} className="pt-3 first:pt-0 flex items-start gap-3">
                <span className="font-code font-bold text-xs px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                  [{citation.ordinal}]
                </span>
                <div className="space-y-0.5">
                  <p className="font-medium text-stone-900 dark:text-stone-100">
                    {citation.sourceTitle}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Ref: {citation.bibliographyKey}
                    {citation.locator ? ` • ${citation.locator}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Corrections */}
      {article.correctionNotices.length ? (
        <section className="p-6 rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            <span>⚠️</span>
            <h2>Correction Notices</h2>
          </div>
          {article.correctionNotices.map((notice) => (
            <div
              key={`${notice.label}:${notice.issuedAt}`}
              className="text-sm border-l-2 border-amber-500 pl-3 space-y-1"
            >
              <p className="font-semibold">{notice.label}</p>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90">{notice.detail}</p>
            </div>
          ))}
        </section>
      ) : null}

      {/* Change Notes */}
      {article.changeNotes.length ? (
        <section className="surface-card p-6 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Editorial Revision History
          </h2>
          <div className="space-y-2 text-sm text-stone-700 dark:text-stone-300 divide-y divide-stone-100 dark:divide-stone-800">
            {article.changeNotes.map((note) => (
              <div
                key={`${note.summary}:${note.issuedAt}`}
                className="pt-2 first:pt-0 flex items-center justify-between text-xs"
              >
                <span>{note.summary}</span>
                <span className="font-code text-stone-400">
                  {new Date(note.issuedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
