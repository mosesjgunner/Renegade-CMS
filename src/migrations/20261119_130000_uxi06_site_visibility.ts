import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * UXI-06 (UX-INSTALL remainder, Stage 4): site-level visibility policy.
 *
 * Additive only — one new column on `sites`:
 *
 * - `visibility` (varchar, NOT NULL, DEFAULT 'public'): one of
 *   'public' | 'coming-soon' | 'private'. The DEFAULT preserves today's
 *   behavior for every existing site (public); the policy becomes
 *   non-public only when an operator explicitly chooses it in setup or
 *   site settings. Enforcement lives at the public render boundary
 *   (src/modules/public/site-visibility.ts), not in this column.
 *
 * Rollback note: `down` drops exactly this column; sites fall back to
 * the pre-policy behavior (public rendering governed by lifecycle and
 * per-record visibility only).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "visibility" varchar DEFAULT 'public' NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "sites" DROP COLUMN IF EXISTS "visibility";
  `)
}
