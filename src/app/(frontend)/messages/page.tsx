'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'

type Conversation = { id: string; kind: string; title: string | null }
type Message = { id: string; sender_id: string | null; body_html: string; created_at: string }

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

export default function MessagesPage() {
  const [siteId, setSiteId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [recipients, setRecipients] = useState('')
  const [groupTitle, setGroupTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('')

  const refresh = useCallback(async (site: string) => {
    const response = await fetch(
      `/api/community/conversations?siteId=${encodeURIComponent(site)}`,
      { cache: 'no-store' },
    )
    if (!response.ok) return setStatus('Could not load conversations.')
    setConversations((await response.json()).conversations ?? [])
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
      const site = String((await response.json()).siteId ?? '')
      if (!site) return setStatus('Choose an active site to use messages.')
      setSiteId(site)
      void refresh(site)
    })
  }, [refresh])
  useEffect(() => {
    if (siteId && selected) void loadMessages(siteId, selected)
  }, [siteId, selected, loadMessages])

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const memberIds = recipients
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    const group = memberIds.length > 1
    const response = await fetch('/api/community/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({
        siteId,
        kind: group ? 'group' : 'direct',
        targetMemberId: memberIds[0],
        memberIds,
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

  return (
    <main className="container mx-auto max-w-3xl px-6 py-12">
      <h1>Messages</h1>
      <p role="status">{status}</p>
      {siteId && (
        <>
          <form onSubmit={start} className="mt-6 space-y-3">
            <h2>Start a conversation</h2>
            <label className="block">
              Member IDs, separated by commas
              <input
                className="form-input block w-full"
                required
                value={recipients}
                onChange={(event) => setRecipients(event.target.value)}
              />
            </label>
            <label className="block">
              Group name (for two or more recipients)
              <input
                className="form-input block w-full"
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
              />
            </label>
            <button className="btn" type="submit">
              Start conversation
            </button>
          </form>
          <section className="mt-8" aria-label="Conversations">
            <h2>Conversations</h2>
            {conversations.length === 0 && <p>No conversations yet.</p>}
            <ul>
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={selected === conversation.id}
                    onClick={() => setSelected(conversation.id)}
                  >
                    {conversation.title ||
                      `${conversation.kind} conversation ${conversation.id.slice(0, 8)}`}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selected && (
            <section className="mt-8" aria-label="Messages">
              <h2>Messages</h2>
              <button
                type="button"
                className="btn"
                onClick={() => void loadMessages(siteId, selected)}
              >
                Refresh messages
              </button>
              <ol>
                {messages.map((message) => (
                  <li key={message.id} className="my-3 rounded border p-3">
                    <small>
                      {message.sender_id ?? 'System'} ·{' '}
                      {new Date(message.created_at).toLocaleString()}
                    </small>
                    <p className="whitespace-pre-wrap">
                      {message.body_html.replace(/<[^>]*>/g, '')}
                    </p>
                  </li>
                ))}
              </ol>
              <form onSubmit={send} className="mt-4">
                <label className="block">
                  New message
                  <textarea
                    className="form-input block w-full"
                    required
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </label>
                <button className="btn mt-2" type="submit">
                  Send message
                </button>
              </form>
            </section>
          )}
        </>
      )}
      <section className="mt-8" aria-label="Conversation security">
        <h2>Conversation security</h2>
        <p>
          Messages use TLS in transit and server storage protection at rest. They are not end-to-end
          encrypted.
        </p>
      </section>
    </main>
  )
}
