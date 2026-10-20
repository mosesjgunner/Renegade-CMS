'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { type SocialNetwork } from '../social/contracts'
import {
  createCanonicalSocialPost,
  overrideVariantCopy,
  resetVariantOverride,
  resolveEffectiveCopy,
  updateCanonicalCopy,
  type CanonicalSocialPost,
} from '../social/models'

interface ConnectedAccountUI {
  id: string
  network: SocialNetwork
  handle: string
  avatarUrl?: string
  status: 'active' | 'reconnect_required' | 'expired'
  tokenExpiresInDays?: number
  mode?: string
  capabilities?: {
    textLimit?: number | null
    postTypes?: readonly string[]
  }
}

const FALLBACK_PREVIEW_ACCOUNT: ConnectedAccountUI = {
  id: 'preview-bluesky',
  network: 'bluesky',
  handle: '@unconfigured (local preview)',
  status: 'reconnect_required',
}

const DEFAULT_ACCOUNTS: ConnectedAccountUI[] = []

export interface SocialCommandCenterProps {
  initialAccounts?: ConnectedAccountUI[]
}

export default function SocialCommandCenter({ initialAccounts }: SocialCommandCenterProps = {}) {
  const router = useRouter()
  const [accounts, setAccounts] = useState<ConnectedAccountUI[]>(
    initialAccounts ?? DEFAULT_ACCOUNTS,
  )
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
    initialAccounts ? initialAccounts.map((a) => a.id) : [],
  )
  const [activeTabAccountId, setActiveTabAccountId] = useState<string>(
    initialAccounts?.[0]?.id ?? 'preview-bluesky',
  )

  // Canonical Post State
  const [canonicalPost, setCanonicalPost] = useState<CanonicalSocialPost>(() =>
    createCanonicalSocialPost({
      id: 'post-draft-current',
      siteId: 'site-alpha',
      publicationId: 'pub-main',
      title: '',
      baseCopy: '',
      canonicalUrl: '',
      authorId: 'user-admin',
      targetAccounts: initialAccounts
        ? initialAccounts.map((a) => ({ accountId: a.id, network: a.network }))
        : [{ accountId: 'preview-bluesky', network: 'bluesky' }],
    }),
  )

  const [imageUrl, setImageUrl] = useState<string>('')
  const [pinterestBoardId, setPinterestBoardId] = useState<string>('board-announcements')
  const [telegramChatId, setTelegramChatId] = useState<string>('@renegade_broadcast')
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState<string>('')
  const [contentWarning, setContentWarning] = useState<string>('')
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false)
  const [workerResult, setWorkerResult] = useState<string | null>(null)

  // Draft Persistence & Review Workflow State
  const [savedDrafts, setSavedDrafts] = useState<any[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string>('')
  const [draftTitle, setDraftTitle] = useState<string>('')
  const [draftStatus, setDraftStatus] = useState<string | null>(null)
  const [scheduledDateTime, setScheduledDateTime] = useState<string>(() => {
    const d = new Date(Date.now() + 3600000)
    return d.toISOString().slice(0, 16)
  })
  const [persistedQueueItems, setPersistedQueueItems] = useState<any[]>([])
  const [workflowMessage, setWorkflowMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const [isSubmittingWorkflow, setIsSubmittingWorkflow] = useState<boolean>(false)

  const refreshDrafts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social/drafts')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.drafts)) {
          setSavedDrafts(data.drafts)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/admin/social/accounts')
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (Array.isArray(data.accounts) && data.accounts.length > 0) {
          const liveAccounts: ConnectedAccountUI[] = data.accounts.map((doc: any) => ({
            id: String(doc.id),
            network: doc.network,
            handle: doc.displayName || doc.externalAccountId || String(doc.id),
            status: doc.credentialHealth === 'healthy' ? 'active' : 'reconnect_required',
            mode: doc.diagnostics?.mode,
            capabilities: doc.capabilities,
          }))
          setAccounts(liveAccounts)
          setSelectedAccountIds(liveAccounts.map((a) => a.id))
          setActiveTabAccountId(liveAccounts[0].id)

          // Ensure canonicalPost.variants has an entry for each live account
          setCanonicalPost((prev) => {
            const existingVariantAccountIds = new Set(prev.variants.map((v) => v.accountId))
            const newVariants = [...prev.variants]
            for (const acc of liveAccounts) {
              if (!existingVariantAccountIds.has(acc.id)) {
                newVariants.push({
                  id: `var-${prev.id}-${acc.id}`,
                  canonicalPostId: prev.id,
                  accountId: acc.id,
                  network: acc.network,
                  copy: null,
                  isOverridden: false,
                  attachments: [],
                  idempotencyKey: `init-${prev.id}-${acc.id}`,
                  status: 'pending',
                })
              }
            }
            return { ...prev, variants: newVariants }
          })
        } else {
          setAccounts([])
          setSelectedAccountIds([])
        }
      })
      .catch(() => {
        setAccounts([])
        setSelectedAccountIds([])
      })

    void refreshDrafts()

    return () => {
      cancelled = true
    }
  }, [refreshDrafts])

  const loadDraft = async (id: string) => {
    if (!id) {
      setSelectedDraftId('')
      setDraftTitle('')
      setDraftStatus(null)
      setPersistedQueueItems([])
      setWorkflowMessage(null)
      return
    }
    setIsSubmittingWorkflow(true)
    try {
      const res = await fetch(`/api/admin/social/drafts?draftId=${encodeURIComponent(id)}`)
      if (res.ok) {
        const data = await res.json()
        const draft = data.draft
        setSelectedDraftId(draft.id)
        setDraftTitle(draft.title || '')
        setDraftStatus(draft.status || 'draft')
        setPersistedQueueItems(data.queueItems || [])
        setWorkflowMessage({
          type: 'info',
          text: `Loaded draft "${draft.title}" (Status: ${draft.status})`,
        })

        if (draft.canonicalUrl) {
          setCanonicalPost((prev) => ({ ...prev, canonicalUrl: draft.canonicalUrl }))
        }

        if (Array.isArray(data.variants) && data.variants.length > 0) {
          setCanonicalPost((prev) => {
            const updatedVariants = [...prev.variants]
            for (const v of data.variants) {
              const accId =
                typeof v.account === 'object' && v.account !== null
                  ? String(v.account.id)
                  : String(v.account)
              const existingIdx = updatedVariants.findIndex((uv) => uv.accountId === accId)
              if (existingIdx >= 0) {
                updatedVariants[existingIdx] = {
                  ...updatedVariants[existingIdx],
                  id: v.id,
                  copy: v.text,
                  isOverridden: true,
                }
              } else {
                updatedVariants.push({
                  id: v.id,
                  canonicalPostId: prev.id,
                  accountId: accId,
                  network: v.network,
                  copy: v.text,
                  isOverridden: true,
                  attachments: [],
                  idempotencyKey: v.idempotencyKey || `var-${v.id}`,
                  status: 'pending',
                })
              }
            }
            return {
              ...prev,
              baseCopy: prev.baseCopy || data.variants[0]?.text || '',
              variants: updatedVariants,
            }
          })
        }
      } else {
        const err = await res.json()
        setWorkflowMessage({ type: 'error', text: err.error || 'Failed to load draft.' })
      }
    } catch (err: unknown) {
      setWorkflowMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsSubmittingWorkflow(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!draftTitle.trim()) {
      setWorkflowMessage({ type: 'error', text: 'Please enter a Draft Title before saving.' })
      return
    }
    if (selectedAccountIds.length === 0) {
      setWorkflowMessage({
        type: 'error',
        text: 'Please select at least one distribution network.',
      })
      return
    }

    setIsSubmittingWorkflow(true)
    setWorkflowMessage(null)

    try {
      const variantPayload = selectedAccountIds.map((accId) => {
        const acc = accounts.find((a) => a.id === accId)
        const v = canonicalPost.variants.find((variant) => variant.accountId === accId)
        const text = v ? resolveEffectiveCopy(canonicalPost, v) : canonicalPost.baseCopy
        return {
          id: v?.id && !v.id.startsWith('var-') ? v.id : undefined,
          accountId: accId,
          network: acc?.network || 'bluesky',
          text,
          linkUrl: canonicalPost.canonicalUrl || undefined,
          attachments: imageUrl ? [imageUrl] : [],
        }
      })

      const res = await fetch('/api/admin/social/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: selectedDraftId ? 'update-draft' : 'create-draft',
          draftId: selectedDraftId || undefined,
          title: draftTitle.trim(),
          canonicalUrl: canonicalPost.canonicalUrl || undefined,
          variants: variantPayload,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        const draft = data.draft
        setSelectedDraftId(draft.id)
        setDraftStatus(draft.status || 'draft')
        setWorkflowMessage({
          type: 'success',
          text: `Draft successfully saved (ID: ${draft.id}, Status: ${draft.status || 'draft'})`,
        })
        await refreshDrafts()
      } else {
        setWorkflowMessage({
          type: 'error',
          text:
            data.error ||
            (data.validationErrors
              ? data.validationErrors.join('; ')
              : 'Failed to save draft.'),
        })
      }
    } catch (err: unknown) {
      setWorkflowMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsSubmittingWorkflow(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!selectedDraftId) return
    setIsSubmittingWorkflow(true)
    setWorkflowMessage(null)
    try {
      const res = await fetch('/api/admin/social/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit-review',
          draftId: selectedDraftId,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraftStatus('review')
        setWorkflowMessage({
          type: 'success',
          text: 'Draft successfully submitted for editorial review.',
        })
        await refreshDrafts()
      } else {
        setWorkflowMessage({ type: 'error', text: data.error || 'Failed to submit review.' })
      }
    } catch (err: unknown) {
      setWorkflowMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsSubmittingWorkflow(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedDraftId) return
    setIsSubmittingWorkflow(true)
    setWorkflowMessage(null)
    try {
      const res = await fetch('/api/admin/social/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          draftId: selectedDraftId,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraftStatus('approved')
        setWorkflowMessage({
          type: 'success',
          text: 'Draft approved! Platform variants hashed with operator attribution.',
        })
        await refreshDrafts()
      } else {
        setWorkflowMessage({
          type: 'error',
          text: data.error || 'Approval rejected by authorization policy.',
        })
      }
    } catch (err: unknown) {
      setWorkflowMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsSubmittingWorkflow(false)
    }
  }

  const handleDecline = async () => {
    if (!selectedDraftId) return
    setIsSubmittingWorkflow(true)
    setWorkflowMessage(null)
    try {
      const res = await fetch('/api/admin/social/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'decline',
          draftId: selectedDraftId,
          reason: 'Declined during editorial review',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraftStatus('cancelled')
        setWorkflowMessage({
          type: 'info',
          text: 'Draft declined and cancelled. It will not be sent.',
        })
        await refreshDrafts()
      } else {
        setWorkflowMessage({ type: 'error', text: data.error || 'Decline failed.' })
      }
    } catch (err: unknown) {
      setWorkflowMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsSubmittingWorkflow(false)
    }
  }

  const handleSchedule = async () => {
    if (!selectedDraftId) return
    setIsSubmittingWorkflow(true)
    setWorkflowMessage(null)
    try {
      const targetIso = new Date(scheduledDateTime).toISOString()
      const res = await fetch('/api/admin/social/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule',
          draftId: selectedDraftId,
          scheduledFor: targetIso,
          timeZone: 'UTC',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraftStatus('scheduled')
        setPersistedQueueItems(data.queueItems || [])
        setWorkflowMessage({
          type: 'success',
          text: `Draft scheduled successfully! Created ${data.queueCount || 0} queue items.`,
        })
        await refreshDrafts()
      } else {
        setWorkflowMessage({ type: 'error', text: data.error || 'Failed to schedule draft.' })
      }
    } catch (err: unknown) {
      setWorkflowMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsSubmittingWorkflow(false)
    }
  }

  // Current active account & variant
  const activeAccount =
    accounts.find((a) => a.id === activeTabAccountId) || accounts[0] || FALLBACK_PREVIEW_ACCOUNT
  const activeVariant = canonicalPost.variants.find((v) => v.accountId === activeAccount.id)

  const effectiveCopy = activeVariant
    ? resolveEffectiveCopy(canonicalPost, activeVariant)
    : canonicalPost.baseCopy

  // Platform limits for active tab
  const charLimit =
    activeAccount.network === 'x'
      ? 280
      : activeAccount.network === 'bluesky'
        ? 300
        : activeAccount.network === 'mastodon' ||
            activeAccount.network === 'activitypub' ||
            activeAccount.network === 'threads' ||
            activeAccount.network === 'pinterest'
          ? 500
          : activeAccount.network === 'discord'
            ? 2000
            : activeAccount.network === 'instagram' || activeAccount.network === 'tiktok'
              ? 2200
              : activeAccount.network === 'linkedin'
                ? 3000
                : activeAccount.network === 'telegram'
                  ? imageUrl
                    ? 1024
                    : 4096
                  : 5000

  const charCount = effectiveCopy.length
  const isOverLimit = charCount > charLimit
  const percentUsed = Math.min(100, Math.round((charCount / charLimit) * 100))

  const handleProcessQueue = async () => {
    setIsProcessingQueue(true)
    setWorkerResult(null)
    try {
      const res = await fetch('/api/admin/social/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        setWorkerResult(
          `Worker processed ${data.summary?.processedCount ?? 0} jobs (${data.summary?.succeededCount ?? 0} succeeded)`,
        )
      } else {
        setWorkerResult(`Worker failed: ${data.error || 'Unknown error'}`)
      }
    } catch (err: unknown) {
      setWorkerResult(`Worker error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsProcessingQueue(false)
    }
  }

  // Handle Base Copy Changes
  const handleBaseCopyChange = (newText: string) => {
    const updated = updateCanonicalCopy({ ...canonicalPost }, newText)
    setCanonicalPost({ ...updated.post })
  }

  // Handle Variant Override Toggle
  const handleToggleOverride = (override: boolean) => {
    if (!activeVariant) return
    const postCopy = { ...canonicalPost }
    if (override) {
      overrideVariantCopy(postCopy, activeVariant.id, effectiveCopy)
    } else {
      resetVariantOverride(postCopy, activeVariant.id)
    }
    setCanonicalPost({ ...postCopy })
  }

  // Handle Variant Text Change
  const handleVariantCopyChange = (newText: string) => {
    if (!activeVariant) return
    const postCopy = { ...canonicalPost }
    overrideVariantCopy(postCopy, activeVariant.id, newText)
    setCanonicalPost({ ...postCopy })
  }

  // Validation Rules Evaluation
  const validationFindings = useMemo(() => {
    const blockers: string[] = []
    const warnings: string[] = []

    for (const accId of selectedAccountIds) {
      const acc = accounts.find((a) => a.id === accId)
      if (!acc) continue
      const v = canonicalPost.variants.find((variant) => variant.accountId === accId)
      const copy = v ? resolveEffectiveCopy(canonicalPost, v) : canonicalPost.baseCopy

      const limit =
        acc.network === 'x'
          ? 280
          : acc.network === 'bluesky'
            ? 300
            : acc.network === 'mastodon' ||
              acc.network === 'activitypub' ||
              acc.network === 'threads' ||
              acc.network === 'pinterest'
              ? 500
              : acc.network === 'discord'
                ? 2000
                : acc.network === 'instagram' || acc.network === 'tiktok'
                  ? 2200
                  : acc.network === 'linkedin'
                    ? 3000
                    : acc.network === 'telegram'
                      ? imageUrl
                        ? 1024
                        : 4096
                      : 5000

      if (copy.length > limit) {
        blockers.push(
          `${acc.network.toUpperCase()}: Copy exceeds limit (${copy.length}/${limit} chars)`,
        )
      }

      if ((acc.network === 'instagram' || acc.network === 'pinterest') && !imageUrl) {
        blockers.push(`${acc.network.toUpperCase()}: Media attachment is mandatory.`)
      }

      if (acc.network === 'pinterest' && !pinterestBoardId) {
        blockers.push(`PINTEREST: Destination boardId selection is required.`)
      }

      if (acc.status === 'reconnect_required') {
        blockers.push(`${acc.network.toUpperCase()}: Account requires reconnection.`)
      }
    }

    return { blockers, warnings, isValid: blockers.length === 0 }
  }, [canonicalPost, selectedAccountIds, accounts, imageUrl, pinterestBoardId])

  return (
    <div
      style={{
        padding: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '16px',
        }}
      >
        <div>
          <h1
            style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#111827' }}
          >
            Social Distribution Command Center
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            Persisted drafts, delivery queue, and provider recovery. This local preview is not
            saved; create and approve a Social Draft for coordinated release delivery.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {workerResult && (
            <span
              style={{ fontSize: '12px', color: '#2563eb', fontWeight: 500, marginRight: '8px' }}
            >
              {workerResult}
            </span>
          )}
          <button
            style={{
              padding: '8px 14px',
              backgroundColor: '#475569',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: isProcessingQueue ? 'wait' : 'pointer',
              opacity: isProcessingQueue ? 0.7 : 1,
              fontSize: '13px',
            }}
            disabled={isProcessingQueue}
            onClick={handleProcessQueue}
          >
            {isProcessingQueue ? 'Processing Queue...' : '⚡ Process Background Queue'}
          </button>
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px',
            }}
            onClick={() => router.push('/admin/collections/social-drafts')}
          >
            Create Persisted Distribution Draft
          </button>
        </div>
      </div>

      {/* Connected Accounts Strip */}
      <div style={{ marginBottom: '24px' }}>
        <h2
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          Configured Distribution Targets ({accounts.length})
        </h2>
        {accounts.length === 0 ? (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: '8px',
              color: '#64748b',
              fontSize: '13px',
            }}
          >
            <strong>0 Accounts Configured.</strong> To distribute, configure accounts in{' '}
            <code>Collections &rarr; Social Accounts</code>. Bluesky is the sole supported native
            adapter proved against a local provider harness. Live remote acceptance is unverified;
            other networks require separate manual handoff.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {accounts.map((acc) => {
              const isSelected = selectedAccountIds.includes(acc.id)
              return (
                <div
                  key={acc.id}
                  data-testid={`account-card-${acc.network}`}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedAccountIds(selectedAccountIds.filter((id) => id !== acc.id))
                    } else {
                      setSelectedAccountIds([...selectedAccountIds, acc.id])
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #d1d5db',
                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <span
                    title={
                      acc.status === 'active'
                        ? 'Credentials healthy; delivery not verified'
                        : 'Reconnection required'
                    }
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#1e293b',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                    }}
                  >
                    {acc.network}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>
                    {acc.handle}
                  </span>
                  {acc.mode && (
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor:
                          acc.mode === 'local-harness' || acc.mode === 'fixture'
                            ? '#e0e7ff'
                            : '#f1f5f9',
                        color:
                          acc.mode === 'local-harness' || acc.mode === 'fixture'
                            ? '#3730a3'
                            : '#475569',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      {acc.mode}
                    </span>
                  )}
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: acc.status === 'active' ? '#10b981' : '#ef4444',
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
        <Link href="/admin/collections/social-queue-items">Delivery queue and recovery state</Link>{' '}
        •{' '}
        <Link href="/admin/collections/social-publish-attempts">Provider attempt failures</Link> •{' '}
        <Link href="/admin/collections/social-accounts">Provider configuration</Link>
      </p>

      {/* Provider Capabilities Truth Matrix */}
      <div
        style={{
          marginBottom: '24px',
          padding: '14px 16px',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#166534',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>
          Distribution Provider Truth &amp; Capabilities
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              borderRadius: '6px',
              border: '1px solid #dcfce7',
            }}
          >
            <span style={{ fontWeight: 600, color: '#15803d' }}>Bluesky:</span>{' '}
            <strong>Native adapter</strong> (Local provider failure/recovery proved; live remote
            acceptance unverified)
          </div>
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              borderRadius: '6px',
              border: '1px solid #dcfce7',
            }}
          >
            <span style={{ fontWeight: 600, color: '#15803d' }}>Mastodon:</span>{' '}
            <strong>Native adapter</strong> (Local instance outbox/media proved; remote
            interoperability unverified)
          </div>
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              borderRadius: '6px',
              border: '1px solid #f1f5f9',
            }}
          >
            <span style={{ fontWeight: 600, color: '#475569' }}>
              X, Threads, FB, IG, LinkedIn, YT, TikTok:
            </span>{' '}
            <strong>Manual Handoff</strong> (Separate operator delivery; no native delivery claim)
          </div>
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              borderRadius: '6px',
              border: '1px solid #fee2e2',
            }}
          >
            <span style={{ fontWeight: 600, color: '#991b1b' }}>ActivityPub / Federation:</span>{' '}
            <strong>Remote interoperability deferred</strong> (Local signing/outbox/failure only)
          </div>
        </div>
      </div>

      {/* PERSISTED DRAFT & SCHEDULING WORKFLOW CARD */}
      <div
        data-testid="draft-workflow-panel"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #cbd5e1',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginBottom: '4px',
                }}
              >
                Saved Drafts
              </label>
              <select
                data-testid="draft-select"
                value={selectedDraftId}
                onChange={(e) => void loadDraft(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  backgroundColor: '#f8fafc',
                }}
              >
                <option value="">+ New Draft...</option>
                {savedDrafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title || d.id} ({d.status || 'draft'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1 1 300px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginBottom: '4px',
                }}
              >
                Draft Title
              </label>
              <input
                data-testid="draft-title-input"
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="e.g. Release 1.0 General Announcement"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {selectedDraftId && (
              <span
                data-testid="current-draft-id"
                style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}
              >
                ID: {selectedDraftId}
              </span>
            )}
            <span
              data-testid="draft-status-badge"
              style={{
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                backgroundColor:
                  draftStatus === 'approved'
                    ? '#dcfce7'
                    : draftStatus === 'review'
                      ? '#dbeafe'
                      : draftStatus === 'scheduled'
                        ? '#f3e8ff'
                        : draftStatus === 'cancelled'
                          ? '#fee2e2'
                          : '#fef3c7',
                color:
                  draftStatus === 'approved'
                    ? '#166534'
                    : draftStatus === 'review'
                      ? '#1e40af'
                      : draftStatus === 'scheduled'
                        ? '#6b21a8'
                        : draftStatus === 'cancelled'
                          ? '#991b1b'
                          : '#92400e',
              }}
            >
              {draftStatus || 'UNSAVED DRAFT'}
            </span>
          </div>
        </div>

        {/* Workflow Action Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            paddingTop: '12px',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <button
            data-testid="save-draft-btn"
            disabled={isSubmittingWorkflow}
            onClick={() => void handleSaveDraft()}
            style={{
              padding: '8px 14px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: isSubmittingWorkflow ? 'wait' : 'pointer',
              opacity: isSubmittingWorkflow ? 0.7 : 1,
            }}
          >
            {selectedDraftId ? '💾 Update Draft' : '💾 Save New Draft'}
          </button>

          {selectedDraftId && draftStatus === 'draft' && (
            <button
              data-testid="submit-review-btn"
              disabled={isSubmittingWorkflow}
              onClick={() => void handleSubmitReview()}
              style={{
                padding: '8px 14px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: isSubmittingWorkflow ? 'wait' : 'pointer',
                opacity: isSubmittingWorkflow ? 0.7 : 1,
              }}
            >
              📨 Submit for Editorial Review
            </button>
          )}

          {selectedDraftId && draftStatus === 'review' && (
            <>
              <button
                data-testid="approve-draft-btn"
                disabled={isSubmittingWorkflow}
                onClick={() => void handleApprove()}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isSubmittingWorkflow ? 'wait' : 'pointer',
                  opacity: isSubmittingWorkflow ? 0.7 : 1,
                }}
              >
                ✅ Approve Draft (Owner/Admin)
              </button>
              <button
                data-testid="decline-draft-btn"
                disabled={isSubmittingWorkflow}
                onClick={() => void handleDecline()}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isSubmittingWorkflow ? 'wait' : 'pointer',
                  opacity: isSubmittingWorkflow ? 0.7 : 1,
                }}
              >
                ❌ Decline Draft
              </button>
            </>
          )}

          {selectedDraftId && draftStatus === 'approved' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                data-testid="schedule-time-input"
                type="datetime-local"
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                }}
              />
              <button
                data-testid="schedule-draft-btn"
                disabled={isSubmittingWorkflow}
                onClick={() => void handleSchedule()}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isSubmittingWorkflow ? 'wait' : 'pointer',
                  opacity: isSubmittingWorkflow ? 0.7 : 1,
                }}
              >
                📅 Schedule Queue Items
              </button>
            </div>
          )}

          {draftStatus === 'scheduled' && (
            <span
              style={{
                fontSize: '13px',
                color: '#6b21a8',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              ✓ Release distribution scheduled in background queue.
            </span>
          )}

          {draftStatus === 'cancelled' && (
            <span
              style={{
                fontSize: '13px',
                color: '#991b1b',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              ✕ Draft was declined during review. Execution denied.
            </span>
          )}
        </div>

        {/* Workflow Message Banner */}
        {workflowMessage && (
          <div
            data-testid="workflow-message"
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor:
                workflowMessage.type === 'success'
                  ? '#ecfdf5'
                  : workflowMessage.type === 'error'
                    ? '#fef2f2'
                    : '#eff6ff',
              color:
                workflowMessage.type === 'success'
                  ? '#065f46'
                  : workflowMessage.type === 'error'
                    ? '#b91c1c'
                    : '#1e40af',
              border: `1px solid ${
                workflowMessage.type === 'success'
                  ? '#a7f3d0'
                  : workflowMessage.type === 'error'
                    ? '#fecaca'
                    : '#bfdbfe'
              }`,
            }}
          >
            {workflowMessage.text}
          </div>
        )}

        {/* Persisted Queue Items Table */}
        {persistedQueueItems.length > 0 && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              Persisted Queue Items (
              <span data-testid="persisted-queue-count">{persistedQueueItems.length}</span>)
            </div>
            <table
              data-testid="queue-items-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', color: '#64748b' }}>
                  <th style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>ID</th>
                  <th style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                  <th style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>
                    Scheduled For
                  </th>
                  <th style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>
                    Idempotency Key
                  </th>
                </tr>
              </thead>
              <tbody>
                {persistedQueueItems.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{item.id}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#f3e8ff',
                          color: '#6b21a8',
                          fontWeight: 600,
                        }}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px' }}>{item.scheduledFor}</td>
                    <td
                      style={{
                        padding: '6px 10px',
                        fontFamily: 'monospace',
                        color: '#64748b',
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.idempotencyKey}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Grid: Composer (Left) & Fidelity Preview / Checklist (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '24px' }}>
        {/* Left Column: Composer */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
          }}
        >
          {/* Canonical Base Copy */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 600,
                fontSize: '14px',
                marginBottom: '6px',
                color: '#374151',
              }}
            >
              Canonical Base Copy (Source Truth)
            </label>
            <textarea
              data-testid="canonical-copy-textarea"
              rows={4}
              value={canonicalPost.baseCopy}
              onChange={(e) => handleBaseCopyChange(e.target.value)}
              placeholder="Compose strategic message here. Un-overridden networks inherit this automatically..."
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                lineHeight: '1.5',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Canonical Media & Link */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 500,
                  fontSize: '13px',
                  marginBottom: '4px',
                  color: '#4b5563',
                }}
              >
                Canonical Link URL
              </label>
              <input
                data-testid="canonical-url-input"
                type="text"
                value={canonicalPost.canonicalUrl || ''}
                onChange={(e) =>
                  setCanonicalPost({ ...canonicalPost, canonicalUrl: e.target.value })
                }
                placeholder="https://renegadeparty.org/..."
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 500,
                  fontSize: '13px',
                  marginBottom: '4px',
                  color: '#4b5563',
                }}
              >
                Attached Media URL
              </label>
              <input
                data-testid="image-url-input"
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://.../image.jpg"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Network-Specific Override Tabs */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
                {accounts
                  .filter((a) => selectedAccountIds.includes(a.id))
                  .map((a) => (
                    <button
                      key={a.id}
                      data-testid={`network-tab-${a.network}`}
                      onClick={() => setActiveTabAccountId(a.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activeTabAccountId === a.id ? '#2563eb' : '#f3f4f6',
                        color: activeTabAccountId === a.id ? '#ffffff' : '#4b5563',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                      }}
                    >
                      {a.network}
                    </button>
                  ))}
              </div>

              {/* Override Toggle */}
              {activeVariant && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    color: '#374151',
                  }}
                >
                  <input
                    data-testid="variant-override-checkbox"
                    type="checkbox"
                    checked={activeVariant.isOverridden}
                    onChange={(e) => handleToggleOverride(e.target.checked)}
                  />
                  Customize for {activeAccount.network.toUpperCase()}
                </label>
              )}
            </div>

            {/* Active Variant Editor */}
            {activeVariant && (
              <div>
                <textarea
                  data-testid="variant-copy-textarea"
                  rows={4}
                  value={effectiveCopy}
                  disabled={!activeVariant.isOverridden}
                  onChange={(e) => handleVariantCopyChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: isOverLimit ? '2px solid #ef4444' : '1px solid #d1d5db',
                    backgroundColor: activeVariant.isOverridden ? '#ffffff' : '#f9fafb',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    boxSizing: 'border-box',
                  }}
                />

                {/* Meter Bar */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '6px',
                    fontSize: '12px',
                  }}
                >
                  <span
                    data-testid="character-count-display"
                    style={{ color: isOverLimit ? '#ef4444' : '#6b7280', fontWeight: 500 }}
                  >
                    {charCount} / {charLimit} characters
                  </span>
                  <span
                    style={{
                      color: activeVariant.isOverridden ? '#2563eb' : '#9ca3af',
                      fontWeight: 500,
                    }}
                  >
                    {activeVariant.isOverridden
                      ? '⚡ Overridden from canonical'
                      : '🔗 Inheriting canonical copy'}
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '2px',
                    marginTop: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${percentUsed}%`,
                      height: '100%',
                      backgroundColor: isOverLimit
                        ? '#ef4444'
                        : percentUsed > 90
                          ? '#f59e0b'
                          : '#10b981',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>

                {/* Network Specific Controls */}
                {(activeAccount.network === 'mastodon' ||
                  activeAccount.network === 'activitypub') && (
                  <div style={{ marginTop: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#4b5563',
                        marginBottom: '2px',
                      }}
                    >
                      Content Warning / Spoiler Banner
                    </label>
                    <input
                      data-testid="mastodon-cw-input"
                      type="text"
                      value={contentWarning}
                      onChange={(e) => setContentWarning(e.target.value)}
                      placeholder="Optional content warning..."
                      style={{
                        width: '100%',
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {activeAccount.network === 'pinterest' && (
                  <div style={{ marginTop: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#4b5563',
                        marginBottom: '2px',
                      }}
                    >
                      Destination Board ID (Required)
                    </label>
                    <select
                      value={pinterestBoardId}
                      onChange={(e) => setPinterestBoardId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '13px',
                      }}
                    >
                      <option value="board-announcements">Announcements & Releases</option>
                      <option value="board-guides">Design Systems & Architecture</option>
                    </select>
                  </div>
                )}

                {activeAccount.network === 'telegram' && (
                  <div style={{ marginTop: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#4b5563',
                        marginBottom: '2px',
                      }}
                    >
                      Telegram Target Channel or Chat ID
                    </label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="@renegade_channel or -100123456789"
                      style={{
                        width: '100%',
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {activeAccount.network === 'discord' && (
                  <div style={{ marginTop: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#4b5563',
                        marginBottom: '2px',
                      }}
                    >
                      Discord Webhook URL or Target Channel
                    </label>
                    <input
                      type="text"
                      value={discordWebhookUrl}
                      onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                      placeholder="https://discord.com/api/webhooks/..."
                      style={{
                        width: '100%',
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Fidelity Preview & Validation Checklist */}
        <div>
          {/* Preflight Validation Banner */}
          <div
            data-testid="validation-gate-banner"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <h3
              style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: '0 0 10px 0' }}
            >
              Pre-Flight Validation Gates
            </h3>
            {validationFindings.blockers.length === 0 ? (
              <div
                data-testid="validation-gate-passed"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#059669',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                <span>✓</span> Local preview checks passed. Ready for draft review.
              </div>
            ) : (
              <div
                data-testid="validation-gate-blocked"
                style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                {validationFindings.blockers.map((blocker, idx) => (
                  <div
                    key={idx}
                    data-testid={`validation-blocker-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#dc2626',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    <span>⚠</span> {blocker}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Fidelity Preview Card */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#374151',
                  textTransform: 'uppercase',
                }}
              >
                Local {activeAccount.network.toUpperCase()} Preview
              </span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>Client Rendering Fidelity</span>
            </div>

            {/* Simulated Card Container */}
            <div
              style={{
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: activeAccount.network === 'x' ? '#000000' : '#ffffff',
                color: activeAccount.network === 'x' ? '#ffffff' : '#0f172a',
                padding: '14px',
                fontSize: '14px',
                lineHeight: '1.4',
              }}
            >
              {/* Header */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                >
                  R
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Renegade CMoS</div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: activeAccount.network === 'x' ? '#71767b' : '#64748b',
                    }}
                  >
                    {activeAccount.handle} · Just now
                  </div>
                </div>
              </div>

              {/* Spoiler Banner for Mastodon / ActivityPub */}
              {(activeAccount.network === 'mastodon' ||
                activeAccount.network === 'activitypub') &&
                contentWarning && (
                <div
                  style={{
                    padding: '6px 8px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                  }}
                >
                  CW: {contentWarning}
                </div>
              )}

              {/* Post Body */}
              <div
                data-testid="preview-post-body"
                style={{ whiteSpace: 'pre-wrap', marginBottom: '10px', fontSize: '13px' }}
              >
                {effectiveCopy}
              </div>

              {/* Media Preview */}
              {imageUrl && (
                <div
                  style={{
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '1px solid #cbd5e1',
                    marginBottom: '8px',
                  }}
                >
                  <img
                    src={imageUrl}
                    alt="Preview"
                    style={{
                      width: '100%',
                      height: activeAccount.network === 'pinterest' ? '280px' : '180px',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              )}

              {/* Action Bar Simulation */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  paddingTop: '8px',
                  borderTop: '1px solid #f1f5f9',
                  fontSize: '12px',
                  color: '#94a3b8',
                }}
              >
                <span>💬 Reply</span>
                <span>🔁 Repost</span>
                <span>❤️ Like</span>
                <span>🔗 Share</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
