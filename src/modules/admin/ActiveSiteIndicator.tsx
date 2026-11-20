/**
 * Shared active-site indicator (UXI-07): every operator surface names
 * the site it acts on, by its friendly name — never by slug or ID.
 * Presentational only (no hooks), so server layouts and client pages
 * render the same component.
 */
export function ActiveSiteIndicator({
  siteName,
  visibility,
}: {
  siteName: string
  visibility?: 'public' | 'coming-soon' | 'private'
}) {
  return (
    <p
      aria-label="Active site"
      className="inline-flex items-center gap-2 rounded-full border border-stone-300 dark:border-stone-700 px-3 py-1 text-xs text-stone-700 dark:text-stone-200"
    >
      <span aria-hidden="true">●</span>
      <span>
        Site: <strong>{siteName}</strong>
      </span>
      {visibility && visibility !== 'public' ? (
        <span className="text-stone-500 dark:text-stone-400">
          (
          {visibility === 'coming-soon'
            ? 'coming soon — visitors see a holding page'
            : 'private — visitors see a holding page'}
          )
        </span>
      ) : null}
    </p>
  )
}
