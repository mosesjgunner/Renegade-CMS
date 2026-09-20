'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Priority, WorkflowAuditEvent, WorkflowItem } from '../editorial/cmos-workflow'
import type { CommentTarget, ReviewComment, RevisionComparisonDiff } from '../editorial/comments'

type TabKey =
  | 'my-work'
  | 'team-queues'
  | 'comments'
  | 'due-overdue'
  | 'calendar'
  | 'scheduled-jobs'
  | 'translations'
  | 'releases'
  | 'blockers'
  | 'notification-failures'
  | 'audit'

interface CommandCenterData {
  currentUser: {
    id: string
    email: string
    role: string
    permissions: {
      canSubmit: boolean
      canReview: boolean
      canApprove: boolean
      canWaive: boolean
      canSchedule: boolean
      canExecuteRelease: boolean
      canRetryRelease: boolean
      canRollback: boolean
      role: string
    }
  }
  myWork: Record<string, WorkflowItem[]>
  teamQueues: Record<string, WorkflowItem[]>
  unresolvedComments: ReviewComment[]
  dueOverdue: Array<{
    id: string
    contentType: string
    status: string
    dueDate: string | null
    diffHours: number
    isOverdue: boolean
    priority: Priority
    editorId: string | null
    directLink: string
  }>
  calendar: Array<{
    id: string
    sourceType: string
    sourceId: string
    title: string
    startsAt: string
    timeZone: string
    status: string
    directLink: string
  }>
  scheduledJobs: {
    health: {
      healthy: boolean
      activeLocks: number
      clockSkewSeconds: number
      catchUpMode: string
    }
    upcomingCount: number
    jobs: Array<{
      jobId: string
      scheduledFor: string
      timeZone: string
      targetRevisionId: string
      status: string
    }>
  }
  translations: {
    groups: Array<{
      id: string
      conceptualId: string
      sourceLocale: string
      variantCount: number
      variants: string[]
      directLink: string
    }>
    requests: Array<{
      id: string
      groupId: string
      targetLocale: string
      status: string
      isStale: boolean
      staleReason?: string | null
      pinnedSourceRevision: number
      humanReviewed: boolean
      completenessScore?: number
      directLink: string
    }>
    staleCount: number
  }
  releases: Array<{
    id: string
    name: string
    title?: string
    status: string
    releaseRevision: number
    artifactCount: number
    scheduledFor?: string
    gatePassed: boolean
    directLink: string
  }>
  blockers: Array<{
    id: string
    contentType: string
    status: string
    blockingCount: number
    issues: Array<{ id: string; ruleId: string; severity: string; message: string }>
    repairLink: string
    directLink: string
  }>
  notificationFailures: Array<{
    id: string
    eventType: string
    recipientId: string
    channel: string
    attempts: number
    lastError?: string | null
    createdAt: string
  }>
  recentAudit: Array<{
    id: string
    action: string
    actorId: string
    actorRole: string
    at: string
    target: string
    detail?: string
    directLink: string
  }>
}

export default function EditorialWorkflowCenter() {
  const [activeTab, setActiveTab] = useState<TabKey>('my-work')
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [auditHistory, setAuditHistory] = useState<WorkflowAuditEvent[]>([])

  // Modals & Action States
  const [actionComment, setActionComment] = useState<string>('')
  const [emergencyReason, setEmergencyReason] = useState<string>('')
  const [selectedQueueCategory, setSelectedQueueCategory] = useState<string>('awaitingApproval')

  // Diff comparison modal
  const [diffData, setDiffData] = useState<RevisionComparisonDiff | null>(null)
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false)

  // Comment Modal
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false)
  const [commentTarget, setCommentTarget] = useState<CommentTarget>('body')
  const [newCommentText, setNewCommentText] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch('/api/admin/workflow/command-center')
        if (!res.ok) throw new Error(`Failed to load Command Center: ${res.statusText}`)
        const json = await res.json()
        if (active) {
          setData(json)
          setLoading(false)
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Error loading Command Center data.')
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const fetchCommandCenterData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/workflow/command-center')
      if (!res.ok) throw new Error(`Failed to load Command Center: ${res.statusText}`)
      const json = await res.json()
      setData(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading Command Center data.')
    } finally {
      setLoading(false)
    }
  }

  const fetchAudit = async (articleId: string) => {
    try {
      const res = await fetch(`/api/admin/workflow/audit?articleId=${articleId}`)
      if (res.ok) {
        const d = await res.json()
        setAuditHistory(d.auditTrail || [])
      }
    } catch {
      // Ignore
    }
  }

  const handleSelectItem = (id: string) => {
    setSelectedItemId(id)
    fetchAudit(id)
  }

  const handleExecuteAction = async (
    action:
      | 'submit'
      | 'approve'
      | 'reject'
      | 'request-changes'
      | 'withdraw'
      | 'cancel'
      | 'reopen'
      | 'emergency-override'
      | 'reassign'
      | 'save-draft',
  ) => {
    if (!selectedItemId) return
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        articleId: selectedItemId,
        action,
        comment: actionComment,
        reason: emergencyReason,
        update: action === 'reassign' ? { editorId: 'unassigned', priority: 'normal' } : undefined,
      }

      const res = await fetch('/api/admin/workflow/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const resData = await res.json()
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to execute workflow action.')
      }

      setActionComment('')
      setEmergencyReason('')
      await fetchCommandCenterData()
      if (selectedItemId) fetchAudit(selectedItemId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    }
  }

  const handleBulkAction = async (
    action: 'approve' | 'request-changes' | 'withdraw' | 'reassign',
  ) => {
    if (selectedItemIds.length === 0) return
    setError(null)
    try {
      const res = await fetch('/api/admin/workflow/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleIds: selectedItemIds,
          action,
          comment: actionComment,
        }),
      })
      if (!res.ok) throw new Error('Bulk operation failed.')
      setSelectedItemIds([])
      setActionComment('')
      await fetchCommandCenterData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bulk action error.')
    }
  }

  const handleResolveComment = async (commentId: string) => {
    try {
      const res = await fetch('/api/admin/workflow/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', commentId }),
      })
      if (!res.ok) throw new Error('Failed to resolve comment.')
      await fetchCommandCenterData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Comment resolution failed.')
    }
  }

  const handleAddComment = async () => {
    if (!selectedItemId || !newCommentText.trim()) return
    try {
      const res = await fetch('/api/admin/workflow/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          articleId: selectedItemId,
          target: commentTarget,
          content: newCommentText,
        }),
      })
      if (!res.ok) throw new Error('Failed to add comment.')
      setNewCommentText('')
      setIsCommentModalOpen(false)
      await fetchCommandCenterData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Add comment failed.')
    }
  }

  const handleCompareRevisions = async (item: WorkflowItem) => {
    try {
      const revA = {
        articleId: item.id,
        revisionSequence: item.currentRevisionSequence - 1,
        title: `Draft Version ${item.currentRevisionSequence - 1}`,
        summary: 'Original draft before changes requested',
        body: 'Original draft paragraph one. Missing campaign banner and legal footer.',
        media: { heroImage: 'media-001', altText: 'Default image' },
        seoTitle: 'Old Title',
      }
      const revB = {
        articleId: item.id,
        revisionSequence: item.currentRevisionSequence,
        title: `Revised Version ${item.currentRevisionSequence}`,
        summary: 'Revised draft addressing reviewer comments',
        body: 'Revised draft with campaign banner, improved typography, and legal footer.',
        media: { heroImage: 'media-002', altText: 'Hero campaign visual' },
        seoTitle: 'Optimized Campaign Title',
      }

      const res = await fetch('/api/admin/workflow/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compare', revisionA: revA, revisionB: revB }),
      })
      const result = await res.json()
      if (result.diff) {
        setDiffData(result.diff)
        setIsDiffModalOpen(true)
      }
    } catch {
      // fallback
    }
  }

  if (loading && !data) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          <p className="text-stone-500 font-medium">Loading Workflow Command Center...</p>
        </div>
      </div>
    )
  }

  const permissions = data?.currentUser?.permissions || {
    canSubmit: true,
    canReview: false,
    canApprove: false,
    canWaive: false,
    canSchedule: false,
    canExecuteRelease: false,
    canRetryRelease: false,
    canRollback: false,
    role: 'staff',
  }

  const role = data?.currentUser?.role || 'staff'

  // Summary counts
  const totalMyWork = Object.values(data?.myWork || {}).flat().length
  const totalAwaitingReview = data?.teamQueues?.awaitingApproval?.length || 0
  const totalComments = data?.unresolvedComments?.length || 0
  const totalOverdue = data?.dueOverdue?.filter((d) => d.isOverdue).length || 0
  const totalBlockers = data?.blockers?.length || 0
  const totalStaleTranslations = data?.translations?.staleCount || 0
  const totalReleases = data?.releases?.length || 0
  const isHealthy = data?.scheduledJobs?.health?.healthy ?? true

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header & Role Indicator */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Workflow Command Center
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 capitalize">
                Role: {role}
              </span>
              <span className="text-xs text-stone-500">Renegade CMoS FLOW-06</span>
            </div>
            <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
              Unified operational control: personal work queues, peer reviews, unresolved comments,
              calendar, scheduled jobs, translations, and coordinated release gates.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchCommandCenterData()}
              className="px-3 py-1.5 text-xs font-medium bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg border border-stone-300 dark:border-stone-700 transition"
            >
              ↻ Refresh
            </button>
            <Link
              href="/admin/releases"
              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
            >
              Manage Releases
            </Link>
          </div>
        </div>

        {/* Quick KPI Metric Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6 pt-6 border-t border-stone-200 dark:border-stone-800 text-center">
          <div className="p-2 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
            <span className="text-xs text-stone-500 block">My Work</span>
            <span className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {totalMyWork}
            </span>
          </div>
          <div className="p-2 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
            <span className="text-xs text-stone-500 block">In Review</span>
            <span className="text-lg font-bold text-amber-600">{totalAwaitingReview}</span>
          </div>
          <div className="p-2 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
            <span className="text-xs text-stone-500 block">Comments</span>
            <span className="text-lg font-bold text-blue-600">{totalComments}</span>
          </div>
          <div className="p-2 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
            <span className="text-xs text-stone-500 block">Overdue</span>
            <span
              className={`text-lg font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-stone-600'}`}
            >
              {totalOverdue}
            </span>
          </div>
          <div className="p-2 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
            <span className="text-xs text-stone-500 block">Blockers</span>
            <span
              className={`text-lg font-bold ${totalBlockers > 0 ? 'text-red-600' : 'text-stone-600'}`}
            >
              {totalBlockers}
            </span>
          </div>
          <div className="p-2 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
            <span className="text-xs text-stone-500 block">Stale Locales</span>
            <span
              className={`text-lg font-bold ${totalStaleTranslations > 0 ? 'text-amber-600' : 'text-stone-600'}`}
            >
              {totalStaleTranslations}
            </span>
          </div>
          <div className="p-2 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
            <span className="text-xs text-stone-500 block">Releases</span>
            <span className="text-lg font-bold text-indigo-600">{totalReleases}</span>
          </div>
          <div className="p-2 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
            <span className="text-xs text-stone-500 block">Worker</span>
            <span
              className={`text-xs font-bold inline-block px-2 py-0.5 rounded mt-1 ${isHealthy ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
            >
              {isHealthy ? 'Healthy' : 'Degraded'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Tab Navigation */}
      <div className="flex overflow-x-auto border-b border-stone-200 dark:border-stone-800 gap-1 pb-1">
        {[
          { key: 'my-work', label: 'My Work', badge: totalMyWork },
          { key: 'team-queues', label: 'Team Queues', badge: totalAwaitingReview },
          { key: 'comments', label: 'Comments', badge: totalComments },
          { key: 'due-overdue', label: 'Due / Overdue', badge: totalOverdue },
          { key: 'calendar', label: 'Calendar' },
          { key: 'scheduled-jobs', label: 'Jobs & Health' },
          { key: 'translations', label: 'Translations', badge: totalStaleTranslations },
          { key: 'releases', label: 'Releases', badge: totalReleases },
          { key: 'blockers', label: 'Blockers & Quality', badge: totalBlockers },
          { key: 'notification-failures', label: 'Outbox Failures' },
          { key: 'audit', label: 'Audit Trail' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === tab.key
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-xs font-semibold bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {/* 1. MY WORK */}
        {activeTab === 'my-work' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(data?.myWork || {}).map(([queueName, items]) => (
              <div
                key={queueName}
                className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="flex justify-between items-center pb-3 border-b border-stone-100 dark:border-stone-800">
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 capitalize">
                    {queueName.replace(/([A-Z])/g, ' $1')}
                  </h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                    {items.length}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-stone-400 italic py-4 text-center">
                    No items in this queue
                  </p>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectItem(item.id)}
                        className={`p-3 rounded-lg border text-xs cursor-pointer transition space-y-2 ${
                          selectedItemId === item.id
                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                            : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 bg-stone-50/50 dark:bg-stone-800/30'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-stone-900 dark:text-stone-100">
                            {item.contentType} #{item.id}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-stone-200 text-stone-700">
                            Rev #{item.currentRevisionSequence}
                          </span>
                        </div>
                        {item.staleApproval && (
                          <div className="p-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 font-medium">
                            ⚠️ Stale Approval: {item.staleReason || 'Revision changed'}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-stone-200/60 dark:border-stone-800/60">
                          <span className="text-stone-500">
                            Priority: {item.assignment.priority}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCompareRevisions(item)
                              }}
                              className="text-indigo-600 hover:text-indigo-800 font-semibold"
                            >
                              Diff
                            </button>
                            <Link
                              href={`/admin/collections/content/${item.id}?revision=${item.currentRevisionSequence}`}
                              className="text-indigo-600 hover:text-indigo-800 font-semibold"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Open →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 2. TEAM QUEUES */}
        {activeTab === 'team-queues' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-stone-500">Category:</span>
                {[
                  'awaitingApproval',
                  'requestedChanges',
                  'approved',
                  'scheduled',
                  'overdue',
                  'blocked',
                ].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedQueueCategory(cat)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg capitalize transition ${
                      selectedQueueCategory === cat
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {cat.replace(/([A-Z])/g, ' $1')} ({(data?.teamQueues?.[cat] || []).length})
                  </button>
                ))}
              </div>

              {permissions.canApprove && selectedItemIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-500">{selectedItemIds.length} selected</span>
                  <button
                    onClick={() => handleBulkAction('approve')}
                    className="px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700"
                  >
                    Bulk Approve
                  </button>
                  <button
                    onClick={() => handleBulkAction('request-changes')}
                    className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700"
                  >
                    Request Changes
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-sm">
              <table className="min-w-full divide-y divide-stone-200 dark:divide-stone-800 text-left text-xs">
                <thead className="bg-stone-50 dark:bg-stone-800/50 text-stone-500">
                  <tr>
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          const currentItems = data?.teamQueues?.[selectedQueueCategory] || []
                          setSelectedItemIds(e.target.checked ? currentItems.map((i) => i.id) : [])
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">Item & Content</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Revision</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                  {(data?.teamQueues?.[selectedQueueCategory] || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-stone-400 italic">
                        No items in this queue category.
                      </td>
                    </tr>
                  ) : (
                    (data?.teamQueues?.[selectedQueueCategory] || []).map((item) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-stone-50/50 dark:hover:bg-stone-800/20 ${
                          selectedItemId === item.id ? 'bg-indigo-50/40 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedItemIds.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked)
                                setSelectedItemIds([...selectedItemIds, item.id])
                              else
                                setSelectedItemIds(selectedItemIds.filter((id) => id !== item.id))
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">
                          <div>
                            <span>
                              {item.contentType} #{item.id}
                            </span>
                            <span className="block text-[11px] text-stone-500 font-normal">
                              Site: {item.siteId || 'default'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 uppercase">
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono">#{item.currentRevisionSequence}</span>
                          {item.staleApproval && (
                            <span className="ml-2 text-amber-600 text-[10px] font-bold">
                              ⚠️ Stale
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-semibold ${
                              item.assignment.priority === 'urgent'
                                ? 'text-red-600'
                                : item.assignment.priority === 'high'
                                  ? 'text-amber-600'
                                  : 'text-stone-600'
                            }`}
                          >
                            {item.assignment.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-stone-500">
                          {item.assignment.dueDate
                            ? new Date(item.assignment.dueDate).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            onClick={() => handleCompareRevisions(item)}
                            className="text-indigo-600 hover:text-indigo-800 font-semibold"
                          >
                            Compare
                          </button>
                          <button
                            onClick={() => {
                              handleSelectItem(item.id)
                              setIsCommentModalOpen(true)
                            }}
                            className="text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            + Comment
                          </button>
                          <Link
                            href={`/admin/collections/content/${item.id}?revision=${item.currentRevisionSequence}`}
                            className="text-stone-600 hover:text-stone-900 dark:hover:text-stone-200 font-semibold"
                          >
                            Inspect →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. UNRESOLVED COMMENTS */}
        {activeTab === 'comments' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-stone-200 dark:border-stone-800">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Unresolved Review Comments ({data?.unresolvedComments?.length || 0})
                </h3>
                <p className="text-xs text-stone-500">
                  Targeted editorial feedback across body text, media rights/metadata, SEO
                  configuration, and presentation layout.
                </p>
              </div>
            </div>

            {(data?.unresolvedComments || []).length === 0 ? (
              <p className="text-sm text-stone-400 italic py-8 text-center">
                No unresolved review comments. All clean!
              </p>
            ) : (
              <div className="space-y-4">
                {(data?.unresolvedComments || []).map((comment) => (
                  <div
                    key={comment.id}
                    className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-800/20 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                          {comment.target}
                        </span>
                        <span className="font-semibold text-xs text-stone-900 dark:text-stone-100">
                          {comment.articleTitle} (Rev #{comment.revisionSequence})
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-400">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-sm text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-900 p-3 rounded-lg border border-stone-200/80 dark:border-stone-800/80">
                      &ldquo;{comment.content}&rdquo;
                    </p>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-stone-500">
                        By <strong>{comment.authorName}</strong> ({comment.authorRole})
                      </span>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleResolveComment(comment.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-xs transition"
                        >
                          ✓ Resolve
                        </button>
                        <Link
                          href={comment.directLink}
                          className="px-3 py-1 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded font-medium text-xs border border-stone-300 dark:border-stone-700 transition"
                        >
                          View in Context →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. DUE & OVERDUE */}
        {activeTab === 'due-overdue' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              SLA & Deadline Tracking
            </h3>
            <div className="space-y-3">
              {(data?.dueOverdue || []).length === 0 ? (
                <p className="text-sm text-stone-400 italic py-8 text-center">
                  No impending or overdue deadlines.
                </p>
              ) : (
                (data?.dueOverdue || []).map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border flex items-center justify-between ${
                      item.isOverdue
                        ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20'
                        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
                          {item.contentType} #{item.id}
                        </span>
                        {item.isOverdue ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white uppercase">
                            OVERDUE by {Math.abs(item.diffHours)}h
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                            Due in {item.diffHours}h
                          </span>
                        )}
                        <span className="text-xs text-stone-500 uppercase font-semibold">
                          [{item.priority}]
                        </span>
                      </div>
                      <span className="text-xs text-stone-500 mt-1 block">
                        Assigned Editor: {item.editorId || 'Unassigned'} • Status: {item.status}
                      </span>
                    </div>
                    <Link
                      href={item.directLink}
                      className="px-3 py-1.5 text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 rounded-lg transition"
                    >
                      Prioritize →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 5. CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Editorial & Release Calendar
              </h3>
              <Link
                href="/calendar"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                Open Full Interactive Calendar ↗
              </Link>
            </div>
            <div className="space-y-3">
              {(data?.calendar || []).length === 0 ? (
                <p className="text-sm text-stone-400 italic py-8 text-center">
                  No scheduled items on the calendar.
                </p>
              ) : (
                (data?.calendar || []).map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-sm text-stone-900 dark:text-stone-100 block">
                        {entry.title}
                      </span>
                      <span className="text-xs text-stone-500 mt-0.5 block">
                        Scheduled Instant: {new Date(entry.startsAt).toLocaleString()} (
                        {entry.timeZone}) • Type: {entry.sourceType}
                      </span>
                    </div>
                    <Link
                      href={entry.directLink}
                      className="px-3 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded"
                    >
                      View →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 6. JOBS & HEALTH */}
        {activeTab === 'scheduled-jobs' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <span className="text-xs text-stone-500">Worker Status</span>
                <span
                  className={`text-lg font-bold block mt-1 ${isHealthy ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {isHealthy ? 'Healthy & Active' : 'Degraded / Interrupted'}
                </span>
              </div>
              <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <span className="text-xs text-stone-500">Active Lease Locks</span>
                <span className="text-lg font-bold text-stone-900 dark:text-stone-100 block mt-1">
                  {data?.scheduledJobs?.health?.activeLocks || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <span className="text-xs text-stone-500">Clock Skew Buffer</span>
                <span className="text-lg font-bold text-stone-900 dark:text-stone-100 block mt-1">
                  ±{data?.scheduledJobs?.health?.clockSkewSeconds || 30}s
                </span>
              </div>
              <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <span className="text-xs text-stone-500">Catch-Up Recovery</span>
                <span className="text-lg font-bold text-stone-900 dark:text-stone-100 block mt-1 uppercase text-sm">
                  {data?.scheduledJobs?.health?.catchUpMode || 'publish-immediately'}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Queued Background Jobs ({data?.scheduledJobs?.jobs?.length || 0})
              </h3>
              {(data?.scheduledJobs?.jobs || []).length === 0 ? (
                <p className="text-sm text-stone-400 italic py-4 text-center">
                  No active scheduled jobs in queue.
                </p>
              ) : (
                (data?.scheduledJobs?.jobs || []).map((j) => (
                  <div
                    key={j.jobId}
                    className="p-3 border rounded-lg flex justify-between items-center text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold">Job #{j.jobId}</span>
                      <span className="text-stone-500 ml-2">Target: {j.targetRevisionId}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-semibold uppercase">
                      {j.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 7. TRANSLATIONS */}
        {activeTab === 'translations' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Translation Groups & Quality Gates
              </h3>
              <p className="text-xs text-stone-500">
                Multi-locale synchronization, stale-source detection, provider attribution, and
                human approval verification.
              </p>
            </div>

            <div className="space-y-4">
              {(data?.translations?.requests || []).length === 0 ? (
                <p className="text-sm text-stone-400 italic py-6 text-center">
                  No translation requests active.
                </p>
              ) : (
                (data?.translations?.requests || []).map((req) => (
                  <div
                    key={req.id}
                    className={`p-4 rounded-xl border space-y-2 ${
                      req.isStale
                        ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-stone-200 dark:border-stone-800'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                            {req.targetLocale}
                          </span>
                          <span className="font-semibold text-sm">Request #{req.id}</span>
                          <span className="text-xs text-stone-500">(Group: {req.groupId})</span>
                        </div>
                        <span className="text-xs text-stone-500 mt-1 block">
                          Pinned Source Rev: #{req.pinnedSourceRevision} • Completeness:{' '}
                          {req.completenessScore ?? '100'}%
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase bg-stone-100 text-stone-800">
                        {req.status}
                      </span>
                    </div>

                    {req.isStale && (
                      <div className="p-2 bg-amber-100/70 border border-amber-300 rounded text-xs text-amber-900 font-medium">
                        🚨 STALE SOURCE:{' '}
                        {req.staleReason || 'English source document advanced to a newer revision.'}
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs pt-2 border-t border-stone-200 dark:border-stone-800">
                      <span className="text-stone-500">
                        Human Review:{' '}
                        {req.humanReviewed ? '✅ Approved by staff' : '⏳ Pending review'}
                      </span>
                      <Link
                        href={req.directLink}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        Review Side-by-Side →
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 8. RELEASES */}
        {activeTab === 'releases' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Coordinated Releases
              </h3>
              <Link
                href="/admin/releases"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                Open Full Release Orchestrator ↗
              </Link>
            </div>
            <div className="space-y-3">
              {(data?.releases || []).length === 0 ? (
                <p className="text-sm text-stone-400 italic py-6 text-center">
                  No coordinated releases created yet.
                </p>
              ) : (
                (data?.releases || []).map((rel) => (
                  <div
                    key={rel.id}
                    className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex justify-between items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
                          {rel.title || rel.name}
                        </span>
                        <span className="font-mono text-xs text-stone-500">
                          Rev #{rel.releaseRevision}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-700 uppercase font-semibold">
                          {rel.status}
                        </span>
                      </div>
                      <span className="text-xs text-stone-500 mt-1 block">
                        Artifacts: {rel.artifactCount} pinned • Preflight Gates:{' '}
                        {rel.gatePassed ? 'Passed' : 'Pending/Blocked'}
                      </span>
                    </div>
                    <Link
                      href={rel.directLink}
                      className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
                    >
                      Orchestrate →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 9. BLOCKERS & QUALITY */}
        {activeTab === 'blockers' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Deterministic Quality Center & Rights Blockers
            </h3>
            {(data?.blockers || []).length === 0 ? (
              <p className="text-sm text-emerald-600 font-medium py-6 text-center">
                ✓ Zero blockers detected. All rights and quality thresholds cleared!
              </p>
            ) : (
              (data?.blockers || []).map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-xl border border-red-300 bg-red-50/40 dark:bg-red-950/20 space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-red-900 dark:text-red-200">
                      {b.contentType} #{b.id} ({b.blockingCount} blocking issues)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-red-200 text-red-800 text-xs font-bold uppercase">
                      Blocked
                    </span>
                  </div>
                  <div className="space-y-1">
                    {b.issues.map((iss) => (
                      <div key={iss.id} className="text-xs text-red-800 flex items-center gap-2">
                        <span>
                          • [{iss.ruleId}] {iss.message}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Link
                      href={b.repairLink}
                      className="px-3 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700"
                    >
                      Repair in Quality Center →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 10. NOTIFICATION FAILURES */}
        {activeTab === 'notification-failures' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Durable Notification Outbox Failures
            </h3>
            <p className="text-xs text-stone-500">
              External provider failures (email, webhooks) isolated in durable outbox. Workflow
              state remains strictly decoupled.
            </p>
            {(data?.notificationFailures || []).length === 0 ? (
              <p className="text-sm text-stone-400 italic py-6 text-center">
                No notification outbox failures.
              </p>
            ) : (
              (data?.notificationFailures || []).map((nf) => (
                <div
                  key={nf.id}
                  className="p-3 border border-red-200 rounded-lg flex justify-between items-center text-xs"
                >
                  <div>
                    <span className="font-bold text-red-700">
                      {nf.eventType} to {nf.recipientId}
                    </span>
                    <span className="text-stone-500 ml-2">
                      Channel: {nf.channel} • Attempts: {nf.attempts}
                    </span>
                    <span className="block text-stone-600 mt-1">
                      Error: {nf.lastError || 'Timeout'}
                    </span>
                  </div>
                  <button className="px-3 py-1 bg-stone-100 hover:bg-stone-200 rounded font-semibold text-xs border">
                    Retry Now
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* 11. AUDIT TRAIL */}
        {activeTab === 'audit' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Unified Immutable Audit Stream
            </h3>
            <div className="space-y-3">
              {(data?.recentAudit || []).length === 0 ? (
                <p className="text-sm text-stone-400 italic py-6 text-center">
                  No recent audit activity.
                </p>
              ) : (
                (data?.recentAudit || []).map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-lg border border-stone-200 dark:border-stone-800 flex justify-between items-center text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-600">{ev.action}</span>
                        <span className="text-stone-600 font-medium">on {ev.target}</span>
                      </div>
                      <span className="text-stone-500 mt-0.5 block">
                        By actor #{ev.actorId} ({ev.actorRole}) • {new Date(ev.at).toLocaleString()}
                        {ev.detail ? ` — ${ev.detail}` : ''}
                      </span>
                    </div>
                    <Link
                      href={ev.directLink}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      Inspect →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Item Floating Action Bar */}
      {selectedItemId && (
        <div className="fixed bottom-4 right-4 max-w-lg w-full bg-white dark:bg-stone-900 border-2 border-indigo-500 shadow-2xl rounded-2xl p-5 space-y-4 z-40">
          <div className="flex justify-between items-center pb-2 border-b border-stone-200 dark:border-stone-800">
            <div>
              <span className="text-xs text-stone-500 uppercase font-semibold">
                Selected Target
              </span>
              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Item #{selectedItemId}
              </h4>
            </div>
            <button
              onClick={() => setSelectedItemId(null)}
              className="text-stone-400 hover:text-stone-600 font-bold"
            >
              ×
            </button>
          </div>

          {auditHistory.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-lg p-2 bg-stone-50 dark:bg-stone-800/50">
              <span className="text-[10px] font-bold uppercase text-stone-500">
                Item Audit History ({auditHistory.length})
              </span>
              {auditHistory.slice(0, 3).map((a) => (
                <div key={a.id} className="text-[11px] text-stone-600 dark:text-stone-300">
                  <span className="font-mono font-bold text-indigo-600">{a.action}</span> by actor #
                  {a.actorId} ({new Date(a.at).toLocaleTimeString()})
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-600">
              Decision Comment / Feedback:
            </label>
            <textarea
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              placeholder="Add review notes, requested changes, or approval comment..."
              className="w-full text-xs p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
              rows={2}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {permissions.canApprove && (
              <button
                onClick={() => handleExecuteAction('approve')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition"
              >
                ✓ Approve
              </button>
            )}
            {permissions.canReview && (
              <button
                onClick={() => handleExecuteAction('request-changes')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition"
              >
                Request Changes
              </button>
            )}
            <button
              onClick={() => handleExecuteAction('submit')}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition"
            >
              Submit for Review
            </button>
            {permissions.canWaive && (
              <button
                onClick={() => {
                  const reason = prompt('Enter justification for emergency override:')
                  if (reason) {
                    setEmergencyReason(reason)
                    handleExecuteAction('emergency-override')
                  }
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition"
              >
                Emergency Override
              </button>
            )}
          </div>
        </div>
      )}

      {/* Revision Comparison Diff Modal */}
      {isDiffModalOpen && diffData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-stone-200 dark:border-stone-800 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-stone-200 dark:border-stone-800">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Revision Comparison Diff
                </h3>
                <span className="text-xs text-stone-500">
                  Comparing Revision #{diffData.fromRevision} → Revision #{diffData.toRevision} for
                  Article #{diffData.articleId}
                </span>
              </div>
              <button
                onClick={() => setIsDiffModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {diffData.differences.length === 0 ? (
                <p className="text-xs text-stone-400 italic py-4 text-center">
                  No structural differences detected.
                </p>
              ) : (
                diffData.differences.map((diff, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-stone-200 dark:border-stone-800 space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs capitalize text-indigo-600">
                        {diff.field} ({diff.category})
                      </span>
                    </div>
                    <p className="text-xs text-stone-700 dark:text-stone-300">{diff.description}</p>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setIsDiffModalOpen(false)}
                className="px-4 py-2 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-bold rounded-lg"
              >
                Close Diff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Review Comment Modal */}
      {isCommentModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200 dark:border-stone-800">
            <div className="flex justify-between items-center pb-2 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Add Targeted Review Comment
              </h3>
              <button
                onClick={() => setIsCommentModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-stone-600 block mb-1">Target Element:</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['body', 'media', 'seo', 'layout'] as CommentTarget[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCommentTarget(t)}
                      className={`py-1.5 rounded-lg uppercase font-bold text-center border transition ${
                        commentTarget === t
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-stone-600 block mb-1">Comment Body:</label>
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Specify feedback, corrections, or blocking concerns..."
                  rows={4}
                  className="w-full p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setIsCommentModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                onClick={handleAddComment}
                disabled={!newCommentText.trim()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
              >
                Post Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
