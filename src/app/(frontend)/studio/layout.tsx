import type { ReactNode } from 'react'
import { StudioNavigation } from '@/modules/creator-studio/StudioNavigation'

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StudioNavigation />
      {children}
    </>
  )
}
