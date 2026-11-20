import Link from 'next/link'

import type { SiteVisibility } from './site-visibility'

/**
 * The designed holding page for a site whose visibility is
 * `coming-soon` or `private` (UXI-06). It deliberately carries only the
 * site name and a plain note — no site content, no navigation into the
 * site, no draft or unpublished material. `private` adds a sign-in
 * link so staff can reach the preview path.
 */
export function ComingSoonPage({
  siteName,
  visibility,
}: {
  siteName: string
  visibility: Exclude<SiteVisibility, 'public'>
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-red-700 dark:text-red-300">
        {visibility === 'private' ? 'Private site' : 'Coming soon'}
      </p>
      <h1 className="mt-4 text-4xl font-black tracking-tight text-stone-950 dark:text-white font-display">
        {siteName}
      </h1>
      <p className="mt-4 text-base text-stone-600 dark:text-stone-300">
        {visibility === 'private'
          ? 'This site is being worked on privately and is not open to visitors yet. If you help run this site, sign in to preview it.'
          : 'This site is being prepared and is not open to visitors yet. Please check back soon.'}
      </p>
      {visibility === 'private' ? (
        <p className="mt-8">
          <Link href="/login" className="btn btn-primary text-sm px-5 py-2.5">
            Sign in to preview
          </Link>
        </p>
      ) : null}
    </main>
  )
}
