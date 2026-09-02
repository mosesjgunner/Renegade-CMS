import Link from 'next/link'

export default function PublicNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm font-semibold text-stone-500">404</p>
      <h1 className="mt-2 text-3xl font-bold">This published page was not found.</h1>
      <p className="mt-4 text-stone-600 dark:text-stone-300">
        It may be unpublished, scheduled, or no longer available.
      </p>
      <div className="mt-8 flex justify-center items-center gap-4">
        <Link
          href="/"
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white transition"
        >
          Return home
        </Link>
        <Link
          href="/search"
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 transition"
        >
          Search site
        </Link>
      </div>
    </main>
  )
}
