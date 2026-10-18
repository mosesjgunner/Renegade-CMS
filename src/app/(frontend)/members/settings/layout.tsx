import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Member Settings',
  robots: { index: false, follow: false },
}

export default function MemberSettingsLayout({ children }: { children: ReactNode }) {
  return children
}
