import Link from 'next/link'

export default function RoomNotFound() {
  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6">
      <h1 className="text-2xl font-bold">Room unavailable</h1>
      <p>Sign in with an account that has access to this room.</p>
      <Link href="/login">Sign in</Link>
    </main>
  )
}
