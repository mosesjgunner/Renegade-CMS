'use client'
/* eslint-disable @typescript-eslint/no-explicit-any -- scoped operator report */
import { useEffect, useState } from 'react'
export function FulfillmentPlanningPanel() {
  const [ready, setReady] = useState(false),
    [siteId, setSite] = useState(''),
    [report, setReport] = useState<any>(),
    [message, setMessage] = useState('')
  const [productId, setProduct] = useState(''),
    [sku, setSku] = useState(''),
    [mode, setMode] = useState('manual')
  const [connectionId, setConnection] = useState(''),
    [remoteProductId, setRemoteProduct] = useState(''),
    [remoteVariantId, setRemoteVariant] = useState(''),
    [mediaAssetId, setMedia] = useState('')
  const [jobId, setJob] = useState(''),
    [reason, setReason] = useState('')
  useEffect(() => setReady(true), [])
  async function load() {
    const res = await fetch(`/api/admin/fulfillment?siteId=${encodeURIComponent(siteId)}`),
      body = await res.json()
    if (!res.ok) {
      setReport(undefined)
      setMessage(body.error)
      return
    }
    setReport(body)
    setMessage('Stored plans and mappings loaded.')
  }
  async function act(body: any) {
    const res = await fetch('/api/admin/fulfillment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      data = await res.json()
    setMessage(res.ok ? 'Saved and persisted. No provider creation is implied.' : data.error)
    if (res.ok) {
      const r = await fetch(`/api/admin/fulfillment?siteId=${encodeURIComponent(siteId)}`)
      setReport(await r.json())
    }
  }
  return (
    <section>
      <h2>Fulfillment planning</h2>
      <label>
        Planning site ID{' '}
        <input disabled={!ready} value={siteId} onChange={(e) => setSite(e.target.value)} />
      </label>
      <button disabled={!ready} onClick={load}>
        Load plans and mappings
      </button>
      <p role="status">{message}</p>
      {report && (
        <>
          <p>{report.scope} POD jobs remain held; no provider order or shipment is assumed.</p>
          <h3>Review product mapping</h3>
          <p>
            Owner/administrator approval is required. A mapping change returns a published product
            to draft for review.
          </p>
          <label>
            Mapping product{' '}
            <select value={productId} onChange={(e) => setProduct(e.target.value)}>
              <option value="">Choose product</option>
              {report.products.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Variant SKU <input value={sku} onChange={(e) => setSku(e.target.value)} />
          </label>
          <label>
            Fulfillment method{' '}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="manual">Manual</option>
              <option value="pod">POD</option>
            </select>
          </label>
          {mode === 'pod' && (
            <>
              <label>
                POD connection ID{' '}
                <input value={connectionId} onChange={(e) => setConnection(e.target.value)} />
              </label>
              <label>
                Provider product ID{' '}
                <input value={remoteProductId} onChange={(e) => setRemoteProduct(e.target.value)} />
              </label>
              <label>
                Provider variant ID{' '}
                <input value={remoteVariantId} onChange={(e) => setRemoteVariant(e.target.value)} />
              </label>
              <label>
                Private artwork asset ID{' '}
                <input value={mediaAssetId} onChange={(e) => setMedia(e.target.value)} />
              </label>
              <p>
                Front print, 100 × 100 mm at 50 mm top/left. Artwork requires actual private,
                approved PNG bytes and at least 150 effective DPI. External availability is not
                inferred.
              </p>
            </>
          )}
          <button
            onClick={() =>
              act({
                action: 'save-mapping',
                productId,
                mapping: {
                  mode,
                  variantSku: sku,
                  connectionId,
                  remoteProductId,
                  remoteVariantId,
                  currency: 'USD',
                  costMinor: '0',
                  printAreas: [
                    {
                      mediaAssetId,
                      area: 'front',
                      placement: { topMm: 50, leftMm: 50, widthMm: 100, heightMm: 100 },
                    },
                  ],
                },
              })
            }
          >
            Approve fulfillment mapping
          </button>
          <h3>Recorded plans</h3>
          {report.orders.map((o: any) => (
            <details key={o.id}>
              <summary>
                {o.number} — {o.state}
              </summary>
              <p>Order ID: {o.id}</p>
              <pre>{JSON.stringify(o.plan, null, 2)}</pre>
              <button onClick={() => act({ action: 'reconcile-plan', orderId: o.id })}>
                Reconcile this plan
              </button>
              <label>
                Held job ID <input value={jobId} onChange={(e) => setJob(e.target.value)} />
              </label>
              <label>
                Override reason <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button
                onClick={() => act({ action: 'override-manual', orderId: o.id, jobId, reason })}
              >
                Override to manual
              </button>
            </details>
          ))}
          <h3>Saved mapping reviews</h3>
          {report.products.map((p: any) => (
            <details key={p.id}>
              <summary>{p.name}</summary>
              <pre>{JSON.stringify(p.mappings, null, 2)}</pre>
            </details>
          ))}
        </>
      )}
    </section>
  )
}
