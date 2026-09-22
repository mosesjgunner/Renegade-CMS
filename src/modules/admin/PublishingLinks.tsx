import Link from 'next/link'

/** Task-oriented entry points backed by filtered views of the one content collection. */
export default function PublishingLinks() {
  return (
    <>
      <Link href="/admin">Dashboard</Link>
      <Link href="/admin/posts">Posts</Link>
      <Link href="/admin/pages">Pages</Link>
      <Link href="/admin/media-library">Media</Link>
      <Link href="/admin/collections/podcast-shows">Podcasts</Link>
      <Link href="/admin/navigation">Menus</Link>
      <Link href="/admin/indexing">Indexing</Link>
      <Link href="/admin/globals/site-settings">Site Settings</Link>
      <Link href="/admin/redirects">Redirects</Link>
      <Link href="/admin/rendered-quality">Rendered Quality</Link>
      <Link href="/admin/workflow">Editorial Workflow</Link>
      <Link href="/admin/releases">Releases</Link>
      <Link href="/admin/social">Social Distribution</Link>
      <Link href="/admin/email-composer">Email Composer</Link>
      <Link href="/admin/audience">Audience Command Center</Link>
      <Link href="/" target="_blank" rel="noreferrer">
        View Site
      </Link>
    </>
  )
}
