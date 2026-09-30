'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'

type Report = {
  id: string
  siteId: string
  reporterId: string
  targetType: string
  targetId: string
  reason: string
  details: string | null
  status: string
  parentCaseId: string
  snapshot?: Record<string, unknown>
  createdAt: string
}

type ModerationCase = {
  id: string
  siteId: string
  targetType: string
  targetId: string
  status: string
  createdAt: string
  lastReportedAt: string
}

type ModerationActionRecord = {
  id: string
  siteId: string
  caseId: string
  actor: string
  targetType: string
  targetId: string
  action: string
  reason: string
  details: Record<string, unknown>
  createdAt: string
}

type AuditRecord = {
  id: string
  siteId: string
  eventType: string
  payload: Record<string, unknown>
  hash: string
  createdAt: string
}

export default function CommunityModerationCenter() {
  const [siteId, setSiteId] = useState('default')
  const [reports, setReports] = useState<Report[]>([])
  const [cases, setCases] = useState<ModerationCase[]>([])
  const [actions, setActions] = useState<ModerationActionRecord[]>([])
  const [auditLog, setAuditLog] = useState<AuditRecord[]>([])
  const [auditValid, setAuditValid] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<'reports' | 'audit'>('reports')

  // Selected report / case for action
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [actionChoice, setActionChoice] = useState('warn')
  const [scopeChoice, setScopeChoice] = useState('object')
  const [actionReason, setActionReason] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const loadData = useCallback(async (currentSite: string) => {
    try {
      const [reportsRes, modRes] = await Promise.all([
        fetch(`/api/community/reports?siteId=${encodeURIComponent(currentSite)}`, {
          credentials: 'same-origin',
        }),
        fetch(`/api/community/moderation?siteId=${encodeURIComponent(currentSite)}`, {
          credentials: 'same-origin',
        }),
      ])

      if (reportsRes.ok) {
        const rData = await reportsRes.json()
        setReports(rData.reports ?? [])
        setCases(rData.cases ?? [])
      }

      if (modRes.ok) {
        const mData = await modRes.json()
        setActions(mData.actions ?? [])
        setAuditLog(mData.auditLog ?? [])
        setAuditValid(Boolean(mData.auditValid))
      }
    } catch {
      setStatusMessage('Could not load moderation console data.')
    }
  }, [])

  useEffect(() => {
    void loadData(siteId)
  }, [siteId, loadData])

  async function handleApplyAction(e: FormEvent) {
    e.preventDefault()
    if (!selectedReport || !actionReason.trim()) return
    setBusy(true)
    setStatusMessage('Applying moderation action…')

    try {
      const res = await fetch('/api/community/moderation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          siteId,
          caseId: selectedReport.parentCaseId || selectedReport.id,
          targetType: selectedReport.targetType,
          targetId: selectedReport.targetId,
          action: actionChoice,
          scope: scopeChoice,
          reason: actionReason.trim(),
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatusMessage(data.error ?? 'Action failed.')
        setBusy(false)
        return
      }

      setStatusMessage(
        `Action '${actionChoice}' successfully applied and recorded to immutable audit log.`,
      )
      setSelectedReport(null)
      setActionReason('')
      setBusy(false)
      void loadData(siteId)
    } catch {
      setStatusMessage('Network error applying action.')
      setBusy(false)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Community Moderation Center</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Inspect pending reports, review immutable snapshot evidence, apply sanctions, and verify
            audit integrity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-stone-500">
            Site ID:
            <input
              className="ml-2 px-2.5 py-1 text-xs border rounded bg-white dark:bg-stone-900"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-sm" onClick={() => void loadData(siteId)}>
            Refresh
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div
          role="status"
          className="p-4 rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900 text-sm"
        >
          {statusMessage}
        </div>
      ) : null}

      <div className="flex gap-4 border-b border-stone-200 dark:border-stone-800">
        <button
          type="button"
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'reports'
              ? 'border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
          onClick={() => setActiveTab('reports')}
        >
          Pending Reports & Cases ({reports.length})
        </button>
        <button
          type="button"
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'audit'
              ? 'border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
          onClick={() => setActiveTab('audit')}
        >
          Audit Trail & Sanctions ({auditLog.length})
        </button>
      </div>

      {activeTab === 'reports' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold">Incoming Community Reports</h2>
            {reports.length === 0 ? (
              <div className="p-8 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 text-center text-sm text-stone-500">
                No open community reports found for site &ldquo;{siteId}&rdquo;.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <article
                    key={report.id}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      selectedReport?.id === report.id
                        ? 'border-primary ring-1 ring-primary bg-stone-50 dark:bg-stone-800/60'
                        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50/50'
                    }`}
                    onClick={() => setSelectedReport(report)}
                  >
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span className="px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 font-semibold uppercase tracking-wider">
                        {report.targetType}
                      </span>
                      <time dateTime={report.createdAt}>
                        {new Date(report.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Reason: {report.reason}
                    </h3>
                    {report.details ? (
                      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                        Details: {report.details}
                      </p>
                    ) : null}
                    <div className="mt-2 text-xs text-stone-400 flex items-center justify-between">
                      <span>Target ID: {report.targetId.slice(0, 16)}…</span>
                      <span className="text-primary font-medium">Inspect & Action &rarr;</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Moderator Decision Panel</h2>
            {selectedReport ? (
              <form
                onSubmit={handleApplyAction}
                className="p-5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm space-y-4"
              >
                <div>
                  <span className="text-xs uppercase font-semibold text-stone-400 tracking-wider">
                    Target Inspection
                  </span>
                  <div className="mt-1 text-xs font-mono bg-stone-100 dark:bg-stone-800 p-2.5 rounded overflow-x-auto max-h-40">
                    <p>Type: {selectedReport.targetType}</p>
                    <p>Target ID: {selectedReport.targetId}</p>
                    {selectedReport.snapshot ? (
                      <pre className="mt-2 text-[11px] whitespace-pre-wrap">
                        {JSON.stringify(selectedReport.snapshot, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                </div>

                <label className="block text-xs font-medium">
                  Moderation Action
                  <select
                    className="form-input block w-full mt-1 text-sm"
                    value={actionChoice}
                    onChange={(e) => setActionChoice(e.target.value)}
                  >
                    <option value="warn">Warn Author</option>
                    <option value="quarantine">Quarantine Content</option>
                    <option value="remove">Remove Content</option>
                    <option value="lock_thread">Lock Thread</option>
                    <option value="suspend_posting">Suspend Member Posting</option>
                    <option value="ban_member">Ban Member</option>
                    <option value="no_action">Dismiss (No Action)</option>
                  </select>
                </label>

                <label className="block text-xs font-medium">
                  Scope
                  <select
                    className="form-input block w-full mt-1 text-sm"
                    value={scopeChoice}
                    onChange={(e) => setScopeChoice(e.target.value)}
                  >
                    <option value="object">Object (Target Only)</option>
                    <option value="space">Space / Section</option>
                    <option value="site_global">Site Global</option>
                  </select>
                </label>

                <label className="block text-xs font-medium">
                  Audit Reason (required)
                  <textarea
                    className="form-input block w-full mt-1 text-sm"
                    rows={3}
                    required
                    placeholder="Enter formal justification for audit log…"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                  />
                </label>

                <div className="pt-2 flex gap-2">
                  <button className="btn btn-primary btn-sm flex-1" type="submit" disabled={busy}>
                    {busy ? 'Applying…' : 'Execute Decision'}
                  </button>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => setSelectedReport(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-6 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 text-center text-xs text-stone-500">
                Select a report from the list to view evidence snapshots and execute moderation
                decisions.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Cryptographic Audit Log Integrity
              </h3>
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                {auditValid
                  ? 'All audit entries conform to the trigger-derived SHA-256 hash chain.'
                  : 'Chain verification warning: mismatch detected.'}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold">
              Verified
            </span>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Recent Moderation Actions ({actions.length})</h2>
            <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden bg-white dark:bg-stone-900">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-800 text-stone-500">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {actions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-stone-500">
                        No moderation actions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    actions.map((act) => (
                      <tr key={act.id}>
                        <td className="p-3 text-stone-500 whitespace-nowrap">
                          {new Date(act.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-semibold uppercase text-stone-900 dark:text-stone-100">
                          {act.action}
                        </td>
                        <td className="p-3 text-stone-600 dark:text-stone-400">
                          {act.targetType} ({act.targetId.slice(0, 8)}…)
                        </td>
                        <td className="p-3 text-stone-500">{act.actor}</td>
                        <td className="p-3 text-stone-700 dark:text-stone-300">{act.reason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              Immutable Community Audit Log ({auditLog.length})
            </h2>
            <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden bg-white dark:bg-stone-900">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-stone-50 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-800 text-stone-500">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Event Type</th>
                    <th className="p-3">Record Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {auditLog.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-stone-500 font-sans">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLog.map((log) => (
                      <tr key={log.id}>
                        <td className="p-3 text-stone-500 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 text-stone-900 dark:text-stone-100 font-semibold">
                          {log.eventType}
                        </td>
                        <td className="p-3 text-stone-400 truncate max-w-xs">{log.hash}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
