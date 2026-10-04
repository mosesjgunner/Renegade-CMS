import Link from 'next/link'

export default function UnavailableWorkspace({ title, reason }: { title: string; reason: string }) {
  return (
    <main className="gutter--left gutter--right">
      <h1>{title}</h1>
      <p role="status">{reason}</p>
      <p>
        No provider connection, delivery, or successful execution is reported by this workspace.
      </p>
      <Link href="/admin/capabilities">Review capabilities and connections</Link>
    </main>
  )
}
