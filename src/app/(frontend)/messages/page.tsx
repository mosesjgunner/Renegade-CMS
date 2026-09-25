'use client'

import { useCallback, useEffect, useState, Suspense, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'

type Conversation = {
  id: string
  kind: string
  title: string | null
  request_state?: string
  request_recipient_member_id?: string
  request_sender_member_id?: string
}

type Message = {
  id: string
  sender_id: string | null
  body_html: string
  created_at: string
}

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

function MessagesContent() {
  const searchParams = useSearchParams()
  const initialRecipient = searchParams.get('targetMemberId') ?? ''

  const [siteId, setSiteId] = useState('')
  const [currentMemberId, setCurrentMemberId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [recipients, setRecipients] = useState(initialRecipient)
  const [groupTitle, setGroupTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('')

  const refresh = useCallback(async (site: string) => {
    const response = await fetch(
      `/api/community/conversations?siteId=${encodeURIComponent(site)}`,
      { cache: 'no-store' },
    )
    if (!response.ok) return setStatus('Could not load conversations.')
    const data = await response.json()
    setConversations(data.conversations ?? [])
  }, [])

  const loadMessages = useCallback(async (site: string, conversationId: string) => {
    const query = new URLSearchParams({ siteId: site, conversationId })
    const response = await fetch(`/api/community/messages?${query}`, { cache: 'no-store' })
    if (!response.ok) return setStatus((await response.json()).error ?? 'Could not load messages.')
    setMessages((await response.json()).messages ?? [])
  }, [])

  useEffect(() => {
    void fetch('/api/member-auth/me').then(async (response) => {
      if (!response.ok) return setStatus('Sign in to use messages.')
      const data = await response.json()
      const site = String(data.siteId ?? '')
      if (!site) return setStatus('Choose an active site to use messages.')
      setSiteId(site)
      setCurrentMemberId(String(data.memberId ?? data.id ?? ''))
      void refresh(site)
    })
  }, [refresh])

  useEffect(() => {
    if (siteId && selected) void loadMessages(siteId, selected)
  }, [siteId, selected, loadMessages])

  async function resolveRecipient(input: string, currentSiteId: string): Promise<string> {
    const trimmed = input.trim()
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(trimmed)) return trimmed

    const cleanHandle = trimmed.replace(/^@/, '')
    const res = await fetch(
      `/api/community/directory?siteId=${encodeURIComponent(currentSiteId)}&q=${encodeURIComponent(cleanHandle)}`,
    )
    if (res.ok) {
      const data = await res.json()
      const found = (data.profiles ?? []).find(
        (p: { handle?: string; memberId?: string }) =>
          p.handle?.toLowerCase() === cleanHandle.toLowerCase(),
      )
      if (found?.memberId) return found.memberId
    }
    return trimmed
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const rawIds = recipients
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (!rawIds.length) return setStatus('Please provide at least one recipient.')

    const resolvedIds = await Promise.all(rawIds.map((id) => resolveRecipient(id, siteId)))
    const group = resolvedIds.length > 1
    const response = await fetch('/api/community/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({
        siteId,
        kind: group ? 'group' : 'direct',
        targetMemberId: resolvedIds[0],
        memberIds: resolvedIds,
        title: groupTitle,
      }),
    })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error ?? 'Could not start conversation.')
    setRecipients('')
    setGroupTitle('')
    setSelected(String(result.conversation.id))
    setStatus('Conversation ready.')
    void refresh(siteId)
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const response = await fetch('/api/community/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({
        siteId,
        conversationId: selected,
        body,
        idempotencyKey: crypto.randomUUID(),
      }),
    })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error ?? 'Could not send message.')
    setBody('')
    setStatus('Message sent.')
    void loadMessages(siteId, selected)
    void refresh(siteId)
  }

  async function decideRequest(action: 'accept' | 'decline' | 'block_and_report') {
    const res = await fetch('/api/community/message-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({
        siteId,
        conversationId: selected,
        action,
        reason: action === 'block_and_report' ? 'Unsolicited messages or spam' : undefined,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setStatus(body.error ?? 'Could not process message request decision.')
    } else {
      setStatus(`Message request ${action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'blocked'}.`)
      void refresh(siteId)
      void loadMessages(siteId, selected)
    }
  }

  const activeConv = conversations.find((c) => c.id === selected)
  const isPendingRequest = activeConv?.request_state === 'pending_request'
  const isRecipient = currentMemberId && activeConv?.request_recipient_member_id === currentMemberId
  const isSender = currentMemberId && activeConv?.request_sender_member_id === currentMemberId

  return (
    <main className="container mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Messages</h1>
      {status ? (
        <p role="status" className="mt-2 text-sm font-medium text-stone-600 dark:text-stone-300">
          {status}
        </p>
      ) : null}
      {siteId && (
        <>
          <form onSubmit={start} className="mt-6 space-y-3 p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900">
            <h2 className="text-lg font-semibold">Start a conversation</h2>
            <label className="block text-sm">
              Recipients (member IDs or handles, comma-separated)
              <input
                className="form-input block w-full mt-1"
                placeholder="e.g. member-uuid-here or @alice"
                required
                value={recipients}
                onChange={(event) => setRecipients(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Group name (optional for group conversations)
              <input
                className="form-input block w-full mt-1"
                placeholder="Group title"
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Start conversation
            </button>
          </form>

          <section className="mt-8" aria-label="Conversations">
            <h2 className="text-xl font-semibold">Conversations</h2>
            {conversations.length === 0 && (
              <p className="mt-2 text-sm text-stone-500">No conversations yet.</p>
            )}
            <ul className="mt-3 space-y-2">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={`btn text-left w-full flex items-center justify-between ${
                      selected === conversation.id ? 'border-primary ring-1 ring-primary font-semibold' : ''
                    }`}
                    aria-pressed={selected === conversation.id}
                    onClick={() => setSelected(conversation.id)}
                  >
                    <span>
                      {conversation.title ||
                        `${conversation.kind === 'group' ? 'Group' : 'Direct'} conversation (${conversation.id.slice(0, 8)})`}
                    </span>
                    {conversation.request_state === 'pending_request' ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        Request
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selected && (
            <section className="mt-8 border-t pt-6" aria-label="Messages">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {activeConv?.title || `${activeConv?.kind === 'group' ? 'Group' : 'Direct'} Conversation`}
                </h2>
                <button
                  type="button"
                  className="btn text-sm"
                  onClick={() => void loadMessages(siteId, selected)}
                >
                  Refresh
                </button>
              </div>

              {isPendingRequest && isRecipient ? (
                <div className="mt-4 p-4 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40">
                  <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    Message Request
                  </h3>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                    This member sent you a message request. Choose an action before replying:
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary text-xs"
                      onClick={() => void decideRequest('accept')}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={() => void decideRequest('decline')}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger text-xs"
                      onClick={() => void decideRequest('block_and_report')}
                    >
                      Block & Report
                    </button>
                  </div>
                </div>
              ) : null}

              {isPendingRequest && isSender ? (
                <div className="mt-4 p-3 rounded-lg border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900 text-xs text-stone-600 dark:text-stone-300">
                  Your message request is waiting for the recipient to accept.
                </div>
              ) : null}

              <ol className="mt-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-stone-500">No messages in this conversation yet.</p>
                ) : (
                  messages.map((message) => (
                    <li key={message.id} className="rounded-xl border p-4 bg-white dark:bg-stone-900 shadow-sm">
                      <div className="flex items-center justify-between text-xs text-stone-500">
                        <span>{message.sender_id ? `Member ${message.sender_id.slice(0, 8)}` : 'System'}</span>
                        <time dateTime={message.created_at}>
                          {new Date(message.created_at).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap text-stone-800 dark:text-stone-100">
                        {message.body_html.replace(/<[^>]*>/g, '')}
                      </p>
                    </li>
                  ))
                )}
              </ol>

              {(!isPendingRequest || isRecipient) && (
                <form onSubmit={send} className="mt-6">
                  <label className="block text-sm font-medium">
                    New message
                    <textarea
                      className="form-input block w-full mt-1"
                      rows={3}
                      placeholder="Write your message…"
                      required
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                    />
                  </label>
                  <button className="btn btn-primary mt-3" type="submit">
                    Send message
                  </button>
                </form>
              )}
            </section>
          )}
        </>
      )}
      <section className="mt-12 pt-6 border-t text-xs text-stone-500" aria-label="Conversation security">
        <h2>Conversation security</h2>
        <p className="mt-1">
          Messages use TLS in transit and server storage protection at rest. They are not end-to-end encrypted.
        </p>
      </section>
    </main>
  )
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="container mx-auto max-w-3xl px-6 py-12">Loading messages…</div>}>
      <MessagesContent />
    </Suspense>
  )
}
