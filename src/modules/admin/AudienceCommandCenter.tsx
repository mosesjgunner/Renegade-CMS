'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import EmailComposer from './EmailComposer'
import {
  AUDIENCE_METRIC_DICTIONARY,
  type AudienceCommandCenterHealth,
  type MetricDictionaryEntry,
  type UnifiedCampaignCalendarItem,
  PRIVACY_MASKED_VALUE,
} from '../audience/command-center-contracts'

type CommandCenterData = {
  siteId: string
  subscribers: number
  contacts: number
  suppressions: number
  deliverabilityHealth: AudienceCommandCenterHealth
  recentCampaigns: UnifiedCampaignCalendarItem[]
  metricsDictionary: MetricDictionaryEntry[]
  emailOutcomes: Array<{ status: string; count: number }>
  telecomOutcomes: Array<{ status: string; count: number }>
  messages: Array<{
    id: string
    subject: string
    status: string
    scheduledFor?: string
    recipientSnapshot?: any
    reviewedAt?: string
  }>
  telecomMessages: Array<{
    id: string
    title: string
    channel: string
    status: string
    scheduledFor?: string
  }>
  automations: Array<{ id: string; name: string; status: string; version: string }>
  experiments: Array<{ id: string; title: string; status: string }>
  suppressionLedger: Array<{
    id: string
    emailHash: string
    reason: string
    occurredAt: string
    source?: string
  }>
  recentConsentEvents: Array<{
    id: string
    event: string
    basis: string
    channel?: string
    purpose?: string
    occurredAt: string
    wording?: string
  }>
  notifications: {
    inApp: number
    activityRecords: number
    queuedExternal: number
    failedExternal: number
  } | null
  forms: { total: number; received: number; held: number; triaged: number }
  source: string
}

type ContactItem = {
  id: string
  displayName: string
  email?: string
  phoneE164?: string
  status: string
  createdAt: string
}

type ContactDetail = {
  contact: {
    id: string
    displayName: string
    email?: string
    emailHash?: string
    phoneE164?: string
    status: string
    profile?: any
    createdAt: string
    updatedAt: string
  }
  subscriber: {
    id: string
    status: string
    verifiedAt?: string
    globalUnsubscribedAt?: string
  } | null
  isSuppressed: boolean
  suppressionReason: string | null
  consentHistory: Array<{
    id: string
    event: string
    basis: string
    channel?: string
    purpose?: string
    wording?: string
    occurredAt: string
    proofReference?: string
    captureSource?: string
  }>
  metrics: {
    deliveriesAttempted: number
    deliveriesAccepted: number
    observedOpensConfirmed: number
    observedOpensProxyCached: number
    observedClicksHuman: number
    observedClicksBot: number
    uncertaintyNotice: string
  }
}

type TabKey =
  | 'contacts'
  | 'campaigns'
  | 'calendar'
  | 'deliverability'
  | 'suppression'
  | 'intake'
  | 'automations'
  | 'telecom'
  | 'experiments'
  | 'policies'
  | 'audit'
  | 'reports'
  | 'dictionary'

export default function AudienceCommandCenter() {
  const [activeTab, setActiveTab] = useState<TabKey>('contacts')
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // CRM Contacts State
  const [contacts, setContacts] = useState<ContactItem[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [selectedContact, setSelectedContact] = useState<ContactDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [crmSearch, setCrmSearch] = useState('')
  const [crmPage, setCrmPage] = useState(1)
  const [crmPages, setCrmPages] = useState(1)
  const [crmStatusFilter, setCrmStatusFilter] = useState('all')
  const [showCreateContact, setShowCreateContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactStatus, setNewContactStatus] = useState('lead')

  // Dictionary Search & Filter State
  const [dictionarySearch, setDictionarySearch] = useState('')
  const [dictionaryCategory, setDictionaryCategory] = useState('all')

  async function loadCommandCenter() {
    setError(null)
    try {
      const res = await fetch('/api/admin/audience/command-center')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}: Failed to load command center.`)
      }
      const body = await res.json()
      setData(body)
    } catch (err: any) {
      setError(err.message || 'Failed to connect to audience command center.')
    } finally {
      setLoading(false)
    }
  }

  const loadContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(crmPage) })
      if (crmSearch) params.set('query', crmSearch)
      if (crmStatusFilter && crmStatusFilter !== 'all') params.set('status', crmStatusFilter)
      const res = await fetch(`/api/admin/audience/crm?${params.toString()}`)
      if (!res.ok) throw new Error('CRM directory unavailable.')
      if (res.ok) {
        const body = await res.json()
        setContacts(body.contacts || [])
        setStatusCounts(body.statusCounts || {})
        setCrmPages(Math.max(1, body.totalPages || 1))
      }
    } catch {
      setError('CRM directory could not be loaded. Retry the request.')
    }
  }, [crmSearch, crmStatusFilter, crmPage])

  async function inspectContact(id: string) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/audience/crm?contactId=${id}`)
      if (res.ok) {
        const detail = await res.json()
        setSelectedContact(detail)
      } else {
        setStatusMessage('Contact detail could not be retrieved.')
      }
    } catch {
      setStatusMessage('Network error loading contact detail.')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault()
    if (!newContactName.trim()) {
      setStatusMessage('Contact display name is required.')
      return
    }
    try {
      const res = await fetch('/api/admin/audience/crm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create-contact',
          displayName: newContactName,
          email: newContactEmail || undefined,
          phoneE164: newContactPhone || undefined,
          status: newContactStatus,
        }),
      })
      const body = await res.json()
      if (res.ok) {
        setStatusMessage(`Contact "${body.displayName}" created successfully.`)
        setNewContactName('')
        setNewContactEmail('')
        setNewContactPhone('')
        setShowCreateContact(false)
        await loadContacts()
        await loadCommandCenter()
      } else {
        setStatusMessage(body.error || 'Failed to create contact.')
      }
    } catch {
      setStatusMessage('Network error creating contact.')
    }
  }

  async function handleEraseSubject(subscriberId: string) {
    if (
      !confirm(
        'Suppress and anonymize the subscriber address? CRM, delivery and consent history remain retained. This does not delete an account or all subject data.',
      )
    ) {
      return
    }
    try {
      const res = await fetch('/api/admin/audience/crm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'erase-subject', subscriberId }),
      })
      const body = await res.json()
      if (res.ok) {
        setStatusMessage('Audience subject erased and suppressed successfully.')
        if (selectedContact) {
          await inspectContact(selectedContact.contact.id)
        }
        await loadCommandCenter()
      } else {
        setStatusMessage(body.error || 'Erasure request failed.')
      }
    } catch {
      setStatusMessage('Network error submitting erasure.')
    }
  }

  async function handleDownloadCsv() {
    try {
      const res = await fetch('/api/admin/audience/crm?action=export&format=csv')
      if (!res.ok) throw new Error('Export generation failed.')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audience-operational-report-${data?.siteId || 'export'}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setStatusMessage('Operational summary CSV exported (k-anonymity N ≥ 5 enforced).')
    } catch {
      setStatusMessage('Failed to download operational CSV export.')
    }
  }

  async function handleRetryIntake(submissionId: string) {
    try {
      const res = await fetch('/api/admin/audience/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      })
      const body = await res.json()
      if (res.ok) {
        setStatusMessage(body.message || 'Intake actions retried.')
        await loadCommandCenter()
      } else {
        setStatusMessage(body.error || 'Intake retry failed.')
      }
    } catch {
      setStatusMessage('Network error retrying intake.')
    }
  }

  async function handleRetryEmail(deliveryId: string) {
    try {
      const res = await fetch('/api/admin/audience/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deliveryId }),
      })
      const body = await res.json()
      if (res.ok && body.queued) {
        setStatusMessage('Community email queued for recovery.')
        await loadCommandCenter()
      } else {
        setStatusMessage(body.error || 'This outcome cannot be safely retried.')
      }
    } catch {
      setStatusMessage('Network error requesting email recovery.')
    }
  }

  useEffect(() => {
    void loadCommandCenter()
  }, [])

  useEffect(() => {
    if (activeTab === 'contacts') {
      void loadContacts()
    }
  }, [activeTab, loadContacts])

  const filteredDictionary = useMemo(() => {
    const list = data?.metricsDictionary || AUDIENCE_METRIC_DICTIONARY
    return list.filter((entry) => {
      const matchesSearch =
        !dictionarySearch ||
        entry.label.toLowerCase().includes(dictionarySearch.toLowerCase()) ||
        entry.key.toLowerCase().includes(dictionarySearch.toLowerCase()) ||
        entry.definition.toLowerCase().includes(dictionarySearch.toLowerCase())
      const matchesCat = dictionaryCategory === 'all' || entry.category === dictionaryCategory
      return matchesSearch && matchesCat
    })
  }, [data?.metricsDictionary, dictionarySearch, dictionaryCategory])

  const siteId = data?.siteId || 'renegadeparty-site'

  return (
    <div
      style={{
        backgroundColor: '#090d16',
        color: '#f8fafc',
        minHeight: '100vh',
        padding: '24px 32px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* HEADER */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '20px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              Audience Command Center
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid #334155',
                letterSpacing: '0.05em',
              }}
            >
              Renegade CMoS AUD-07
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#1e293b',
                color: '#94a3b8',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid #334155',
              }}
            >
              Site: {siteId}
            </span>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Audience administration, verified consent provenance, bounded deliverability health, and
            CRM contacts directory.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              void loadCommandCenter()
              if (activeTab === 'contacts') void loadContacts()
            }}
            style={{
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
          <Link
            href="/admin/email-composer"
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Compose Email
          </Link>
        </div>
      </header>

      {/* STATUS / ALERTS */}
      {statusMessage && (
        <div
          role="status"
          style={{
            backgroundColor: '#1e293b',
            border: '1px solid #38bdf8',
            color: '#38bdf8',
            padding: '10px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#450a0a',
            border: '1px solid #dc2626',
            color: '#fca5a5',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* QUICK METRICS BAR */}
      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Subscriber Records
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
              {data.subscribers}
            </div>
            <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>
              Includes pending and suppressed
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              CRM Contacts
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
              {data.contacts}
            </div>
            <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
              Directory records
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Campaigns
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
              {data.messages.length}
            </div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
              {data.messages.filter((m) => m.status === 'scheduled').length} scheduled
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Suppressions
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
              {data.suppressions}
            </div>
            <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '2px' }}>
              Unsubscribes & bounces
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Deliverability Health
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981', marginTop: '6px' }}>
              {data.deliverabilityHealth?.providers.email.readiness === 'ready'
                ? 'Ready'
                : 'Monitored'}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Bounce: {data.deliverabilityHealth?.metrics.hardBounceRate.formattedValue || '0.00%'}
            </div>
          </div>
        </div>
      )}

      {/* NAVIGATION TABS */}
      <nav
        style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid #1e293b',
          marginBottom: '24px',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {[
          { key: 'contacts', label: 'Contacts' },
          { key: 'campaigns', label: 'Campaigns' },
          { key: 'calendar', label: 'Calendar' },
          { key: 'deliverability', label: 'Deliverability' },
          { key: 'suppression', label: 'Suppression' },
          { key: 'intake', label: 'Intake' },
          { key: 'automations', label: 'Automations' },
          { key: 'telecom', label: 'Telecom' },
          { key: 'experiments', label: 'Experiments' },
          { key: 'policies', label: 'Policies' },
          { key: 'audit', label: 'Audit' },
          { key: 'reports', label: 'Reports' },
          { key: 'dictionary', label: 'Dictionary' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key as TabKey)
              setSelectedContact(null)
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === tab.key ? '#1e293b' : 'transparent',
              color: activeTab === tab.key ? '#f8fafc' : '#94a3b8',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #38bdf8' : '2px solid transparent',
              fontWeight: activeTab === tab.key ? 600 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* TAB 1: CRM CONTACTS & DIRECTORY */}
      {activeTab === 'contacts' && (
        <section aria-label="CRM Contacts">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
                CRM Contacts & Directory
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Search, filter, inspect consent provenance, and administer contacts for {siteId}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateContact(!showCreateContact)}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {showCreateContact ? 'Cancel' : '+ New Contact'}
            </button>
          </div>

          {/* CREATE CONTACT FORM */}
          {showCreateContact && (
            <form
              onSubmit={handleCreateContact}
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px',
              }}
            >
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 14px 0',
                  color: '#f8fafc',
                }}
              >
                Add New CRM Contact
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  marginBottom: '14px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginBottom: '4px',
                    }}
                  >
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginBottom: '4px',
                    }}
                  >
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    placeholder="e.g. jane@example.com"
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginBottom: '4px',
                    }}
                  >
                    Phone (E.164)
                  </label>
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="e.g. +15555550199"
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginBottom: '4px',
                    }}
                  >
                    Status
                  </label>
                  <select
                    value={newContactStatus}
                    onChange={(e) => setNewContactStatus(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  >
                    <option value="lead">Lead</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="blocked">Blocked</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                style={{
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Save Contact
              </button>
            </form>
          )}

          {/* SEARCH & STATUS FILTER */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}
          >
            <input
              type="text"
              value={crmSearch}
              onChange={(e) => {
                setCrmPage(1)
                setCrmSearch(e.target.value)
              }}
              placeholder="Search contacts by name, email, or phone..."
              style={{
                flex: 1,
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              {['all', 'lead', 'active', 'inactive', 'blocked', 'archived'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setCrmPage(1)
                    setCrmStatusFilter(status)
                  }}
                  style={{
                    backgroundColor: crmStatusFilter === status ? '#38bdf8' : '#1e293b',
                    color: crmStatusFilter === status ? '#0f172a' : '#cbd5e1',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                  }}
                >
                  {status} {statusCounts[status] !== undefined ? `(${statusCounts[status]})` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* CONTACT DETAIL DRAWER */}
          {selectedContact && (
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #38bdf8',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                    {selectedContact.contact.displayName}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        backgroundColor: '#1e293b',
                        color: '#38bdf8',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      Status: {selectedContact.contact.status}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        backgroundColor: selectedContact.isSuppressed ? '#450a0a' : '#064e3b',
                        color: selectedContact.isSuppressed ? '#fca5a5' : '#6ee7b7',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      {selectedContact.isSuppressed
                        ? `Suppressed: ${selectedContact.suppressionReason || 'active'}`
                        : 'Deliverable'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {selectedContact.subscriber && (
                    <button
                      type="button"
                      onClick={() => void handleEraseSubject(selectedContact.subscriber!.id)}
                      style={{
                        backgroundColor: '#450a0a',
                        color: '#fca5a5',
                        border: '1px solid #dc2626',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Anonymize Subscriber Address
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedContact(null)}
                    style={{
                      backgroundColor: '#1e293b',
                      color: '#94a3b8',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* IDENTITY & OBSERVED METRICS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  marginTop: '16px',
                  backgroundColor: '#131d31',
                  padding: '14px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Email Address</div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#f8fafc',
                      marginTop: '2px',
                    }}
                  >
                    {selectedContact.contact.email || 'None'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Phone (E.164)</div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#f8fafc',
                      marginTop: '2px',
                    }}
                  >
                    {selectedContact.contact.phoneE164 || 'None'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Dispatches Accepted</div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#10b981',
                      marginTop: '2px',
                    }}
                  >
                    {selectedContact.metrics.deliveriesAccepted} /{' '}
                    {selectedContact.metrics.deliveriesAttempted}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Observed Human Clicks</div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#38bdf8',
                      marginTop: '2px',
                    }}
                  >
                    {selectedContact.metrics.observedClicksHuman}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  marginTop: '6px',
                  fontStyle: 'italic',
                }}
              >
                {selectedContact.metrics.uncertaintyNotice}
              </div>

              {/* CONSENT TIMELINE */}
              <div style={{ marginTop: '20px' }}>
                <h4
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    margin: '0 0 10px 0',
                    color: '#f8fafc',
                  }}
                >
                  Source & Consent History ({selectedContact.consentHistory.length})
                </h4>
                {selectedContact.consentHistory.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedContact.consentHistory.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '10px 14px',
                          fontSize: '12px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: '#38bdf8' }}>{c.event}</span>
                          <span style={{ color: '#94a3b8' }}>
                            {new Date(c.occurredAt).toLocaleString()}{' '}
                            {'captureSource' in c && c.captureSource
                              ? `Source: ${c.captureSource}`
                              : ''}
                          </span>
                        </div>
                        <div style={{ color: '#cbd5e1', marginTop: '4px' }}>
                          Basis: <strong>{c.basis}</strong> | Channel: {c.channel || 'all'} |
                          Purpose: {c.purpose || 'marketing'}
                        </div>
                        {c.wording && (
                          <div style={{ color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>
                            &ldquo;{c.wording}&rdquo;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                    No recorded consent events for this contact.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* CONTACTS LIST TABLE */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {contacts.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8' }}>
                <p style={{ margin: 0, fontSize: '14px' }}>
                  No contacts found matching the selected criteria.
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Click &ldquo;+ New Contact&rdquo; to add your first directory entry.
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #334155',
                      color: '#94a3b8',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '8px 12px' }}>Name</th>
                    <th style={{ padding: '8px 12px' }}>Email</th>
                    <th style={{ padding: '8px 12px' }}>Phone</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Created</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        backgroundColor:
                          selectedContact?.contact.id === c.id ? '#1e293b' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f8fafc' }}>
                        {c.displayName}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{c.email || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                        {c.phoneE164 || '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor:
                              c.status === 'active'
                                ? '#064e3b'
                                : c.status === 'lead'
                                  ? '#1e293b'
                                  : '#334155',
                            color:
                              c.status === 'active'
                                ? '#6ee7b7'
                                : c.status === 'lead'
                                  ? '#38bdf8'
                                  : '#94a3b8',
                          }}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => void inspectContact(c.id)}
                          style={{
                            backgroundColor: '#1e293b',
                            color: '#38bdf8',
                            border: '1px solid #334155',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <nav aria-label="Contact pages" style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button type="button" disabled={crmPage <= 1} onClick={() => setCrmPage(crmPage - 1)}>
              Previous contacts
            </button>
            <span>
              Page {crmPage} of {crmPages}
            </span>
            <button
              type="button"
              disabled={crmPage >= crmPages}
              onClick={() => setCrmPage(crmPage + 1)}
            >
              Next contacts
            </button>
          </nav>
        </section>
      )}

      {/* TAB 2: CAMPAIGNS */}
      {activeTab === 'campaigns' && (
        <section aria-label="Campaigns">
          <EmailComposer />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
                Campaign Dispatch & Lifecycle
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Draft, review, scheduled, and completed message dispatches.
              </p>
            </div>
            <Link
              href="/admin/email-composer"
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Compose New Campaign
            </Link>
          </div>

          {/* EMAIL OUTCOMES GRID */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <h4
              style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: '#f8fafc' }}
            >
              Email Outbox Status Summary
            </h4>
            {data?.emailOutcomes && data.emailOutcomes.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                {data.emailOutcomes.map((o) => (
                  <div
                    key={o.status}
                    style={{
                      backgroundColor: '#1e293b',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        color: '#94a3b8',
                        fontWeight: 600,
                      }}
                    >
                      {o.status}
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#f8fafc',
                        marginTop: '4px',
                      }}
                    >
                      {o.count}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                No recorded email delivery outcomes for this site.
              </p>
            )}
            <p style={{ fontSize: '11px', color: '#64748b', marginTop: '10px', marginBottom: 0 }}>
              Provider configuration does not prove connection health, domain authentication,
              delivery, opens or conversions.
            </p>
          </div>

          {/* SAVED CAMPAIGNS TABLE */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <h4
              style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: '#f8fafc' }}
            >
              Saved Email Campaigns ({data?.messages.length || 0})
            </h4>
            {data?.messages && data.messages.length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #334155',
                      color: '#94a3b8',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '8px 12px' }}>Subject</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Scheduled For</th>
                    <th style={{ padding: '8px 12px' }}>Recipient Snapshot</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.messages.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f8fafc' }}>
                        {m.subject}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor:
                              m.status === 'scheduled' || m.status === 'sent'
                                ? '#064e3b'
                                : m.status === 'review'
                                  ? '#78350f'
                                  : '#1e293b',
                            color:
                              m.status === 'scheduled' || m.status === 'sent'
                                ? '#6ee7b7'
                                : m.status === 'review'
                                  ? '#fcd34d'
                                  : '#94a3b8',
                          }}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                        {m.scheduledFor ? new Date(m.scheduledFor).toLocaleString() : '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          color: '#38bdf8',
                        }}
                      >
                        {m.recipientSnapshot ? 'SHA-256 Pinned' : 'None'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <Link
                          href={`/admin/collections/email-messages/${m.id}`}
                          style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>No saved campaigns.</p>
            )}
          </div>
        </section>
      )}

      {/* TAB 3: CALENDAR */}
      {activeTab === 'calendar' && (
        <section aria-label="Calendar">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Multi-Channel Dispatch Schedule
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Unified schedule across Email, SMS, and RCS with frequency conflict and TCPA quiet
              hours detection.
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {data?.recentCampaigns && data.recentCampaigns.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {data.recentCampaigns.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      backgroundColor: '#1e293b',
                      border: item.warnings.length ? '1px solid #f59e0b' : '1px solid #334155',
                      borderRadius: '6px',
                      padding: '14px 18px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            backgroundColor: '#0f172a',
                            color: '#38bdf8',
                            padding: '2px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          {item.channel}
                        </span>
                        <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '14px' }}>
                          {item.title}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: item.status === 'scheduled' ? '#6ee7b7' : '#94a3b8',
                        }}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '16px',
                        fontSize: '12px',
                        color: '#cbd5e1',
                        marginTop: '8px',
                      }}
                    >
                      <div>
                        Scheduled:{' '}
                        {item.scheduledFor
                          ? new Date(item.scheduledFor).toLocaleString()
                          : 'Unscheduled'}
                      </div>
                      <div>Target: {item.targetAudienceLabel}</div>
                      <div>Est. Recipients: {item.estimatedRecipients}</div>
                    </div>

                    {item.warnings.map((warn, wIdx) => (
                      <div
                        key={wIdx}
                        style={{
                          marginTop: '8px',
                          fontSize: '12px',
                          color: '#f59e0b',
                          backgroundColor: '#451a03',
                          padding: '4px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        ⚠️ {warn}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                No scheduled dispatches on the calendar.
              </p>
            )}
          </div>
        </section>
      )}

      {/* TAB 4: DELIVERABILITY */}
      {activeTab === 'deliverability' && (
        <section aria-label="Deliverability">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Email & Telecom Delivery Infrastructure
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Lifetime delivery status counts and configuration checks. Domain authentication and
              live provider health require separate observations.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            {/* Email Provider Card */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <h4
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  margin: '0 0 10px 0',
                  color: '#f8fafc',
                }}
              >
                Email Delivery Provider
              </h4>
              <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                Provider: <strong>{data?.deliverabilityHealth?.providers.email.provider}</strong>
                <p>
                  Configuration only; DNS/TLS checks, queue age, webhook lag and validation health
                  are unmeasured.
                </p>
              </div>
              <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '4px' }}>
                Status: <strong>{data?.deliverabilityHealth?.providers.email.status}</strong>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    color: data?.deliverabilityHealth?.providers.email.spfVerified
                      ? '#10b981'
                      : '#f59e0b',
                  }}
                >
                  SPF:{' '}
                  {data?.deliverabilityHealth?.providers.email.spfVerified
                    ? '✓ Verified'
                    : '— Unchecked'}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: data?.deliverabilityHealth?.providers.email.dkimVerified
                      ? '#10b981'
                      : '#f59e0b',
                  }}
                >
                  DKIM:{' '}
                  {data?.deliverabilityHealth?.providers.email.dkimVerified
                    ? '✓ Verified'
                    : '— Unchecked'}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: data?.deliverabilityHealth?.providers.email.dmarcVerified
                      ? '#10b981'
                      : '#f59e0b',
                  }}
                >
                  DMARC:{' '}
                  {data?.deliverabilityHealth?.providers.email.dmarcVerified
                    ? '✓ Verified'
                    : '— Unchecked'}
                </span>
              </div>
            </div>

            {/* Telecom Provider Card */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <h4
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  margin: '0 0 10px 0',
                  color: '#f8fafc',
                }}
              >
                Telecom Gateway Provider
              </h4>
              <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                Provider: <strong>{data?.deliverabilityHealth?.providers.telecom.provider}</strong>
              </div>
              <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '4px' }}>
                Outbound Status:{' '}
                <strong>
                  {data?.deliverabilityHealth?.providers.telecom.outboundAllowed
                    ? 'Enabled'
                    : 'Disabled (Emulator Safe)'}
                </strong>
              </div>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '10px', margin: 0 }}>
                SMS and RCS gateway acceptance does not establish end-user handset delivery without
                verified carrier DLR.
              </p>
            </div>
          </div>

          {/* Remediations List */}
          {data?.deliverabilityHealth?.remediationsAvailable &&
            data.deliverabilityHealth.remediationsAvailable.length > 0 && (
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '16px',
                }}
              >
                <h4
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    margin: '0 0 12px 0',
                    color: '#f59e0b',
                  }}
                >
                  Active Hygiene & Reputation Remediations
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.deliverabilityHealth.remediationsAvailable.map((rem) => (
                    <div
                      key={rem.id}
                      style={{
                        backgroundColor: '#1e293b',
                        padding: '10px 14px',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>
                        {rem.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        {rem.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </section>
      )}

      {/* TAB 5: SUPPRESSION */}
      {activeTab === 'suppression' && (
        <section aria-label="Suppression">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Global & Channel Suppression Ledger
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Permanent suppression list to prevent dispatches to unsubscribed, bounced, or
              complaining addresses.
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {data?.suppressionLedger && data.suppressionLedger.length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #334155',
                      color: '#94a3b8',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '8px 12px' }}>Email Hash</th>
                    <th style={{ padding: '8px 12px' }}>Reason</th>
                    <th style={{ padding: '8px 12px' }}>Occurred At</th>
                    <th style={{ padding: '8px 12px' }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suppressionLedger.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td
                        style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#38bdf8' }}
                      >
                        {s.emailHash.slice(0, 16)}...
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#450a0a',
                            color: '#fca5a5',
                          }}
                        >
                          {s.reason}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                        {new Date(s.occurredAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                        {s.source || 'system'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                No active suppressions recorded on this site.
              </p>
            )}
          </div>
        </section>
      )}

      {/* TAB 6: INTAKE & FORMS */}
      {activeTab === 'intake' && (
        <section aria-label="Intake">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Audience Intake & Form Submissions
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Saved form submissions and bounded create-contact/create-task execution.
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Total Submissions
                </div>
                <div
                  style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}
                >
                  {data?.forms.total || 0}
                </div>
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Received
                </div>
                <div
                  style={{ fontSize: '20px', fontWeight: 700, color: '#10b981', marginTop: '4px' }}
                >
                  {data?.forms.received || 0}
                </div>
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Held
                </div>
                <div
                  style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}
                >
                  {data?.forms.held || 0}
                </div>
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Triaged
                </div>
                <div
                  style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}
                >
                  {data?.forms.triaged || 0}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 7: AUTOMATIONS */}
      {activeTab === 'automations' && (
        <section aria-label="Automations">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Automations & Notifications
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Saved automation definitions are review records; general event-driven automation
              execution is unavailable. Supported form actions create contacts and tasks. Community
              notifications use their own delivery pipeline.
            </p>
          </div>

          <p>
            Canonical site notification records:{' '}
            {data?.notifications
              ? `${data.notifications.inApp} inbox; ${data.notifications.activityRecords} activity notifications; ${data.notifications.queuedExternal} external queued; ${data.notifications.failedExternal} external failed or uncertain.`
              : 'Notifications module unavailable.'}{' '}
            Counts describe saved records, not observed recipient reads.
          </p>
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {data?.automations && data.automations.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.automations.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      backgroundColor: '#1e293b',
                      padding: '12px 16px',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: '#f8fafc' }}>{a.name}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>
                        v{a.version}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        color: a.status === 'active' ? '#6ee7b7' : '#94a3b8',
                      }}
                    >
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                No saved automation definitions for this site.
              </p>
            )}
          </div>
        </section>
      )}

      {/* TAB 8: TELECOM */}
      {activeTab === 'telecom' && (
        <section aria-label="Telecom">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Telecom Dispatches & Gateways
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              SMS and RCS dispatch ledger. Local emulation and configured quiet-hour guards do not
              establish carrier delivery or legal compliance.
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#131d31',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '14px' }}>
              {data?.deliverabilityHealth?.providers.telecom.provider}
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              SMS and RCS gateway acceptance does not establish end-user handset delivery without
              verified carrier DLR.
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {data?.telecomMessages && data.telecomMessages.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.telecomMessages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      backgroundColor: '#1e293b',
                      padding: '12px 16px',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          backgroundColor: '#0f172a',
                          color: '#38bdf8',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          marginRight: '8px',
                        }}
                      >
                        {m.channel}
                      </span>
                      <span style={{ fontWeight: 600, color: '#f8fafc' }}>{m.title}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#cbd5e1' }}>{m.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                No telecom messages dispatched on this site.
              </p>
            )}
          </div>
        </section>
      )}

      {/* TAB 9: EXPERIMENTS */}
      {activeTab === 'experiments' && (
        <section aria-label="Experiments">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Deterministic A/B & Multivariate Experiments
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Cryptographic recipient allocation (SHA-256) with automated bounce guardrails and
              manual winner decisions.
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {data?.experiments && data.experiments.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.experiments.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      backgroundColor: '#1e293b',
                      padding: '12px 16px',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#f8fafc' }}>{e.title}</span>
                    <span style={{ fontSize: '11px', color: '#cbd5e1' }}>{e.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                No active experiments defined. Experiments require explicit operator hypothesis and
                variant allocation.
              </p>
            )}
            <p style={{ fontSize: '11px', color: '#64748b', marginTop: '12px', margin: 0 }}>
              Saved status does not establish allocation, statistical significance or a deployed
              winner.
            </p>
          </div>
        </section>
      )}

      {/* TAB 10: POLICIES */}
      {activeTab === 'policies' && (
        <section aria-label="Policies">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              TCPA Quiet Hours & Email Frequency Controls
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Fatigue prevention rules and statutory compliance windows.
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
            }}
          >
            <h4
              style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0', color: '#f8fafc' }}
            >
              TCPA Telephone Consumer Protection Act Rules
            </h4>
            <p
              style={{
                fontSize: '13px',
                color: '#cbd5e1',
                margin: '0 0 16px 0',
                maxWidth: '680px',
              }}
            >
              Telecom marketing dispatches are strictly restricted between{' '}
              <strong>8:00 AM and 9:00 PM</strong> in the recipient&apos;s local timezone. Any send
              scheduled outside this window raises an immediate warning in the Unified Calendar.
            </p>

            <h4
              style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0', color: '#f8fafc' }}
            >
              Subscriber Fatigue Limits
            </h4>
            <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, maxWidth: '680px' }}>
              Standard frequency cap limits marketing dispatches to a maximum of 4 dispatches per
              168-hour window (7 days) per subscriber address.
            </p>
          </div>
        </section>
      )}

      {/* TAB 11: AUDIT */}
      {activeTab === 'audit' && (
        <section aria-label="Audit">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Immutable Consent & Delivery Provenance
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Cryptographic audit trail of all opt-in requests, confirmations, preference updates,
              and erasures.
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {data?.recentConsentEvents && data.recentConsentEvents.length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #334155',
                      color: '#94a3b8',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '8px 12px' }}>Event</th>
                    <th style={{ padding: '8px 12px' }}>Basis</th>
                    <th style={{ padding: '8px 12px' }}>Channel</th>
                    <th style={{ padding: '8px 12px' }}>Purpose</th>
                    <th style={{ padding: '8px 12px' }}>Occurred At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentConsentEvents.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#38bdf8' }}>
                        {c.event}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#f8fafc' }}>{c.basis}</td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                        {c.channel || 'all'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                        {c.purpose || 'marketing'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                        {new Date(c.occurredAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                No recent consent events recorded on this site.
              </p>
            )}
          </div>
        </section>
      )}

      {/* TAB 12: REPORTS & PRIVACY EXPORTS */}
      {activeTab === 'reports' && (
        <section aria-label="Reports">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Privacy-Safe CSV & Operational Reports
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Export operational summaries with enforced k-anonymity (N ≥ 5).
            </p>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '24px',
            }}
          >
            <h3
              style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 10px 0', color: '#f8fafc' }}
            >
              K-Anonymity Privacy Guarantee
            </h3>
            <p
              style={{
                fontSize: '13px',
                color: '#94a3b8',
                margin: '0 0 18px 0',
                maxWidth: '720px',
              }}
            >
              Renegade CMS enforces strict privacy thresholds. Any group or cohort with fewer than 5
              subjects is strictly masked as &ldquo;{PRIVACY_MASKED_VALUE}&rdquo;. Individual
              subscriber contact records, email addresses, and phone numbers are excluded from
              aggregate export files.
            </p>

            <div
              style={{
                backgroundColor: '#131d31',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '14px 18px',
                marginBottom: '20px',
                display: 'flex',
                gap: '24px',
                fontSize: '13px',
              }}
            >
              <div>
                Site: <strong style={{ color: '#38bdf8' }}>{siteId}</strong>
              </div>
              <div>
                Privacy Floor: <strong style={{ color: '#f59e0b' }}>≥ 5 subjects</strong>
              </div>
              <div>
                Individual PII: <strong style={{ color: '#ef4444' }}>Excluded</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadCsv}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Download Operational Summary (CSV)
            </button>
          </div>
        </section>
      )}

      {/* TAB 13: DICTIONARY */}
      {activeTab === 'dictionary' && (
        <section aria-label="Dictionary">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
              Audience Metric Dictionary
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Formal source-labeled formulas, denominators, uncertainty boundaries, and operational
              caveats.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}
          >
            <input
              type="text"
              value={dictionarySearch}
              onChange={(e) => setDictionarySearch(e.target.value)}
              placeholder="Search metrics, definitions, or formulas..."
              style={{
                flex: 1,
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
            <select
              value={dictionaryCategory}
              onChange={(e) => setDictionaryCategory(e.target.value)}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <option value="all">All Categories</option>
              <option value="acquisition">Acquisition</option>
              <option value="deliverability">Deliverability</option>
              <option value="engagement">Engagement</option>
              <option value="retention">Retention</option>
              <option value="conversion">Conversion</option>
            </select>
          </div>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr
                  style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}
                >
                  <th style={{ padding: '8px 12px', width: '220px' }}>Metric Key & Label</th>
                  <th style={{ padding: '8px 12px', width: '120px' }}>Category</th>
                  <th style={{ padding: '8px 12px', width: '220px' }}>Formula</th>
                  <th style={{ padding: '8px 12px' }}>Operational Definition & Caveats</th>
                </tr>
              </thead>
              <tbody>
                {filteredDictionary.map((entry) => (
                  <tr key={entry.key} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{entry.label}</div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          color: '#38bdf8',
                          marginTop: '2px',
                        }}
                      >
                        {entry.key}
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          backgroundColor: '#1e293b',
                          color: '#94a3b8',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          display: 'inline-block',
                          marginTop: '4px',
                        }}
                      >
                        {entry.channel}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '12px',
                        verticalAlign: 'top',
                        textTransform: 'capitalize',
                        color: '#cbd5e1',
                      }}
                    >
                      {entry.category}
                    </td>
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#f1f5f9' }}>
                        {entry.formula}
                      </div>
                      {entry.uncertaintyLabel && (
                        <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>
                          ⚠️ {entry.uncertaintyLabel}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      <div style={{ color: '#e2e8f0', marginBottom: '6px' }}>
                        {entry.definition}
                      </div>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: '16px',
                          fontSize: '11px',
                          color: '#94a3b8',
                        }}
                      >
                        {entry.caveats.map((c, cIdx) => (
                          <li key={cIdx}>{c}</li>
                        ))}
                      </ul>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                        Source: {entry.source}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
