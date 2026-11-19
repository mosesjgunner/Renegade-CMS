import type { ReactNode } from 'react'

/**
 * POD-18: root layout for embed routes ONLY (route group `(embed)`).
 * Deliberately chrome-free — no site header, navigation, or footer —
 * so an episode embed renders as a bare player inside a third-party
 * iframe. This group must keep its own <html>/<body> (Next multiple
 * root layouts via route groups).
 */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a0a', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
