'use client'
import Link from 'next/link'
export default function EmailComposer() {
  return (
    <main style={{ maxWidth: 900, padding: 24 }}>
      <h1>Email composer</h1>
      <p>
        Author a versioned email design using governed media and pinned content projections. Website
        themes, arbitrary HTML, JavaScript, and CSS are not available here.
      </p>
      <p>
        Create templates and messages in the Audience collections, then use the renderer snapshot
        before requesting review.
      </p>
      <ul>
        <li>Personalization uses a typed allowlist and preview fallbacks.</li>
        <li>
          Recipient and mailbox views are labeled approximations; authorized test sends use the real
          provider boundary.
        </li>
        <li>Any design, template, or source-rebase edit requires review again.</li>
      </ul>
      <Link href="/admin/collections/email-messages">Open messages</Link>
    </main>
  )
}
