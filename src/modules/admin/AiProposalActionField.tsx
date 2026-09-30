'use client'

import { useDocumentInfo } from '@payloadcms/ui'

function Links({ items }: { items: readonly [string, string][] }) {
  const { id } = useDocumentInfo()
  if (!id) return <p>Save this draft before requesting AI proposals.</p>
  return (
    <div style={{ padding: 12, border: '1px solid var(--theme-elevation-150)', borderRadius: 6 }}>
      <strong>AI proposals</strong>
      <p>Preview the exact source context, then review or decline before any change is applied.</p>
      {items.map(([task, label]) => (
        <a
          key={task}
          style={{ marginRight: 16 }}
          href={`/admin/ai?task=${encodeURIComponent(task)}&targetId=${encodeURIComponent(String(id))}`}
        >
          {label}
        </a>
      ))}
    </div>
  )
}

export function AiContentActionField() {
  return (
    <Links
      items={[
        ['editor.improve-selection', 'Revise draft passage'],
        ['intelligence.metadata-seo', 'Suggest Discovery metadata'],
      ]}
    />
  )
}
export function AiMediaActionField() {
  return <Links items={[['media.alt-text', 'Suggest alt text from metadata']]} />
}
export function AiDistributionActionField() {
  return <Links items={[['distribution.copy-variants', 'Suggest copy variants']]} />
}
