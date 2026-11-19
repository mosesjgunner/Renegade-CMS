'use client'

import { useDocumentInfo } from '@payloadcms/ui'

/**
 * The door from a podcast show record to its Studio: a plain link to
 * /studio/<show id>. The Studio page itself enforces staff role +
 * operator site access — this field only renders the link; it grants
 * nothing. On the create view there is no show yet, so it shows the
 * save-first hint instead.
 */
export function OpenStudioField() {
  const { id } = useDocumentInfo()

  if (!id) {
    return (
      <div
        style={{
          padding: '1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          backgroundColor: '#f9fafb',
          margin: '1rem 0',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Podcast Studio</h4>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
          Save the show first, then open its Studio.
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        backgroundColor: '#f9fafb',
        margin: '1rem 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Podcast Studio</h4>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
            Record, go live, and edit this show in its Studio.
          </p>
        </div>
        <a
          href={`/studio/${encodeURIComponent(String(id))}`}
          style={{
            padding: '0.4rem 0.9rem',
            backgroundColor: '#2563eb',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '0.85rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Open Studio
        </a>
      </div>
    </div>
  )
}
