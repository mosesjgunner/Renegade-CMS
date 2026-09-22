export default function MessagesPage() {
  return (
    <main className="container mx-auto max-w-3xl px-6 py-12">
      <h1>Messages</h1>
      <p>
        Group admins can manage the group name, avatar, members, and admin roles from group
        settings.
      </p>
      <section aria-label="Conversation security">
        <h2>Conversation security</h2>
        <p>Messages are protected in transit with TLS.</p>
        <p>Messages are protected at rest according to the server and storage configuration.</p>
        <p>Messages are not end-to-end encrypted.</p>
      </section>
    </main>
  )
}
