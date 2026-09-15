import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function GuidedSetupLayout({ children }: { children: ReactNode }) {
  return children
}
