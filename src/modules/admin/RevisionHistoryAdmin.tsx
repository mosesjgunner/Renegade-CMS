'use client'

import { useEffect, useState } from 'react'
import RevisionHistory from './RevisionHistory'

export default function RevisionHistoryAdmin() {
  const [contentId, setContentId] = useState<string | null>(null)

  useEffect(() => {
    setContentId(new URLSearchParams(window.location.search).get('contentId')?.trim() ?? '')
  }, [])

  if (contentId === null) return null
  if (!contentId) {
    return <p className="gutter--left gutter--right">Open history from a Post or Page.</p>
  }
  return <RevisionHistory contentId={contentId} />
}
