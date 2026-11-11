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
  // GUI-04H: the entry note used to restate the admin chrome ("Editing
  // a post. Back to posts") in database voice. One plain line instead.
  if (!kind) return <p>Choose Post or Page above before saving.</p>
  return (
    <p>
      You're writing a {kind} — it saves as you go.{' '}
      <Link href={`/admin/${kind === 'page' ? 'pages' : 'posts'}`}>All {kind}s</Link>
    </p>
  )
}
