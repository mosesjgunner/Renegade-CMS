import Link from 'next/link'

export default function CalendarPage() {
  return (
    <main>
      <h1>Interactive calendar deferred for RC</h1>
      <p>
        The full calendar workspace is incomplete. Operators can inspect persisted schedules in
        Editorial Workflow and Releases.
      </p>
      <Link href="/admin/workflow">Editorial Workflow</Link>{' '}
      <Link href="/admin/releases">Releases</Link>
    </main>
  )
}
