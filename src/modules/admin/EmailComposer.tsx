'use client'

import Link from 'next/link'
import React, { useEffect, useState, useTransition } from 'react'
import type { MessageDesign } from '../audience/email-composer'

type ArticleItem = {
  id: string
  title: string
  summary: string
  canonicalPath: string
  publishedAt?: string
}

type SegmentItem = {
  id: string
  name: string
  version: string
  status: string
}

type TemplateItem = {
  id: string
  name: string
  version: string
  brandTokens?: { background?: string; foreground?: string; accent?: string }
}

type CampaignItem = {
  id: string
  subject: string
  status: string
  kind?: string
  scheduledFor?: string
  reviewedAt?: string
  recipientSnapshot?: unknown
  createdAt: string
}

type EvaluationCounts = {
  totalSubscribers: number
  matchedSubscribers: number
  eligibleConsented: number
  unconsentedOrPending: number
  suppressed: number
  duplicates: number
  isEmpty: boolean
}

export default function EmailComposer() {
  const [site, setSite] = useState<{ id: string; name: string; slug: string } | null>(null)
  const [articles, setArticles] = useState<ArticleItem[]>([])
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [segments, setSegments] = useState<SegmentItem[]>([])
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Step 1: Article derivation & copy
  const [selectedArticleId, setSelectedArticleId] = useState<string>('')
  const [subject, setSubject] = useState<string>('Freedom Act Update: Key Developments')
  const [preheader, setPreheader] = useState<string>('Essential updates from the Renegade movement.')
  const [headingText, setHeadingText] = useState<string>('Freedom Act Update')
  const [bodyText, setBodyText] = useState<string>(
    'We are excited to share key updates on our ongoing legislative initiatives and grassroots campaigns.',
  )
  const [buttonLabel, setButtonLabel] = useState<string>('Read Full Story')
  const [buttonHref, setButtonHref] = useState<string>('https://renegadeparty.org/news/freedom-act')
  const [pinnedCard, setPinnedCard] = useState<{
    contentId: string
    revisionId: string
    url: string
    title: string
    summary: string
  } | null>(null)

  // Step 2: Template & Brand Tokens
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('standard')
  const [bgColor, setBgColor] = useState<string>('#ffffff')
  const [fgColor, setFgColor] = useState<string>('#172033')
  const [accentColor, setAccentColor] = useState<string>('#164e9b')

  // Legal block (mandatory)
  const [legalAddress, setLegalAddress] = useState<string>('123 Renegade Way, Suite 100, Washington, DC 20001')
  const [preferenceUrl, setPreferenceUrl] = useState<string>('https://renegadeparty.org/audience/preferences')
  const [unsubscribeUrl, setUnsubscribeUrl] = useState<string>('https://renegadeparty.org/audience/unsubscribe')

  // Step 3: Audience Segment & Targeting
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>('')
  const [evaluationCounts, setEvaluationCounts] = useState<EvaluationCounts | null>(null)
  const [evaluatingSegment, setEvaluatingSegment] = useState(false)

  // Step 4: Preview & Test Send
  const [previewTab, setPreviewTab] = useState<'html' | 'text'>('html')
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewText, setPreviewText] = useState<string>('')
  const [previewHash, setPreviewHash] = useState<string>('')
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([])
  const [testEmail, setTestEmail] = useState<string>('operator@renegadeparty.org')
  const [testSendStatus, setTestSendStatus] = useState<string>('')
  const [isTestSending, setIsTestSending] = useState(false)

  // Step 5: Scheduling & Status
  const [scheduledFor, setScheduledFor] = useState<string>('2026-10-21T14:00')
  const [campaignStatus, setCampaignStatus] = useState<'draft' | 'review' | 'scheduled'>('draft')
  const [createdMessageId, setCreatedMessageId] = useState<string | null>(null)
  const [snapshotHash, setSnapshotHash] = useState<string | null>(null)
  const [frozenRecipients, setFrozenRecipients] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  // Delivery Retry (Legacy maintenance action)
  const [retryDeliveryId, setRetryDeliveryId] = useState('')
  const [retryStatus, setRetryStatus] = useState('')

  // Load initial data
  useEffect(() => {
    let active = true
    async function loadData() {
      try {
        setLoading(true)
        const res = await fetch('/api/admin/audience/campaign')
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        if (active) {
          setSite(data.site)
          setArticles(data.articles || [])
          setTemplates(data.templates || [])
          setSegments(data.segments || [])
          setCampaigns(data.campaigns || [])
          if (data.segments?.length > 0) {
            setSelectedSegmentId(data.segments[0].id)
          }
          if (data.articles?.length > 0) {
            setSelectedArticleId(data.articles[0].id)
          }
        }
      } catch (err: unknown) {
        if (active) setError(String(err))
      } finally {
        if (active) setLoading(false)
      }
    }
    loadData()
    return () => {
      active = false
    }
  }, [])

  // Build current MessageDesign object
  const buildDesign = (overrides?: {
    heading?: string
    body?: string
    buttonLabel?: string
    buttonHref?: string
    pinnedCard?: {
      contentId: string
      revisionId: string
      url: string
      title: string
      summary: string
    } | null
  }): MessageDesign => {
    const heading = overrides?.heading ?? headingText
    const body = overrides?.body ?? bodyText
    const btnLabel = overrides?.buttonLabel ?? buttonLabel
    const btnHref = overrides?.buttonHref ?? buttonHref
    const card = overrides ? overrides.pinnedCard : pinnedCard

    const blocks: MessageDesign['blocks'] = [
      { type: 'heading', text: heading },
      { type: 'text', text: body },
    ]

    if (card) {
      blocks.push({
        type: 'content-card',
        source: {
          contentId: card.contentId,
          revisionId: card.revisionId,
          url: card.url,
          title: card.title,
          summary: card.summary,
        },
      })
    }

    blocks.push({
      type: 'button',
      label: btnLabel,
      href: btnHref,
    })

    blocks.push({ type: 'divider' })

    blocks.push({
      type: 'legal',
      address: legalAddress,
      preferenceUrl,
      unsubscribeUrl,
    })

    return {
      version: 1,
      templateVersion: '1.0.0',
      locale: 'en',
      tokens: {
        background: bgColor,
        foreground: fgColor,
        accent: accentColor,
        fontFamily: 'Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      blocks,
      plainTextStrategy: 'generated',
      personalization: {
        missingValue: 'fallback',
        fallbacks: {
          'recipient.firstName': 'Friend',
          'recipient.lastName': 'Supporter',
          'recipient.email': 'reader@renegadeparty.org',
          'site.name': site?.name || 'Renegade Party',
        },
      },
    }
  }

  // Derive newsletter from selected article
  const handleDeriveArticle = () => {
    const article = articles.find((a) => a.id === selectedArticleId)
    if (!article) return

    setSubject(article.title)
    setHeadingText(article.title)
    setPreheader(article.summary ? article.summary.slice(0, 140) : `Read our latest story: ${article.title}`)
    const derivedBody =
      article.summary ||
      'We are pleased to share our newest report with you. Read key takeaways and explore our interactive resources below.'
    setBodyText(derivedBody)
    const resolvedUrl = article.canonicalPath.startsWith('http')
      ? article.canonicalPath
      : `https://renegadeparty.org${article.canonicalPath}`
    setButtonLabel('Read Story')
    setButtonHref(resolvedUrl)

    const derivedCard = {
      contentId: article.id,
      revisionId: `rev-${article.id.slice(0, 8)}`,
      url: resolvedUrl,
      title: article.title,
      summary: article.summary,
    }
    setPinnedCard(derivedCard)

    setSuccess(`Newsletter content derived from article: "${article.title}".`)
    const derivedDesign = buildDesign({
      heading: article.title,
      body: derivedBody,
      buttonLabel: 'Read Story',
      buttonHref: resolvedUrl,
      pinnedCard: derivedCard,
    })
    handlePreview(derivedDesign, article.title)
  }

  // Evaluate selected segment
  const handleEvaluateSegment = async (segId?: string) => {
    const idToEvaluate = segId || selectedSegmentId
    if (!idToEvaluate) return

    try {
      setEvaluatingSegment(true)
      const res = await fetch('/api/admin/audience/campaign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate-segment',
          segmentId: idToEvaluate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to evaluate segment.')
      setEvaluationCounts(data.counts)
    } catch (err: unknown) {
      setError(String(err))
    } finally {
      setEvaluatingSegment(false)
    }
  }

  // Auto-evaluate when segment selection changes
  useEffect(() => {
    if (selectedSegmentId) {
      handleEvaluateSegment(selectedSegmentId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegmentId])

  // Live preview generator
  const handlePreview = async (overrideDesign?: MessageDesign, overrideSubject?: string) => {
    try {
      const design = overrideDesign || buildDesign()
      const subj = overrideSubject ?? subject
      const res = await fetch('/api/admin/audience/campaign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          subject: subj,
          messageDesign: design,
          recipientPreview: {
            'recipient.firstName': 'Alex',
            'recipient.lastName': 'Rivera',
            'recipient.email': 'alex.rivera@renegadeparty.org',
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.errors?.join(' ') || data.error || 'Preview failed.')
      }
      setPreviewHtml(data.html)
      setPreviewText(data.text)
      setPreviewHash(data.hash)
      setPreviewWarnings(data.warnings || [])
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  // Run preview on initial mount once loaded
  useEffect(() => {
    if (!loading && articles.length > 0) {
      handlePreview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Test send to operator
  const handleTestSend = async () => {
    if (!testEmail) {
      setError('Please provide a test recipient email.')
      return
    }
    try {
      setIsTestSending(true)
      setTestSendStatus('Sending test email...')
      const design = buildDesign()
      const res = await fetch('/api/admin/audience/campaign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'test-send',
          subject: `[TEST] ${subject}`,
          recipientEmail: testEmail,
          messageDesign: design,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Test send failed.')
      setTestSendStatus(`Test send queued successfully (Delivery ID: ${data.deliveryId}). Captured in local mail sink.`)
    } catch (err: unknown) {
      setTestSendStatus(`Test send failed: ${String(err)}`)
    } finally {
      setIsTestSending(false)
    }
  }

  // Save draft, review, or schedule
  const handleSaveAndSchedule = async (targetStatus: 'draft' | 'review' | 'schedule') => {
    setError(null)
    setSuccess(null)
    if (!subject.trim()) {
      setError('Campaign subject is required.')
      return
    }
    if (!selectedSegmentId) {
      setError('Please select a target audience segment.')
      return
    }

    startTransition(async () => {
      try {
        const design = buildDesign()
        const res = await fetch('/api/admin/audience/campaign', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'save-and-schedule',
            targetStatus,
            subject,
            preheader,
            messageDesign: design,
            segmentId: selectedSegmentId,
            scheduledFor: new Date(scheduledFor).toISOString(),
            allowEmptyAudience: false,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Operation failed.')
        }

        setCampaignStatus(data.status)
        setCreatedMessageId(data.messageId)
        if (data.snapshotHash) setSnapshotHash(data.snapshotHash)
        if (data.recipientCount !== undefined) setFrozenRecipients(data.recipientCount)

        if (targetStatus === 'schedule') {
          setSuccess(
            `Campaign scheduled successfully for ${new Date(scheduledFor).toLocaleString()} targeting ${data.recipientCount} consented recipients!`,
          )
        } else if (targetStatus === 'review') {
          setSuccess('Campaign saved and submitted for review.')
        } else {
          setSuccess('Draft campaign saved.')
        }

        // Refresh campaigns
        const refRes = await fetch('/api/admin/audience/campaign')
        if (refRes.ok) {
          const refData = await refRes.json()
          setCampaigns(refData.campaigns || [])
        }
      } catch (err: unknown) {
        setError(String(err))
      }
    })
  }

  // Delivery Retry
  const handleRetryDelivery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!retryDeliveryId) return
    try {
      const response = await fetch('/api/admin/audience/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deliveryId: retryDeliveryId }),
      })
      const body = await response.json()
      setRetryStatus(
        response.ok
          ? 'Retry queued. Inspect the delivery for the resulting provider outcome.'
          : body.error || 'Retry failed',
      )
    } catch (err: unknown) {
      setRetryStatus(String(err))
    }
  }

  return (
    <main
      data-testid="email-composer-view"
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 20px 80px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#1e293b',
      }}
    >
      {/* Top Banner / Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 700, color: '#0f172a' }}>
            Newsletter & Campaign Composer
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
            Site: <strong>{site?.name || 'Loading...'}</strong> ({site?.slug || '...'}) · AUD-03 deterministic MIME
            projection
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span
            data-testid="campaign-status-badge"
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              background:
                campaignStatus === 'scheduled'
                  ? '#dcfce7'
                  : campaignStatus === 'review'
                    ? '#fef3c7'
                    : '#f1f5f9',
              color:
                campaignStatus === 'scheduled'
                  ? '#166534'
                  : campaignStatus === 'review'
                    ? '#92400e'
                    : '#475569',
              border: '1px solid currentColor',
            }}
          >
            {campaignStatus}
          </span>
          <Link
            href="/admin/collections/email-messages"
            style={{
              fontSize: 13,
              color: '#2563eb',
              textDecoration: 'none',
              padding: '6px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
            }}
          >
            All Messages
          </Link>
          <Link
            href="/admin/audience"
            style={{
              fontSize: 13,
              color: '#2563eb',
              textDecoration: 'none',
              padding: '6px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
            }}
          >
            Audience Center
          </Link>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div
          data-testid="composer-error-alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            color: '#b91c1c',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}
      {success && (
        <div
          data-testid="composer-success-alert"
          style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#15803d',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          <strong>Success:</strong> {success}
        </div>
      )}

      {/* Main Grid: Form on Left, Preview on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28, alignItems: 'start' }}>
        {/* Left Column: Form Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Section 1: Article Source Derivation */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
              1. Article Source & Derivation
            </h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
              Select a published canonical article to populate newsletter title, summary, and pinned content card.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                data-testid="article-select"
                aria-label="Select Published Article"
                value={selectedArticleId}
                onChange={(e) => setSelectedArticleId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                  background: '#f8fafc',
                }}
              >
                {articles.length === 0 ? (
                  <option value="">No published articles found</option>
                ) : (
                  articles.map((art) => (
                    <option key={art.id} value={art.id}>
                      {art.title} ({art.canonicalPath})
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                data-testid="derive-article-btn"
                onClick={handleDeriveArticle}
                disabled={articles.length === 0}
                style={{
                  padding: '9px 16px',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Derive from Article
              </button>
            </div>
          </section>

          {/* Section 2: Copy, Subject & Blocks */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
              2. Design, Subject & MIME Blocks
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Subject Line
                </label>
                <input
                  type="text"
                  data-testid="campaign-subject-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Weekly Political Dispatch #42"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Preheader Text
                </label>
                <input
                  type="text"
                  data-testid="campaign-preheader-input"
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  placeholder="Brief preview line appearing in recipient inboxes"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Heading Block
                </label>
                <input
                  type="text"
                  data-testid="block-heading-input"
                  value={headingText}
                  onChange={(e) => setHeadingText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Body Text
                </label>
                <textarea
                  data-testid="block-text-input"
                  rows={3}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                  }}
                />
              </div>

              {pinnedCard && (
                <div
                  data-testid="pinned-content-card"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: 12,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
                    Pinned Content Card
                  </span>
                  <p style={{ margin: '4px 0 2px', fontWeight: 600, fontSize: 14 }}>{pinnedCard.title}</p>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#64748b' }}>{pinnedCard.summary}</p>
                  <span style={{ fontSize: 12, color: '#2563eb' }}>{pinnedCard.url}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Button Label
                  </label>
                  <input
                    type="text"
                    data-testid="block-button-label"
                    value={buttonLabel}
                    onChange={(e) => setButtonLabel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Button Link (Absolute URL)
                  </label>
                  <input
                    type="url"
                    data-testid="block-button-href"
                    value={buttonHref}
                    onChange={(e) => setButtonHref(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Template Brand Tokens */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: 12,
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                    Background
                  </label>
                  <input
                    type="color"
                    data-testid="token-bg"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{ width: '100%', height: 32, cursor: 'pointer', border: 'none', background: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                    Foreground
                  </label>
                  <input
                    type="color"
                    data-testid="token-fg"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    style={{ width: '100%', height: 32, cursor: 'pointer', border: 'none', background: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b' }}>Accent</label>
                  <input
                    type="color"
                    data-testid="token-accent"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{ width: '100%', height: 32, cursor: 'pointer', border: 'none', background: 'none' }}
                  />
                </div>
              </div>

              {/* Mandatory Legal Footer */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: 12,
                  marginTop: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Mandatory Legal Preference & Unsubscribe Footer
                  </span>
                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>CAN-SPAM / GDPR Invariant</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b' }}>Physical Mailing Address</label>
                  <input
                    type="text"
                    data-testid="block-legal-address"
                    value={legalAddress}
                    onChange={(e) => setLegalAddress(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#64748b' }}>Preferences URL</label>
                    <input
                      type="url"
                      data-testid="block-legal-pref"
                      value={preferenceUrl}
                      onChange={(e) => setPreferenceUrl(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#64748b' }}>Unsubscribe URL</label>
                    <input
                      type="url"
                      data-testid="block-legal-unsub"
                      value={unsubscribeUrl}
                      onChange={(e) => setUnsubscribeUrl(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                      }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                data-testid="update-preview-btn"
                onClick={() => {
                  void handlePreview()
                }}
                style={{
                  padding: '8px 14px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                Refresh Preview
              </button>
            </div>
          </section>

          {/* Section 3: Audience Segment & Recipient Targeting */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
              3. Target Audience Segment
            </h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
              Choose an approved segment. The system evaluates active consent, excludes suppressions, and deduplicates
              recipients.
            </p>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                data-testid="segment-select"
                aria-label="Select Target Segment"
                value={selectedSegmentId}
                onChange={(e) => {
                  setSelectedSegmentId(e.target.value)
                  handleEvaluateSegment(e.target.value)
                }}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                  background: '#f8fafc',
                }}
              >
                {segments.length === 0 ? (
                  <option value="">No segments available</option>
                ) : (
                  segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (v{s.version.slice(0, 8)})
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                data-testid="evaluate-segment-btn"
                onClick={() => handleEvaluateSegment()}
                disabled={evaluatingSegment || !selectedSegmentId}
                style={{
                  padding: '9px 14px',
                  background: '#334155',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {evaluatingSegment ? 'Evaluating...' : 'Evaluate'}
              </button>
            </div>

            {/* Live Evaluation Analysis Results */}
            {evaluationCounts && (
              <div
                data-testid="segment-evaluation-card"
                style={{
                  marginTop: 16,
                  padding: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Live Audience Projection</span>
                  <span
                    data-testid="count-eligible-consented"
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 700,
                      background: evaluationCounts.eligibleConsented > 0 ? '#dcfce7' : '#fee2e2',
                      color: evaluationCounts.eligibleConsented > 0 ? '#166534' : '#991b1b',
                    }}
                  >
                    {evaluationCounts.eligibleConsented} Consented Recipients
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 8,
                    textAlign: 'center',
                    fontSize: 12,
                  }}
                >
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Total</div>
                    <strong data-testid="count-total-matched" style={{ fontSize: 16, color: '#0f172a' }}>
                      {evaluationCounts.totalSubscribers}
                    </strong>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Matched</div>
                    <strong style={{ fontSize: 16, color: '#0f172a' }}>
                      {evaluationCounts.matchedSubscribers}
                    </strong>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Pending</div>
                    <strong data-testid="count-unconsented" style={{ fontSize: 16, color: '#d97706' }}>
                      {evaluationCounts.unconsentedOrPending}
                    </strong>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Suppressed</div>
                    <strong data-testid="count-suppressed" style={{ fontSize: 16, color: '#ef4444' }}>
                      {evaluationCounts.suppressed}
                    </strong>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b' }}>Deduplicated</div>
                    <strong data-testid="count-duplicates" style={{ fontSize: 16, color: '#2563eb' }}>
                      {evaluationCounts.duplicates}
                    </strong>
                  </div>
                </div>

                {evaluationCounts.isEmpty && (
                  <div
                    data-testid="empty-audience-warning"
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: 6,
                      fontSize: 13,
                      color: '#92400e',
                    }}
                  >
                    ⚠️ <strong>Empty audience:</strong> 0 eligible consented recipients found. Messages cannot be delivered to an empty audience.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 4: Schedule & Launch */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
              4. Review, Approval & Scheduling
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Scheduled Delivery Date & Time (UTC)
                </label>
                <input
                  type="datetime-local"
                  data-testid="schedule-time-input"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    width: '100%',
                    maxWidth: 320,
                  }}
                />
              </div>

              {snapshotHash && (
                <div
                  style={{
                    fontSize: 12,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: 10,
                  }}
                >
                  <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#334155' }}>
                    Immutable Recipient Snapshot:
                  </p>
                  <code data-testid="snapshot-hash" style={{ color: '#0369a1', wordBreak: 'break-all' }}>
                    {snapshotHash}
                  </code>
                  {frozenRecipients !== null && (
                    <p data-testid="frozen-recipients" style={{ margin: '4px 0 0', color: '#166534', fontWeight: 600 }}>
                      Frozen Recipients: {frozenRecipients}
                    </p>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <button
                  type="button"
                  data-testid="save-draft-btn"
                  onClick={() => handleSaveAndSchedule('draft')}
                  disabled={isPending}
                  style={{
                    padding: '10px 18px',
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Save Draft
                </button>

                <button
                  type="button"
                  data-testid="submit-review-btn"
                  onClick={() => handleSaveAndSchedule('review')}
                  disabled={isPending}
                  style={{
                    padding: '10px 18px',
                    background: '#fef3c7',
                    color: '#92400e',
                    border: '1px solid #fde68a',
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Submit for Review
                </button>

                <button
                  type="button"
                  data-testid="schedule-campaign-btn"
                  onClick={() => handleSaveAndSchedule('schedule')}
                  disabled={isPending || evaluationCounts?.isEmpty}
                  style={{
                    padding: '10px 22px',
                    background: evaluationCounts?.isEmpty ? '#94a3b8' : '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: evaluationCounts?.isEmpty ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}
                >
                  {isPending ? 'Scheduling...' : 'Schedule Campaign'}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Live Responsive Preview & Test Send */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Preview Controls Card */}
          <div
            data-testid="preview-pane"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  data-testid="preview-tab-html"
                  onClick={() => setPreviewTab('html')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1px solid #cbd5e1',
                    background: previewTab === 'html' ? '#0f172a' : '#f8fafc',
                    color: previewTab === 'html' ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  HTML View
                </button>
                <button
                  type="button"
                  data-testid="preview-tab-text"
                  onClick={() => setPreviewTab('text')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1px solid #cbd5e1',
                    background: previewTab === 'text' ? '#0f172a' : '#f8fafc',
                    color: previewTab === 'text' ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Plain Text Companion
                </button>
              </div>

              {previewTab === 'html' && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    data-testid="preview-toggle-desktop"
                    onClick={() => setViewport('desktop')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      border: '1px solid #cbd5e1',
                      background: viewport === 'desktop' ? '#e2e8f0' : '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    Desktop (600px)
                  </button>
                  <button
                    type="button"
                    data-testid="preview-toggle-mobile"
                    onClick={() => setViewport('mobile')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      border: '1px solid #cbd5e1',
                      background: viewport === 'mobile' ? '#e2e8f0' : '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    Mobile (360px)
                  </button>
                </div>
              )}
            </div>

            {/* Approximation Warning */}
            <div
              data-testid="preview-warning"
              style={{
                fontSize: 11,
                color: '#64748b',
                background: '#f8fafc',
                padding: '6px 10px',
                borderRadius: 4,
                marginBottom: 12,
              }}
            >
              ℹ️ Mailbox/device previews are approximations; provider rendering can differ.
            </div>

            {/* Preview Frame */}
            {previewTab === 'html' ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  background: '#f1f5f9',
                  padding: 16,
                  borderRadius: 8,
                  minHeight: 460,
                }}
              >
                <iframe
                  data-testid="preview-iframe"
                  title="Newsletter Live Preview"
                  srcDoc={previewHtml}
                  style={{
                    width: viewport === 'mobile' ? 360 : 600,
                    maxWidth: '100%',
                    height: 520,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  }}
                />
              </div>
            ) : (
              <pre
                data-testid="preview-text-view"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: 16,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  height: 520,
                  overflowY: 'auto',
                }}
              >
                {previewText || 'No plain text companion generated.'}
              </pre>
            )}

            {previewHash && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', wordBreak: 'break-all' }}>
                Render Hash: {previewHash}
              </div>
            )}
          </div>

          {/* Test Send Box */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Send Operator Test Email</h3>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>
              Sends a live test message through the configured local mail sink.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                data-testid="test-send-email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="operator@renegadeparty.org"
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                data-testid="test-send-btn"
                onClick={handleTestSend}
                disabled={isTestSending}
                style={{
                  padding: '7px 14px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {isTestSending ? 'Sending...' : 'Send Test'}
              </button>
            </div>
            {testSendStatus && (
              <p
                data-testid="test-send-status"
                style={{ margin: '8px 0 0', fontSize: 12, color: testSendStatus.includes('failed') ? '#dc2626' : '#16a34a' }}
              >
                {testSendStatus}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Campaigns & Legacy Retry */}
      <section
        style={{
          marginTop: 40,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
          Recent Campaigns & Deliveries
        </h2>
        {campaigns.length === 0 ? (
          <p style={{ fontSize: 14, color: '#64748b' }}>No campaigns found for this site yet.</p>
        ) : (
          <table
            data-testid="recent-campaigns-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                <th style={{ padding: '8px 10px' }}>Subject</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px' }}>Kind</th>
                <th style={{ padding: '8px 10px' }}>Scheduled For</th>
                <th style={{ padding: '8px 10px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 600, color: '#0f172a' }}>{c.subject}</td>
                  <td style={{ padding: '10px 10px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background:
                          c.status === 'scheduled'
                            ? '#dcfce7'
                            : c.status === 'review'
                              ? '#fef3c7'
                              : '#f1f5f9',
                        color:
                          c.status === 'scheduled'
                            ? '#166534'
                            : c.status === 'review'
                              ? '#92400e'
                              : '#475569',
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 10px', color: '#64748b' }}>{c.kind}</td>
                  <td style={{ padding: '10px 10px', color: '#64748b' }}>
                    {c.scheduledFor ? new Date(c.scheduledFor).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '10px 10px', color: '#94a3b8' }}>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Delivery Recovery / Retry</h3>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#64748b' }}>
            Inspect deliveries in{' '}
            <Link href="/admin/collections/email-deliveries" style={{ color: '#2563eb' }}>
              email-deliveries
            </Link>{' '}
            or retry a failed delivery ID directly:
          </p>
          <form onSubmit={handleRetryDelivery} style={{ display: 'flex', gap: 10, maxWidth: 500 }}>
            <input
              name="deliveryId"
              aria-label="Delivery ID to retry"
              placeholder="Delivery UUID..."
              value={retryDeliveryId}
              onChange={(e) => setRetryDeliveryId(e.target.value)}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <button
              type="submit"
              style={{
                padding: '7px 14px',
                background: '#475569',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Retry Delivery
            </button>
          </form>
          {retryStatus && <p role="status" style={{ margin: '8px 0 0', fontSize: 13, color: '#334155' }}>{retryStatus}</p>}
        </div>
      </section>
    </main>
  )
}
