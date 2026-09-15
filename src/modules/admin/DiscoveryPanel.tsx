'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type SchemaInspectionNode = {
  type: string
  id: string
  role:
    | 'primary'
    | 'identity'
    | 'website'
    | 'webpage'
    | 'breadcrumb'
    | 'author'
    | 'media'
    | 'extension'
  fields: Array<{
    field: string
    value: string | number | boolean | null
    sourceField?: string
  }>
}

type SchemaValidationIssue = {
  nodeType: string
  field: string
  severity: 'error' | 'warning'
  message: string
  repairField?: string
}

type Inspection = {
  document: {
    canonicalUrl: string
    indexability: { indexable: boolean; reason: string }
    resolved?: Record<
      string,
      {
        value: string | boolean | null
        source: string
        fallbackChain: string[]
        warning: string | null
        repairField: string
      }
    >
    schema?: {
      eligible: boolean
      schemaType: string
      fallbackType?: string
      eligibilityReason: string
      validationIssues?: SchemaValidationIssue[]
      inspection?: {
        eligible: boolean
        primaryType: string
        fallbackType?: string
        eligibilityReason: string
        nodes: SchemaInspectionNode[]
        validationIssues: SchemaValidationIssue[]
      }
    }
    issues: Array<{ evidence: string; repairTarget: string }>
  }
  preview: {
    search: {
      siteName: string
      url: string
      title: string
      description: string
      titleTruncated: boolean
      descriptionTruncated: boolean
    }
    openGraph: { title: string; description: string | null; image: string | null }
    twitter: { card: string; title: string; image: string | null }
    warnings: string[]
  }
}

export function DiscoveryPanel() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id) return
    let active = true
    void fetch(`/api/admin/discovery?id=${encodeURIComponent(String(id))}`)
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Preview unavailable.')
        if (active) setInspection(body)
      })
      .catch(
        (reason: unknown) =>
          active && setError(reason instanceof Error ? reason.message : 'Preview unavailable.'),
      )
    return () => {
      active = false
    }
  }, [id, lastUpdateTime])
  if (!id) return <p>Save this content once to see its resolved discovery values and previews.</p>
  if (error) return <p role="alert">{error}</p>
  if (!inspection) return <p>Resolving public discovery output…</p>
  const repair = (field: string) => {
    const element = document.querySelector<HTMLElement>(
      `[name="${CSS.escape(field)}"], #field-${CSS.escape(field)}`,
    )
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element?.focus()
  }
  return (
    <section aria-label="Discovery preview" style={{ display: 'grid', gap: 16 }}>
      <div style={{ padding: 12, border: '1px solid var(--theme-elevation-150)', borderRadius: 6 }}>
        <strong>
          {inspection.document.indexability.indexable ? 'Indexable' : 'Not indexable'}
        </strong>
        {' — '}
        {inspection.document.indexability.reason}
        <div>{inspection.document.canonicalUrl}</div>
      </div>
      <details open>
        <summary>Resolved values and where they come from</summary>
        {Object.entries(inspection.document.resolved || {}).map(([name, item]) => (
          <div key={name} style={{ marginBlock: 12 }}>
            <strong>{name}</strong>: {String(item.value ?? 'Not set')}{' '}
            <small>({item.source})</small>
            <br />
            <small>Fallback: {item.fallbackChain.join(' → ')}</small>
            {item.warning && <p role="alert">{item.warning}</p>}
            <button type="button" onClick={() => repair(item.repairField)}>
              Repair {name}
            </button>
          </div>
        ))}
      </details>
      {inspection.document.schema && (
        <details open>
          <summary>Schema Graph & Rich Snippet Eligibility</summary>
          <div style={{ marginBlock: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.85em',
                  fontWeight: 600,
                  backgroundColor: inspection.document.schema.eligible
                    ? 'rgba(46, 125, 50, 0.15)'
                    : 'rgba(211, 47, 47, 0.15)',
                  color: inspection.document.schema.eligible ? '#2e7d32' : '#d32f2f',
                }}
              >
                {inspection.document.schema.eligible ? 'Eligible' : 'Ineligible'}
              </span>
              <strong>Type: {inspection.document.schema.schemaType}</strong>
              {inspection.document.schema.fallbackType && (
                <small style={{ color: 'var(--theme-elevation-600)' }}>
                  (Fallback to {inspection.document.schema.fallbackType})
                </small>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '0.9em', color: 'var(--theme-elevation-700)' }}>
              Reason: <code>{inspection.document.schema.eligibilityReason}</code>
            </p>

            {/* Validation Issues & Direct Field Repairs */}
            {(inspection.document.schema.validationIssues?.length ?? 0) > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: '0.9em' }}>Schema Issues:</strong>
                {inspection.document.schema.validationIssues!.map((issue, idx) => (
                  <div
                    key={idx}
                    role="alert"
                    style={{
                      marginBlock: 4,
                      padding: 8,
                      borderRadius: 4,
                      fontSize: '0.85em',
                      backgroundColor:
                        issue.severity === 'error'
                          ? 'rgba(211, 47, 47, 0.08)'
                          : 'rgba(237, 108, 2, 0.08)',
                      border: `1px solid ${
                        issue.severity === 'error'
                          ? 'rgba(211, 47, 47, 0.3)'
                          : 'rgba(237, 108, 2, 0.3)'
                      }`,
                    }}
                  >
                    <span>
                      <strong>
                        [{issue.nodeType} · {issue.field}]
                      </strong>{' '}
                      {issue.message}
                    </span>
                    {issue.repairField && (
                      <button
                        type="button"
                        onClick={() => repair(issue.repairField!)}
                        style={{ marginLeft: 8 }}
                      >
                        Repair {issue.repairField}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Graph Nodes & Mapped Visible Content Fields */}
            {inspection.document.schema.inspection?.nodes && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: '0.9em' }}>Coherent Graph Nodes:</strong>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {inspection.document.schema.inspection.nodes.map((node) => (
                    <div
                      key={node.id}
                      style={{
                        padding: 8,
                        border: '1px solid var(--theme-elevation-200)',
                        borderRadius: 4,
                        fontSize: '0.85em',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 4,
                        }}
                      >
                        <span>
                          <strong>{node.type}</strong> ({node.role})
                        </span>
                        <code style={{ fontSize: '0.8em' }}>{node.id}</code>
                      </div>
                      {node.fields.length > 0 && (
                        <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
                          {node.fields
                            .filter((f) => f.value !== null && f.value !== undefined)
                            .map((f, fIdx) => (
                              <div key={fIdx} style={{ color: 'var(--theme-elevation-700)' }}>
                                <code>{f.field}</code>: {String(f.value)}
                                {f.sourceField && (
                                  <small style={{ marginLeft: 6, fontStyle: 'italic' }}>
                                    ← from {f.sourceField}
                                  </small>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
      <details open>
        <summary>Search result preview</summary>
        <p>
          <small>
            {inspection.preview.search.siteName} · {inspection.preview.search.url}
          </small>
          <br />
          <strong>{inspection.preview.search.title}</strong>
          <br />
          {inspection.preview.search.description}
        </p>
        {(inspection.preview.search.titleTruncated ||
          inspection.preview.search.descriptionTruncated) && (
          <p role="alert">The public search preview is truncated at the displayed boundary.</p>
        )}
      </details>
      <details>
        <summary>Social card previews</summary>
        <p>
          <strong>Open Graph</strong>
          <br />
          {inspection.preview.openGraph.title}
          <br />
          {inspection.preview.openGraph.description}
        </p>
        {inspection.preview.openGraph.image && (
          // This intentionally displays the exact resolver-selected public variant.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Eligible social preview"
            src={inspection.preview.openGraph.image}
            style={{ maxWidth: 480, width: '100%' }}
          />
        )}
        <p>
          <strong>Twitter/X · {inspection.preview.twitter.card}</strong>
          <br />
          {inspection.preview.twitter.title}
        </p>
      </details>
      {inspection.document.issues.length > 0 && (
        <details open>
          <summary>Warnings and repairs</summary>
          {inspection.document.issues.map((issue, index) => (
            <p key={index} role="alert">
              {issue.evidence}{' '}
              <button type="button" onClick={() => repair(issue.repairTarget)}>
                Repair
              </button>
            </p>
          ))}
        </details>
      )}
    </section>
  )
}
