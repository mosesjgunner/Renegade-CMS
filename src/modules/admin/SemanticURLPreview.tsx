'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type Preview = { path: string | null; willRedirect: boolean; error?: string }

export function SemanticURLPreview() {
  const { id } = useDocumentInfo()
  const { slug, contentType, site } = useFormFields(([fields]) => ({
    slug: fields.slug?.value,
    contentType: fields.contentType?.value,
    site: fields.site?.value,
  }))
  const siteId =
    typeof site === 'string'
      ? site
      : site && typeof site === 'object' && 'value' in site
        ? String((site as { value: unknown }).value ?? '')
        : ''
  const [preview, setPreview] = useState<Preview | null>(null)

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      void fetch('/api/admin/semantic-url/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, contentType, id, siteId }),
      })
        .then(async (response) => {
          const body = (await response.json()) as Preview
          if (!response.ok) throw new Error(body.error || 'URL preview is unavailable.')
          if (active) setPreview(body)
        })
        .catch((error: unknown) => {
          if (active)
            setPreview({
              path: null,
              willRedirect: false,
              error: error instanceof Error ? error.message : 'URL preview is unavailable.',
            })
        })
    }, 150)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [slug, contentType, id, siteId])

  return (
    <section
      aria-live="polite"
      style={{ padding: 12, border: '1px solid var(--theme-elevation-150)', borderRadius: 6 }}
    >
      <strong>Public URL preview</strong>
      <div>{preview?.error || preview?.path || 'Enter a slug to preview the public URL.'}</div>
      {preview?.willRedirect ? (
        <p role="status">
          Saving this published URL change will create a permanent redirect from its current path.
        </p>
      ) : null}
    </section>
  )
}
