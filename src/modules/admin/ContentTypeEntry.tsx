'use client'

import { useField, useFormInitializing } from '@payloadcms/ui'
import Link from 'next/link'
import { useEffect } from 'react'

/** Keep the shared content editor aligned with the Post and Page entry points. */
export function ContentTypeEntry() {
  const { value, setValue } = useField<string>({ path: 'contentType' })
  const initializing = useFormInitializing()

  useEffect(() => {
    if (initializing || !window.location.pathname.endsWith('/create') || value) return
    const requested = new URLSearchParams(window.location.search).get('contentType')
    if (requested === 'article' || requested === 'page') setValue(requested)
  }, [initializing, value, setValue])

  const kind = value === 'page' ? 'page' : value === 'article' ? 'post' : null
  if (!kind) return <p>Choose Post or Page above before saving.</p>
  return (
    <p>
      Editing a {kind}.{' '}
      <Link href={`/admin/${kind === 'page' ? 'pages' : 'posts'}`}>Back to {kind}s</Link>
    </p>
  )
}
