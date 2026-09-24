'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { type SocialNetwork, type SocialState } from '../social/contracts'
import {
  createCanonicalSocialPost,
  overrideVariantCopy,
  resetVariantOverride,
  resolveEffectiveCopy,
  updateCanonicalCopy,
  type CanonicalSocialPost,
} from '../social/models'
import { PLATFORM_MEDIA_RULES } from '../social/media-pipeline'

interface ConnectedAccountUI {
  id: string
  network: SocialNetwork
  handle: string
  avatarUrl?: string
  status: 'active' | 'reconnect_required' | 'expired'
  tokenExpiresInDays?: number
}

const DEFAULT_ACCOUNTS: ConnectedAccountUI[] = [
  {
    id: 'acc-mastodon',
    network: 'mastodon',
    handle: '@renegade@mastodon.social',
    status: 'active',
  },
  { id: 'acc-bluesky', network: 'bluesky', handle: 'renegadeparty.bsky.social', status: 'active' },
  {
    id: 'acc-linkedin',
    network: 'linkedin',
    handle: 'Renegade Sovereign Media',
    status: 'active',
    tokenExpiresInDays: 45,
  },
  { id: 'acc-facebook', network: 'facebook', handle: 'Renegade CMS Official', status: 'active' },
  {
    id: 'acc-instagram',
    network: 'instagram',
    handle: '@renegade.cms',
    status: 'active',
    tokenExpiresInDays: 28,
  },
  {
    id: 'acc-threads',
    network: 'threads',
    handle: '@renegade.cms',
    status: 'active',
    tokenExpiresInDays: 28,
  },
  { id: 'acc-pinterest', network: 'pinterest', handle: 'Renegade Discovery', status: 'active' },
  { id: 'acc-youtube', network: 'youtube', handle: 'Renegade Media Studio', status: 'active' },
  { id: 'acc-tiktok', network: 'tiktok', handle: '@renegade.media', status: 'active' },
  { id: 'acc-x', network: 'x', handle: '@RenegadeCMoS', status: 'active' },
  { id: 'acc-telegram', network: 'telegram', handle: '@renegade_broadcast', status: 'active' },
  { id: 'acc-discord', network: 'discord', handle: '#announcements (Renegade)', status: 'active' },
]

export default function SocialCommandCenter() {
  const [accounts, setAccounts] = useState<ConnectedAccountUI[]>(DEFAULT_ACCOUNTS)
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([
    'acc-mastodon',
    'acc-bluesky',
    'acc-linkedin',
    'acc-instagram',
  ])
  const [activeTabAccountId, setActiveTabAccountId] = useState<string>('acc-mastodon')

  // Canonical Post State
  const [canonicalPost, setCanonicalPost] = useState<CanonicalSocialPost>(() =>
    createCanonicalSocialPost({
      id: 'post-draft-current',
      siteId: 'site-alpha',
      publicationId: 'pub-main',
      title: 'Spring 2026 Sovereign Publishing Launch',
      baseCopy:
        'We are thrilled to unveil Renegade CMoS: decentralized, multi-network distribution built for creators and sovereign publications. Read the full announcement: https://renegadeparty.org/launch-2026',
      canonicalUrl: 'https://renegadeparty.org/launch-2026',
      authorId: 'user-admin',
      targetAccounts: DEFAULT_ACCOUNTS.map((a) => ({ accountId: a.id, network: a.network })),
    }),
  )

  const [imageUrl, setImageUrl] = useState<string>(
    'https://renegadeparty.org/media/hero-launch.jpg',
  )
  const [imageRole, setImageRole] = useState<'image' | 'video'>('image')
  const [pinterestBoardId, setPinterestBoardId] = useState<string>('board-announcements')
  const [telegramChatId, setTelegramChatId] = useState<string>('@renegade_broadcast')
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState<string>('')
  const [contentWarning, setContentWarning] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false)
  const [workerResult, setWorkerResult] = useState<string | null>(null)
  const [isSimulation, setIsSimulation] = useState<boolean>(true)

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
          }))
          setAccounts(liveAccounts)
          setSelectedAccountIds(liveAccounts.map((a) => a.id))
          setActiveTabAccountId(liveAccounts[0].id)
          setIsSimulation(false)
        } else {
          setIsSimulation(true)
        }
      })
      .catch(() => {
        setIsSimulation(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Current active account & variant
  const activeAccount = accounts.find((a) => a.id === activeTabAccountId) || accounts[0]
  const activeVariant = canonicalPost.variants.find((v) => v.accountId === activeAccount.id)

  const effectiveCopy = activeVariant
    ? resolveEffectiveCopy(canonicalPost, activeVariant)
    : canonicalPost.baseCopy

  // Platform limits for active tab
  const platformRules = PLATFORM_MEDIA_RULES[activeAccount.network]
  const charLimit =
    activeAccount.network === 'x'
      ? 280
      : activeAccount.network === 'bluesky'
        ? 300
        : activeAccount.network === 'mastodon' ||
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
        body: JSON.stringify({ posts: [canonicalPost] }),
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
            : acc.network === 'mastodon' || acc.network === 'threads' || acc.network === 'pinterest'
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
            Unified multi-channel distribution engine across commercial walled gardens and open
            federated protocols.
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
              cursor: validationFindings.isValid ? 'pointer' : 'not-allowed',
              opacity: validationFindings.isValid ? 1 : 0.6,
            }}
            disabled={!validationFindings.isValid}
            onClick={() => alert('Social dispatch scheduled successfully across target accounts!')}
          >
            Dispatch Multi-Network Post
          </button>
        </div>
      </div>

      {isSimulation ? (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            color: '#92400e',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          <strong>Simulation Mode:</strong> No live social network accounts configured in Collections &rarr; Social Accounts. Displaying simulated platform preview channels.
        </div>
      ) : null}

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
          Connected Distribution Targets ({accounts.length})
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {accounts.map((acc) => {
            const isSelected = selectedAccountIds.includes(acc.id)
            return (
              <div
                key={acc.id}
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
              Canonical Base Copy (Source of Truth)
            </label>
            <textarea
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
                  <span style={{ color: isOverLimit ? '#ef4444' : '#6b7280', fontWeight: 500 }}>
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
                {activeAccount.network === 'mastodon' && (
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#059669',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                <span>✓</span> All target network requirements satisfied! Ready for dispatch.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {validationFindings.blockers.map((blocker, idx) => (
                  <div
                    key={idx}
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
                Live {activeAccount.network.toUpperCase()} Preview
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

              {/* Spoiler Banner for Mastodon */}
              {activeAccount.network === 'mastodon' && contentWarning && (
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
              <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px', fontSize: '13px' }}>
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
