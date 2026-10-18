import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Member Authentication',
  robots: { index: false, follow: false },
}

export default function MemberAuthLayout({ children }: { children: ReactNode }) {
  return children
}
