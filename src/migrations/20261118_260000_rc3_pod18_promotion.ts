import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-18 (POD-REQ-38/39/40): promotion through shared systems.
 *
 * - `podcast_episodes` gain `promotion` (jsonb: the per-episode
 *   promotion state written by src/modules/podcast-studio/promotion.ts
 *   — { socialOptIn, socialDraftId, socialStatus, socialEnqueuedAt,
 *   socialError, newsletterDraftId, newsletterComposedAt }). No new
 *   tables: social drafts/variants/queue items live in the social
 *   system's own collections and newsletter drafts in email-messages.
 *
 * Rollback note: `down` drops exactly that column — episodes lose
 * their promotion opt-in/status record (the social drafts and
 * newsletter drafts themselves survive in their own systems).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_episodes" ADD COLUMN IF NOT EXISTS "promotion" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "podcast_episodes" DROP COLUMN IF EXISTS "promotion";
  `)
}
