'use client'
import { useState } from 'react'
import { graphicTemplatePresets, type GraphicTemplate } from '@/modules/graphics/service'

const templates = Object.keys(graphicTemplatePresets) as GraphicTemplate[]
export default function GraphicsStudioPage() {
  const [template, setTemplate] = useState<GraphicTemplate>('article-social')
  const [text, setText] = useState('Independent publishing, on your terms.')
  const [status, setStatus] = useState('Select an approved Media asset before saving.')
  const spec = graphicTemplatePresets[template]
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <header className="border-b border-stone-200 dark:border-stone-800 pb-5">
        <h1 className="text-3xl font-extrabold font-display">Graphics Studio</h1>
        <p className="text-sm text-stone-600">
          Governed, template-based graphics — not a general-purpose design canvas.
        </p>
      </header>
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="surface-card p-5 space-y-4">
          <label className="form-label">Template</label>
          <select
            className="form-select"
            value={template}
            onChange={(event) => setTemplate(event.target.value as GraphicTemplate)}
          >
            {templates.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <p className="text-xs text-stone-500">
            Approved preset: {spec.width} × {spec.height} · {spec.preset}
          </p>
          <label className="form-label">Brand kit</label>
          <select className="form-select">
            <option>Default brand tokens</option>
          </select>
          <label className="form-label">Approved source asset</label>
          <button className="btn btn-secondary w-full">Choose from Media (rights checked)</button>
          <label className="form-label">Text</label>
          <textarea
            className="form-textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
          />
          <div className="flex gap-3">
            <button
              className="btn btn-secondary"
              onClick={() => setStatus('Template regenerated from the same governed source.')}
            >
              Regenerate
            </button>
            <button
              className="btn btn-primary"
              onClick={() =>
                setStatus('Save creates a GraphicDocument, MediaDerivative, and AssetUsage record.')
              }
            >
              Save to Media
            </button>
          </div>
          <p role="status" className="text-sm">
            {status}
          </p>
        </div>
        <div className="surface-card p-6 flex items-center justify-center">
          <div
            className="w-full max-w-md aspect-square bg-stone-900 text-white p-8 flex flex-col justify-end"
            style={{ aspectRatio: `${spec.width}/${spec.height}` }}
          >
            <span className="text-xs uppercase tracking-widest opacity-70">
              Brand token preview
            </span>
            <strong className="text-3xl font-display mt-3">{text}</strong>
            <span className="mt-6 text-xs opacity-70">
              Registered variant: graphics.{template}.v1
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}
