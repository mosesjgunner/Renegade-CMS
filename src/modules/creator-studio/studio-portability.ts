import type { Payload } from 'payload'

import { creatorWorkspace } from './workspace'
import { listPortfolios } from './portfolio-service'
import { listEditProjects, requireEdit } from './media-edit-projects'
import { listExternalVideos } from './external-video'
import type { SubmissionActor } from './submission-targets'

export async function exportStudioIndex(payload: Payload, actor: SubmissionActor) {
  const workspace = await creatorWorkspace(payload, actor.siteId, actor.memberId)
  const [portfolios, edits, providers, catalog] = await Promise.allSettled([
    listPortfolios(payload, actor),
    requireEdit(payload, actor).then(() => listEditProjects(payload, actor)),
    listExternalVideos(payload, actor),
    payload.db.pool.query<{
      release: string
      source: string
      kind: string
      products: string[]
      published: boolean
    }>(
      `SELECT r.id AS release, c.source_id AS source, c.source_kind AS kind,
        c.entries->'products' AS products, c.published
       FROM creator_release_catalog c JOIN content_releases r ON r.id=c.release_id
       WHERE r.site_id=$1 AND r.owner_id=$2 ORDER BY r.created_at DESC LIMIT 50`,
      [actor.siteId, actor.memberId],
    ),
  ])
  return {
    format: 'renegade-studio-index',
    version: 1,
    membership: {
      site: actor.siteId,
      member: actor.memberId,
      profile: workspace.handle,
      space: workspace.space?.id ?? null,
    },
    portfolios:
      portfolios.status === 'fulfilled'
        ? portfolios.value.entries.map(({ id, collection, title }) => ({
            id,
            collection,
            title,
            export:
              '/api/creator-studio/portfolio?collection=' + collection + '&id=' + id + '&export=1',
          }))
        : null,
    projects:
      edits.status === 'fulfilled'
        ? edits.value.map(({ id, title }) => ({
            id,
            title,
            export: '/api/creator-studio/media-edits?id=' + id + '&bundle=1',
          }))
        : null,
    providers:
      providers.status === 'fulfilled' && providers.value.canManage
        ? providers.value.items.map(({ id, contentId, provider, availability }) => ({
            source: id,
            content: contentId,
            provider,
            availability,
          }))
        : null,
    catalog: catalog.status === 'fulfilled' ? catalog.value.rows : null,
  }
}
