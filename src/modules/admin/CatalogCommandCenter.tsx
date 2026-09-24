'use client'
import { useEffect, useMemo, useState } from 'react'

type Item = {
  document: Record<string, unknown>
  portable: Record<string, unknown>
  readiness: { ready: boolean; blockers: string[]; warnings: string[] }
}

export default function CatalogCommandCenter() {
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('Loading catalog…')
  const [importText, setImportText] = useState('[]')
  const refresh = async () => {
    const response = await fetch('/api/admin/catalog')
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    setItems(body.products)
    setMessage(`${body.products.length} products loaded.`)
  }
  useEffect(() => {
    void refresh().catch((error) => setMessage(String(error)))
  }, [])
  const exportValue = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => item.portable),
        null,
        2,
      ),
    [items],
  )
  const transition = async (productId: string, action: string) => {
    setMessage(`${action}…`)
    const response = await fetch('/api/admin/catalog', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, action }),
    })
    const body = await response.json()
    if (!response.ok) return setMessage(body.error)
    await refresh()
  }
  const archive = async () => {
    const response = await fetch('/api/admin/catalog', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productIds: selected }),
    })
    const body = await response.json()
    setMessage(
      response.ok
        ? `Archived ${body.archived.length} products. ${body.warnings.filter((item: { dependencies: string[] }) => item.dependencies.length).length} have retained dependencies.`
        : body.error,
    )
    if (response.ok) {
      setSelected([])
      await refresh()
    }
  }
  const runImport = async (mode: 'dry-run' | 'apply') => {
    try {
      const products = JSON.parse(importText)
      const response = await fetch('/api/admin/catalog/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ products, mode, source: 'catalog-command-center' }),
      })
      const body = await response.json()
      setMessage(
        response.ok
          ? `${mode}: ${body.plan.creates.length} create, ${body.plan.updates.length} update, ${body.plan.unchanged.length} unchanged, ${body.plan.errors.length} errors${body.replay ? ' (replay)' : ''}.`
          : body.error,
      )
      if (response.ok && mode === 'apply') await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invalid import JSON.')
    }
  }
  return (
    <main className="max-w-7xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-3xl font-black">Catalog</h1>
        <p>Readiness, previews, revisions, lifecycle, dependencies and portable import/export.</p>
      </header>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <section aria-labelledby="products-heading" className="space-y-4">
        <div className="flex gap-3 items-center">
          <h2 id="products-heading" className="text-2xl font-bold">
            Products
          </h2>
          <button type="button" disabled={!selected.length} onClick={() => void archive()}>
            Archive selected
          </button>
          <a
            href={`data:application/json;charset=utf-8,${encodeURIComponent(exportValue)}`}
            download="renegade-catalog-v1.json"
          >
            Export JSON
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th scope="col">Select</th>
                <th scope="col">Product</th>
                <th scope="col">State</th>
                <th scope="col">Readiness</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-500">
                    No catalog products found. Create a product in Collections &rarr; Products to begin.
                  </td>
                </tr>
              ) : (
                items.map(({ document, readiness }) => {
                const id = String(document.id)
                const state = String(document.state)
                return (
                  <tr key={id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${String(document.name)}`}
                        checked={selected.includes(id)}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, id]
                              : selected.filter((value) => value !== id),
                          )
                        }
                      />
                    </td>
                    <th scope="row">
                      {String(document.name)}
                      <br />
                      <small>{String(document.canonicalPath)}</small>
                    </th>
                    <td>{state}</td>
                    <td>
                      {readiness.ready ? (
                        'Ready'
                      ) : (
                        <details>
                          <summary>{readiness.blockers.length} blocker(s)</summary>
                          <ul>
                            {readiness.blockers.map((blocker) => (
                              <li key={blocker}>{blocker}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="space-x-2">
                      <a href={`/admin/collections/products/${encodeURIComponent(id)}`}>Edit</a>
                      <a
                        href={`/admin/catalog/preview/${encodeURIComponent(id)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview
                      </a>
                      {state === 'draft' ? (
                        <button onClick={() => void transition(id, 'request-review')}>
                          Request review
                        </button>
                      ) : null}
                      {state === 'review' ? (
                        <button onClick={() => void transition(id, 'approve')}>Approve</button>
                      ) : null}
                      {state === 'approved' ? (
                        <button
                          disabled={!readiness.ready}
                          onClick={() => void transition(id, 'publish')}
                        >
                          Publish
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })
            )}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="import-heading" className="space-y-3">
        <h2 id="import-heading" className="text-2xl font-bold">
          Import
        </h2>
        <label htmlFor="catalog-import">Catalog JSON</label>
        <textarea
          id="catalog-import"
          rows={10}
          className="w-full font-mono"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
        />
        <div className="flex gap-3">
          <button type="button" onClick={() => void runImport('dry-run')}>
            Dry run
          </button>
          <button type="button" onClick={() => void runImport('apply')}>
            Apply validated import
          </button>
        </div>
      </section>
    </main>
  )
}
