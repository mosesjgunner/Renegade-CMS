import Link from 'next/link'

export default function StudioPortabilityPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <h1 className="text-3xl font-bold">Export my Studio data</h1>
      <p>
        Download an index of your projects, portfolio collections, membership reference, catalog
        releases, and linked video records.
      </p>
      <Link
        className="btn btn-primary"
        href="/api/creator-studio/portability"
        prefetch={false}
        download
      >
        Download Studio index
      </Link>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Restore a project</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            Download the project file from the{' '}
            <Link className="underline" href="/studio/media-edit">
              media editor
            </Link>{' '}
            or the portfolio file from{' '}
            <Link className="underline" href="/studio/portfolio">
              My Portfolio
            </Link>
            .
          </li>
          <li>
            Restore its files through{' '}
            <Link className="underline" href="/studio/create/upload">
              Upload
            </Link>{' '}
            using the checksum shown beside each exported file. The importer matches only files in
            your own library.
          </li>
          <li>Import the file from the same editor. The restored project starts as a new draft.</li>
        </ol>
        <p>
          The project file includes captions and edit instructions. Exporting the index does not
          transfer memberships, purchases, or provider connections.
        </p>
      </section>
    </main>
  )
}
