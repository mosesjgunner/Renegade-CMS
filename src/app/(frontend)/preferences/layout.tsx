import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Preferences',
  robots: { index: false, follow: false },
}

export default function PreferencesLayout({ children }: { children: ReactNode }) {
  return children
}
