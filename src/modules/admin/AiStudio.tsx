'use client'

import { useCallback, useEffect, useState } from 'react'

type Site = { id: string; name: string }
type Connection = {
  id: string
  label: string
  providerLabel: string
  providerKey: string
  endpoint: string
  model: string
  models: string[]
  capabilities: string[]
  allowedTasks: string[]
  status: string
  lastError: string | null
  lastTestedAt: string | null
  perTaskUsd: number
  monthlyUsd: number
  spentMonthUsd: number
  budgetMonth: string | null
  maxInputTokens: number
  maxOutputTokens: number
}
type Proposal = {
  id: string
  task: string
  targetCollection: string
  targetId: string
  status: string
  original: unknown
  output: unknown
  contextPreview: unknown
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number | null }
  auditId?: string
  requestedBy?: string
  decidedBy?: string | null
  decidedAt?: string | null
  createdAt?: string
  failureCode?: string
}
const tasks = [
  ['editor.improve-selection', 'Writer revision of one draft text node'],
  ['intelligence.metadata-seo', 'Discovery title and description'],
  ['media.alt-text', 'Media alt text from metadata'],
  ['distribution.copy-variants', 'Distribution draft copy variants'],
] as const

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Request failed.')
  return body
}

export default function AiStudio() {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [canConfigure, setCanConfigure] = useState(false)
  const [connections, setConnections] = useState<Connection[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [task, setTask] = useState<string>(tasks[0][0])
  const [targetId, setTargetId] = useState('')
  const [selection, setSelection] = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [preview, setPreview] = useState<{
    original: unknown
    contextPreview: unknown
    contextText: string
  } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [cancel, setCancel] = useState<AbortController | null>(null)
  const [form, setForm] = useState({
    label: '',
    providerKey: 'ai.openai-compatible',
    endpoint: 'https://api.openai.com/v1',
    model: '',
    apiKey: '',
    perTaskUsd: 0.25,
    monthlyUsd: 10,
    maxInputTokens: 6000,
    maxOutputTokens: 600,
    inputUsdPer1k: 0.01,
    outputUsdPer1k: 0.01,
  })

  const refresh = useCallback(async (selected: string) => {
    if (!selected) return
    const [connectionsResult, proposalsResult] = await Promise.all([
      jsonRequest(`/api/admin/ai/connections?siteId=${encodeURIComponent(selected)}`).catch(() => ({
        connections: [],
      })),
      jsonRequest(`/api/admin/ai/proposals?siteId=${encodeURIComponent(selected)}`),
    ])
    setConnections(connectionsResult.connections)
    setProposals(proposalsResult.proposals)
  }, [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedTask = params.get('task')
    if (tasks.some(([key]) => key === requestedTask)) setTask(requestedTask!)
    setTargetId(params.get('targetId') || '')
    void jsonRequest('/api/admin/ai/sites')
      .then((data) => {
        setSites(data.sites)
        setCanConfigure(data.canConfigure)
        setSiteId((old) => old || data.sites[0]?.id || '')
      })
      .catch((error) => setMessage(error.message))
  }, [])
  useEffect(() => {
    void refresh(siteId).catch((error) => setMessage(error.message))
  }, [refresh, siteId])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }
  const requestBody = { siteId, task, targetId, selection }
  const configure = () =>
    run(async () => {
      const result = await jsonRequest('/api/admin/ai/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, siteId, allowedTasks: tasks.map(([key]) => key) }),
      })
      setForm((current) => ({ ...current, apiKey: '' }))
      setMessage(
        `Connection saved as ${result.connection.status}. ${result.connection.lastError || 'Test passed.'}`,
      )
      await refresh(siteId)
    })
  const control = (id: string, action: string) =>
    run(async () => {
      const result = await jsonRequest('/api/admin/ai/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, siteId, action }),
      })
      setMessage(
        `${result.connection.label}: ${result.connection.status}. ${result.connection.lastError || ''}`,
      )
      await refresh(siteId)
    })
  const inspect = () =>
    run(async () => {
      const result = await jsonRequest('/api/admin/ai/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      setPreview(result)
    })
  const requestProposal = () =>
    run(async () => {
      const controller = new AbortController()
      setCancel(controller)
      try {
        const result = await jsonRequest('/api/admin/ai/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...requestBody, connectionId: connectionId || undefined }),
          signal: controller.signal,
        })
        setMessage(
          `Proposal ${result.proposal.status}. Review it below before applying or declining.`,
        )
        await refresh(siteId)
      } finally {
        setCancel(null)
      }
    })
  const decide = (proposalId: string, decision: 'apply' | 'decline', variantIndex = 0) =>
    run(async () => {
      await jsonRequest(`/api/admin/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, decision, variantIndex }),
      })
      setMessage(`Proposal ${decision === 'apply' ? 'applied' : 'declined'} and attributed.`)
      await refresh(siteId)
    })
  const input = (name: keyof typeof form, type = 'text') => (
    <label className="grid gap-1 text-sm" key={name}>
      <span>{name}</span>
      <input
        className="rounded border p-2"
        type={type}
        value={form[name]}
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            [name]: type === 'number' ? Number(event.target.value) : event.target.value,
          }))
        }
      />
    </label>
  )
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold">AI proposals</h1>
        <p>
          Supported text adapters produce reviewable proposals. Every change requires an editor to
          apply it.
        </p>
      </header>
      <label className="grid gap-1">
        Site
        <select
          className="rounded border p-2"
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value)
            setPreview(null)
          }}
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>
      {message && (
        <p role="status" className="rounded border p-3">
          {message}
        </p>
      )}
      {canConfigure && (
        <section className="space-y-4 rounded border p-5" aria-label="Provider connections">
          <h2 className="text-xl font-semibold">Configure a tested provider</h2>
          <p>
            OpenAI-compatible means chat completions and JSON proposals only. Ollama uses local text
            generation. Neither adapter inspects image pixels.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('label')}
            <label className="grid gap-1 text-sm">
              Adapter
              <select
                className="rounded border p-2"
                value={form.providerKey}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    providerKey: e.target.value,
                    endpoint:
                      e.target.value === 'ai.ollama'
                        ? 'http://127.0.0.1:11434'
                        : 'https://api.openai.com/v1',
                  }))
                }
              >
                <option value="ai.openai-compatible">OpenAI-compatible chat completions</option>
                <option value="ai.ollama">Local Ollama generate</option>
              </select>
            </label>
            {input('endpoint')}
            {input('model')}
            {input('apiKey', 'password')}
            {(
              [
                'perTaskUsd',
                'monthlyUsd',
                'maxInputTokens',
                'maxOutputTokens',
                'inputUsdPer1k',
                'outputUsdPer1k',
              ] as const
            ).map((name) => input(name, 'number'))}
          </div>
          <button
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
            disabled={busy || !siteId}
            onClick={configure}
          >
            Save and test connection
          </button>
        </section>
      )}
      <section className="space-y-3 rounded border p-5" aria-label="Connection health">
        <h2 className="text-xl font-semibold">Connections</h2>
        {!connections.length && (
          <p>
            No provider configured. Editors can still inspect context and receive a no-provider
            state.
          </p>
        )}
        {connections.map((item) => (
          <div key={item.id} className="rounded border p-3">
            <strong>{item.label}</strong> · {item.providerLabel} · {item.status}
            <br />
            <small>
              Model: {item.model}; discovered models: {item.models.join(', ') || 'none'};
              capabilities: {item.capabilities.join(', ') || 'none'}
            </small>
            <br />
            <small>
              Task budget ${item.perTaskUsd}; {item.budgetMonth || 'Current'} month estimated spend
              ${item.spentMonthUsd || 0} / ${item.monthlyUsd}; last test{' '}
              {item.lastTestedAt || 'never'}
            </small>
            {item.lastError && <p role="alert">{item.lastError}</p>}
            {canConfigure && (
              <div className="flex gap-2 pt-2">
                <button
                  className="rounded border px-3 py-1"
                  disabled={busy}
                  onClick={() => control(item.id, 'test')}
                >
                  Test connection
                </button>
                {item.status !== 'disabled' && (
                  <button
                    className="rounded border px-3 py-1"
                    disabled={busy}
                    onClick={() => control(item.id, 'disable')}
                  >
                    Disable
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </section>
      <section className="space-y-4 rounded border p-5" aria-label="Request proposal">
        <h2 className="text-xl font-semibold">Request a proposal</h2>
        <label className="grid gap-1">
          Workflow
          <select
            className="rounded border p-2"
            value={task}
            onChange={(e) => {
              setTask(e.target.value)
              setPreview(null)
            }}
          >
            {tasks.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          {task === 'distribution.copy-variants'
            ? 'Social network variant ID'
            : task === 'media.alt-text'
              ? 'Media asset ID'
              : 'Content ID'}
          <input
            className="rounded border p-2"
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value)
              setPreview(null)
            }}
          />
        </label>
        {task === 'editor.improve-selection' && (
          <label className="grid gap-1">
            Complete draft text node to revise
            <textarea
              className="rounded border p-2"
              value={selection}
              onChange={(e) => {
                setSelection(e.target.value)
                setPreview(null)
              }}
            />
          </label>
        )}
        <label className="grid gap-1">
          Provider
          <select
            className="rounded border p-2"
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
          >
            <option value="">No provider</option>
            {connections
              .filter((item) => item.status === 'active')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {item.model}
                </option>
              ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            className="rounded border px-4 py-2"
            disabled={busy || !targetId}
            onClick={inspect}
          >
            Preview source context
          </button>
          <button
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
            disabled={busy || !targetId || !preview}
            onClick={requestProposal}
          >
            Request proposal
          </button>
          {cancel && (
            <button className="rounded border px-4 py-2" onClick={() => cancel.abort()}>
              Cancel request
            </button>
          )}
        </div>
        {preview && (
          <div className="space-y-2 rounded border p-3">
            <strong>Exact context to be supplied</strong>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">
              {preview.contextText}
            </pre>
            <details>
              <summary>Original and context IDs</summary>
              <pre className="overflow-auto text-xs">
                {JSON.stringify(
                  { original: preview.original, contextPreview: preview.contextPreview },
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
        )}
      </section>
      <section className="space-y-3 rounded border p-5" aria-label="Proposal audit">
        <h2 className="text-xl font-semibold">Usage and review audit</h2>
        {!proposals.length && <p>No proposals for this site.</p>}
        {proposals.map((proposal) => (
          <article key={proposal.id} className="space-y-2 rounded border p-3">
            <h3 className="font-semibold">
              {proposal.task} · {proposal.status}
            </h3>
            <p className="text-xs">
              {proposal.targetCollection} {proposal.targetId} · requested {proposal.createdAt} by{' '}
              {proposal.requestedBy} · audit {proposal.auditId}
            </p>
            <details open={proposal.status === 'ready'}>
              <summary>Preview and diff</summary>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <strong>Current</strong>
                  <pre className="overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(proposal.original, null, 2)}
                  </pre>
                </div>
                <div>
                  <strong>Proposed</strong>
                  <pre className="overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(proposal.output, null, 2)}
                  </pre>
                </div>
              </div>
              <pre className="overflow-auto text-xs">
                {JSON.stringify(proposal.contextPreview, null, 2)}
              </pre>
            </details>
            {proposal.usage && (
              <p className="text-xs">
                Tokens: {proposal.usage.inputTokens} input / {proposal.usage.outputTokens} output ·
                estimated cost{' '}
                {proposal.usage.estimatedCostUsd === null
                  ? 'unknown'
                  : `$${proposal.usage.estimatedCostUsd.toFixed(5)}`}
              </p>
            )}
            {proposal.decidedBy && (
              <p className="text-xs">
                Decision by {proposal.decidedBy} at {proposal.decidedAt}
              </p>
            )}
            {proposal.failureCode && (
              <p role="alert" className="text-xs">
                {proposal.failureCode}
              </p>
            )}
            {proposal.status === 'ready' && (
              <div className="flex items-end gap-2">
                <button
                  className="rounded border px-3 py-1"
                  disabled={busy}
                  onClick={() => decide(proposal.id, 'decline')}
                >
                  Decline without changes
                </button>
                {proposal.task === 'distribution.copy-variants' &&
                Array.isArray((proposal.output as { variants?: string[] })?.variants) ? (
                  (proposal.output as { variants: string[] }).variants.map((_, index) => (
                    <button
                      key={index}
                      className="rounded bg-red-700 px-3 py-1 text-white"
                      disabled={busy}
                      onClick={() => decide(proposal.id, 'apply', index)}
                    >
                      Apply variant {index + 1}
                    </button>
                  ))
                ) : (
                  <button
                    className="rounded bg-red-700 px-3 py-1 text-white"
                    disabled={busy}
                    onClick={() => decide(proposal.id, 'apply')}
                  >
                    Apply proposal
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}
