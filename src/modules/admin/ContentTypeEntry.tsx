'use client'

import { useDocumentInfo, useField } from '@payloadcms/ui'
import Link from 'next/link'
import { useEffect } from 'react'

/** Keep the shared content editor aligned with the Post and Page entry points. */
export function ContentTypeEntry() {
  const { id } = useDocumentInfo()
  const { value, setValue } = useField<string>({ path: 'contentType' })

  useEffect(() => {
    if (id || value) return
    const requested = new URLSearchParams(window.location.search).get('contentType')
    if (requested === 'article' || requested === 'page') setValue(requested)
  }, [id, value, setValue])

  const kind = value === 'page' ? 'page' : value === 'article' ? 'post' : null
  if (!kind) return null
  return (
    <p>
      Editing a {kind}.{' '}
      <Link href={`/admin/${kind === 'page' ? 'pages' : 'posts'}`}>Back to {kind}s</Link>
    </p>
  )
}
