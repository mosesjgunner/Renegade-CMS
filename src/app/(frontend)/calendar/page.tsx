'use client'

import React from 'react'
import Link from 'next/link'
import { CalendarCenter } from '@/modules/admin/CalendarCenter'
import type { CalendarProjection } from '@/modules/calendar/contracts'

const initialEntries: CalendarProjection[] = [
  {
    id: 'release:example-1',
    sourceType: 'content-release',
    sourceId: 'rel-001',
    siteId: 'site-alpha',
    publicationId: 'pub-daily',
    title: 'Release: Autumn Feature Series',
    startsAt: '2026-09-21T14:00:00.000Z',
    timeZone: 'America/Chicago',
    status: 'scheduled',
    editHref: '/admin/collections/content-releases/rel-001',
  },
  {
    id: 'article:example-2',
    sourceType: 'content',
    sourceId: 'art-002',
    siteId: 'site-alpha',
    publicationId: 'pub-daily',
    title: 'Editorial: The Future of Independent Media',
    startsAt: '2026-09-22T15:30:00.000Z',
    timeZone: 'America/Chicago',
    status: 'approved',
    editHref: '/admin/collections/article-family-content/art-002',
  },
  {
    id: 'social:example-3',
    sourceType: 'social-queue-item',
    sourceId: 'soc-003',
    siteId: 'site-alpha',
    publicationId: 'pub-daily',
    title: 'Social: Community Announcement',
    startsAt: '2026-09-23T16:00:00.000Z',
    timeZone: 'America/Chicago',
    status: 'scheduled',
    editHref: '/social-studio',
  },
  {
    id: 'event:example-4',
    sourceType: 'event',
    sourceId: 'evt-004',
    siteId: 'site-alpha',
    title: 'Public Townhall Livestream',
    startsAt: '2026-09-24T18:00:00.000Z',
    timeZone: 'America/Chicago',
    status: 'published',
    editHref: '/admin/collections/events/evt-004',
  },
]

export default function CalendarPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex justify-between items-center pb-2 border-b border-stone-200 dark:border-stone-800">
        <span className="text-xs text-stone-500">Renegade CMoS Workflow Pass FLOW-03</span>
        <div className="flex gap-2">
          <Link
            href="/api/calendar/export?format=ics"
            className="px-3 py-1 text-xs font-medium rounded border border-stone-300 hover:bg-stone-100"
          >
            Export iCal (.ics)
          </Link>
          <Link
            href="/api/calendar/export?format=json"
            className="px-3 py-1 text-xs font-medium rounded border border-stone-300 hover:bg-stone-100"
          >
            JSON Feed
          </Link>
        </div>
      </div>

      <CalendarCenter initialEntries={initialEntries} />
    </main>
  )
}
