import Link from 'next/link'

export default function PublicNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm font-semibold text-stone-500">404</p>
      <h1 className="mt-2 text-3xl font-bold">This published page was not found.</h1>
      <p className="mt-4 text-stone-600 dark:text-stone-300">
        It may be unpublished, scheduled, or no longer available.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded bg-red-700 px-4 py-2 font-semibold text-white"
      >
        Return home
      </Link>
    </main>
  )
}
