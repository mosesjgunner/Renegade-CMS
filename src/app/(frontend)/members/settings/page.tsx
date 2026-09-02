'use client'

import { FormEvent, useEffect, useState } from 'react'

export default function MemberSettingsPage() {
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  useEffect(() => { void fetch('/api/member-auth/me').then(async r => r.ok ? setProfile(await r.json().then(x => x.profile ?? {})) : setMessage('Sign in required.')) }, [])
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const response = await fetch('/api/member-auth/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) }); setMessage(response.ok ? 'Profile saved.' : (await response.json()).error ?? 'Could not save profile.') }
  async function deactivate() { const response = await fetch('/api/member-auth/deactivate', { method: 'POST' }); setMessage(response.ok ? 'Account deactivated.' : 'Could not deactivate account.') }
  return <main className="max-w-xl mx-auto px-6 py-16"><h1 className="text-3xl font-bold">Member settings</h1><form onSubmit={save} className="mt-6 grid gap-4"><label>Display name<input aria-label="Display name" className="form-input" value={profile.displayName ?? ''} onChange={e => setProfile({ ...profile, displayName: e.target.value })} /></label><label>Handle<input aria-label="Handle" className="form-input" value={profile.handle ?? ''} onChange={e => setProfile({ ...profile, handle: e.target.value })} /></label><label>Bio<textarea aria-label="Bio" className="form-input" value={profile.bio ?? ''} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></label><label>Visibility<select aria-label="Visibility" className="form-input" value={profile.visibility ?? 'private'} onChange={e => setProfile({ ...profile, visibility: e.target.value })}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label><button className="btn btn-primary" type="submit">Save profile</button></form><button className="btn mt-8" onClick={deactivate}>Deactivate account</button>{message ? <p role="status" className="mt-4">{message}</p> : null}</main>
}
