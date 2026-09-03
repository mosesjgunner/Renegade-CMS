import Link from 'next/link'

/** Task-oriented entry points backed by filtered views of the one content collection. */
export default function PublishingLinks() {
  return (
    <>
      <Link href="/admin">Dashboard</Link>
      <Link href="/admin/posts">Posts</Link>
      <Link href="/admin/pages">Pages</Link>
      <Link href="/admin/collections/media-assets">Media</Link>
      <Link href="/admin/navigation">Menus</Link>
      <Link href="/admin/globals/site-settings">Site Settings</Link>
      <Link href="/admin/collections/public-redirects">Redirects</Link>
      <Link href="/" target="_blank" rel="noreferrer">
        View Site
      </Link>
    </>
  )
}
