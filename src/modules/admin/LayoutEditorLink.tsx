'use client'

import { useDocumentInfo } from '@payloadcms/ui'

export default function LayoutEditorLink() {
  const { id } = useDocumentInfo()
  return id ? (
    <a
      href={`/builder/${encodeURIComponent(String(id))}`}
      style={{ display: 'inline-block', margin: '12px 0', fontWeight: 600 }}
    >
      Open visual editor
    </a>
  ) : (
    <p>Save this layout to open the visual editor.</p>
  )
}
