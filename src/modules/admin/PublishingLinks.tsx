import Link from 'next/link'

/** Task-oriented entry points backed by filtered views of the one content collection. */
export default function PublishingLinks() {
  return (
    <>
      <Link href="/admin/posts">Posts</Link>
      <Link href="/admin/pages">Pages</Link>
    </>
  )
}
