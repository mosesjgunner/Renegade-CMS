'use client'

import { ConfirmDestructive } from './forms'

/** Trash retains immutable revision history while removing all public access. */
export default function TrashContentAction({ contentId }: { contentId: string }) {
  const trash = async () => {
    const response = await fetch(`/api/content/${encodeURIComponent(contentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'archived',
        retentionMode: 'tombstone',
        removeFromDiscovery: true,
      }),
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.errors?.[0]?.message || 'Could not move content to trash.')
    window.location.reload()
  }
  // UXI-08: the shared destructive-confirmation pattern — scope and
  // consequence in plain language before anything runs. Trash here
  // retains revision history, but this surface exposes no restore, so
  // no undo is offered (the kit only offers undo where a real one exists).
  return (
    <ConfirmDestructive
      triggerLabel="Move to trash"
      scope="This content item"
      consequence="It is removed from the site and from discovery, and its revision history is kept. There is no restore button here, so treat this as final from this screen."
      confirmLabel="Confirm move to trash"
      onConfirm={trash}
    />
  )
}
